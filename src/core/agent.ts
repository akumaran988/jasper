import { LLMProvider, Message, ConversationContext, AIResponse, ToolCall, ToolResult } from '../types/index.js';
import { globalToolRegistry } from './tools.js';

export class ConversationAgent {
  private llmProvider: LLMProvider;
  private systemPrompt: string;
  private context: ConversationContext;
  private onRequestPermission?: (toolCall: ToolCall) => Promise<boolean>;
  private lastApiCall: number = 0;
  private apiThrottleMs: number = 3000; // 3 seconds default

  constructor(
    llmProvider: LLMProvider, 
    maxIterations: number = 10, 
    onRequestPermission?: (toolCall: ToolCall) => Promise<boolean>,
    apiThrottleMs: number = 3000
  ) {
    this.llmProvider = llmProvider;
    this.onRequestPermission = onRequestPermission;
    this.apiThrottleMs = apiThrottleMs;
    this.context = {
      messages: [],
      tools: globalToolRegistry.getAll(),
      maxIterations,
      currentIteration: 0
    };
    
    this.systemPrompt = this.buildSystemPrompt();
    this.addSystemMessage(this.systemPrompt);
  }

  private buildSystemPrompt(): string {
    return `You are Jasper, a conversational AI development assistant similar to Claude Code. You help developers with their coding tasks through multi-step, tool-assisted conversations.

CONVERSATION FLOW:
1. You receive a user message and respond with content + optional tool calls
2. User will be asked for permission before ANY tool is executed
3. Tool results are added to conversation history
4. Process repeats based on should_continue flag
5. Maximum ${this.context.maxIterations} iterations per conversation

TOOL EXECUTION PERMISSIONS:
- ALL tool calls require explicit user approval
- User will see: tool name, parameters, and description
- User can approve/deny each tool individually
- Denied tools get "permission denied" error in results
- Only approved tools will execute

CRITICAL: should_continue FIELD CONTROLS CONVERSATION LOOP:
- Set should_continue=true when:
  * You need to execute tools and process their results
  * Task requires multiple steps or follow-up actions
  * You're waiting for tool results to continue
- Set should_continue=false when:
  * Task is completely finished
  * No further processing needed
  * User question is fully answered
  * Error state that can't be recovered

Available Tools:
${this.context.tools.map(tool => {
  const schema = JSON.stringify(tool.parameters, null, 2);
  return `- ${tool.name}: ${tool.description}
  Parameters Schema:
  ${schema}`;
}).join('\n\n')}

Response Format (STRICTLY REQUIRED):
{
  "content": "Your response to user (explain what you're doing/planning)",
  "tool_calls": [
    {
      "id": "call_" + timestamp + "_" + random_string,
      "name": "tool_name", 
      "parameters": { "param": "value" }
    }
  ],
  "should_continue": true/false,
  "reasoning": "Why you chose these actions and should_continue value"
}

IMPORTANT RULES:
- ALWAYS use should_continue correctly to control conversation flow
- Be explicit about what you're doing and why
- User must approve tools - explain what each tool will do
- Generate unique IDs for tool calls (timestamp + random)
- If tools fail, explain and set should_continue appropriately

TOOL USAGE EXAMPLES:
User: "Can you ping google for me?"
CORRECT Response:
{
  "content": "I'll ping Google to check the connection for you.",
  "tool_calls": [
    {
      "id": "call_1234567890_abc123",
      "name": "bash",
      "parameters": {"command": "ping -c 4 google.com", "timeout": 10}
    }
  ],
  "should_continue": true,
  "reasoning": "User requested to ping Google, so I need to execute the bash tool with ping command"
}

User: "Create a README file in my project"
CORRECT Response:
{
  "content": "I'll create a README.md file for your project.",
  "tool_calls": [
    {
      "id": "call_1234567890_def456",
      "name": "file_ops",
      "parameters": {
        "operation": "create",
        "file_path": "/path/to/README.md",
        "content": "# Project Name\n\nProject description..."
      }
    }
  ],
  "should_continue": true,
  "reasoning": "User wants to create a README file, using file_ops with operation=create"
}

WRONG Response (DON'T DO THIS):
{
  "content": "I can help with that. I will use the bash tool to ping google.com.",
  "tool_calls": [],
  "should_continue": false,
  "reasoning": "Just explaining what I would do"
}

CRITICAL: When user asks you to DO something (ping, list files, run commands, etc.), you MUST include the actual tool_calls in your response. Don't just talk about what you would do - actually do it by calling the appropriate tools!`;
  }

  private addSystemMessage(content: string): void {
    this.context.messages.push({
      role: 'system',
      content,
      timestamp: new Date()
    });
  }

  addUserMessage(content: string): void {
    this.context.messages.push({
      role: 'user',
      content,
      timestamp: new Date()
    });
  }

