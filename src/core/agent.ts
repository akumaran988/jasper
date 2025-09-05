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
${this.context.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

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
- If tools fail, explain and set should_continue appropriately`;
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
    this.context.messages.push({
      role: 'assistant',
      content: JSON.stringify({
        content: response.content,
        tool_calls: response.tool_calls,
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
        // Format results like Claude Code with proper success indication
        let formattedResult = '';
        
        if (result.result && typeof result.result === 'object') {
          if (result.result.stdout) {
            formattedResult = result.result.stdout;
          } else if (result.result.result) {
            formattedResult = typeof result.result.result === 'string' ? 
              result.result.result : 
              JSON.stringify(result.result.result, null, 2);
          } else {
            formattedResult = JSON.stringify(result.result, null, 2);
          }
        } else {
          formattedResult = String(result.result || '');
        }
        
        return `Tool ${result.id} (${toolName}) succeeded:\n${formattedResult}`;
      } else {
        return `Tool ${result.id} (${toolName}) failed: ${result.error}`;
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
        console.log(`🤖 Processing iteration ${this.context.currentIteration}/${this.context.maxIterations}`);
        
        // Apply API throttling
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        if (timeSinceLastCall < this.apiThrottleMs) {
          const waitTime = this.apiThrottleMs - timeSinceLastCall;
          console.log(`⏳ Throttling API call, waiting ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Get AI response
        this.lastApiCall = Date.now();
        const aiResponse = await this.llmProvider.generateResponse(
          this.context.messages,
          this.context.tools
        );

        // Add assistant's response to conversation
        this.addAssistantMessage(aiResponse);

        // Execute any tool calls with user permission
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
          console.log(`🔧 Found ${aiResponse.tool_calls.length} tool calls, requesting permission...`);
          
          // Request permission for each tool call
          const approvedToolCalls = [];
          for (const toolCall of aiResponse.tool_calls) {
            const permission = await this.requestToolPermission(toolCall);
            if (permission) {
              approvedToolCalls.push(toolCall);
            }
          }
          
          let toolResults: any[] = [];
          
          if (approvedToolCalls.length > 0) {
            console.log(`🔧 Executing ${approvedToolCalls.length} approved tool calls...`);
            toolResults = await globalToolRegistry.executeMultiple(approvedToolCalls);
            this.addToolResults(toolResults);
            
            // Check if any tools failed critically
            const criticalFailures = toolResults.filter(result => !result.success && this.isCriticalFailure(result));
            if (criticalFailures.length > 0) {
              console.warn(`⚠️  Critical tool failures detected, ending iteration cycle`);
              break;
            }
          } else {
            console.log('⚠️ No tool calls approved by user');
            this.addToolResults([{
              id: 'permission_denied',
              success: false,
              error: 'User denied permission to execute tools',
              result: null
            }]);
          }
        }

        // Check if we should continue
        if (!aiResponse.should_continue) {
          console.log(`✅ AI indicated completion at iteration ${this.context.currentIteration}`);
          break;
        }

        // If no tool calls and should continue, something might be wrong
        if (!aiResponse.tool_calls || aiResponse.tool_calls.length === 0) {
          console.log(`ℹ️  No tool calls but should_continue=true, ending cycle`);
          break;
        }

      } catch (error) {
        console.error(`❌ Error in iteration ${this.context.currentIteration}:`, error);
        
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
      console.warn(`⚠️  Reached maximum iterations (${this.context.maxIterations})`);
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