  private addAssistantMessage(response: AIResponse): void {
    // Store response with proper structure, but avoid double-encoding
    this.context.messages.push({
      role: 'assistant',
      content: JSON.stringify({
        content: response.content,
        tool_calls: response.tool_calls || [],
        reasoning: response.reasoning
      }),
      timestamp: new Date()
    });
  }

  private addToolResults(toolResults: ToolResult[]): void {
    const resultsMessage = toolResults.map(result => {
      // Get the tool name from the result ID or tool registry
      const toolName = result.id.includes('_') ? 
        result.id.split('_')[0] : 
        globalToolRegistry.getAll().find(t => t.name)?.name || 'unknown';
      
      if (result.success) {
        // Always format results as JSON for consistent parsing in the renderer
        const jsonResult = JSON.stringify(result.result, null, 2);
        return `Tool ${result.id} (${toolName}) succeeded:\n${jsonResult}`;
      } else {
        // For failed results, also format as JSON for consistent parsing
        const errorResult = {
          success: false,
          error: result.error,
          stderr: result.result?.stderr || '',
          command: result.result?.command || '',
          exitCode: result.result?.exitCode || 1,
          stack: result.result?.stack || ''
        };
        const jsonResult = JSON.stringify(errorResult, null, 2);
        return `Tool ${result.id} (${toolName}) failed:\n${jsonResult}`;
      }
    }).join('\n\n');

    this.context.messages.push({
      role: 'system',
      content: `Tool execution results:\n${resultsMessage}`,
      timestamp: new Date()
    });
  }

  async processMessage(userInput: string): Promise<ConversationContext> {
    this.addUserMessage(userInput);
    this.context.currentIteration = 0;

    while (this.context.currentIteration < this.context.maxIterations) {
      this.context.currentIteration++;
      
      try {
        // Apply API throttling
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        if (timeSinceLastCall < this.apiThrottleMs) {
          const waitTime = this.apiThrottleMs - timeSinceLastCall;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Get AI response
        this.lastApiCall = Date.now();
        const aiResponse = await this.llmProvider.generateResponse(
          this.context.messages,
          this.context.tools
        );

        // AI response received

        // Add assistant's response to conversation
        this.addAssistantMessage(aiResponse);

        // Execute tool calls sequentially with individual permission and results
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
          for (const toolCall of aiResponse.tool_calls) {
            // Request permission for this specific tool call
            const permission = await this.requestToolPermission(toolCall);
            
            if (permission) {
              // Execute this single tool call
              const toolResults = await globalToolRegistry.executeMultiple([toolCall]);
              this.addToolResults(toolResults);
              
              // Check if this tool failed critically
              const criticalFailures = toolResults.filter(result => !result.success && this.isCriticalFailure(result));
              if (criticalFailures.length > 0) {
                break; // Stop executing remaining tools if critical failure
              }
            } else {
              // Add a denial result for this specific tool
              this.addToolResults([{
                id: toolCall.id || 'permission_denied',
                success: false,
                error: 'User denied permission to execute this tool',
                result: null
              }]);
              
              // Continue to ask for permission for remaining tools
            }
          }
        }

        // Check if we should continue
        if (!aiResponse.should_continue) {
          break;
        }

        // If no tool calls and should continue, something might be wrong
        if (!aiResponse.tool_calls || aiResponse.tool_calls.length === 0) {
          break;
        }

      } catch (error) {
        
        this.addAssistantMessage({
          content: `I encountered an error: ${error instanceof Error ? error.message : String(error)}`,
          tool_calls: [],
          reasoning: "Error occurred during processing",
          should_continue: false
        });
        
        break;
      }
    }

    if (this.context.currentIteration >= this.context.maxIterations) {
      this.addAssistantMessage({
        content: "I've reached the maximum number of iterations for this conversation. The task may be too complex or require user intervention.",
        tool_calls: [],
        reasoning: "Maximum iterations reached",
        should_continue: false
      });
    }

    return this.context;
  }

  private async requestToolPermission(toolCall: ToolCall): Promise<boolean> {
    if (this.onRequestPermission) {
      return await this.onRequestPermission(toolCall);
    }
    // Default: auto-approve if no permission callback is set
    return true;
  }

  private isCriticalFailure(result: ToolResult): boolean {
    // Define what constitutes a critical failure
    // For now, we'll be lenient and not treat any single failure as critical
    return false;
  }

  getContext(): ConversationContext {
    return { ...this.context };
  }

  reset(): void {
    this.context.messages = [];
    this.context.currentIteration = 0;
    this.addSystemMessage(this.systemPrompt);
  }

  setMaxIterations(max: number): void {
    this.context.maxIterations = max;
  }
}