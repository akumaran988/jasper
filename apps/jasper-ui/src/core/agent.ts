import { LLMProvider, ConversationContext, AIResponse, ToolCall, ToolResult, CompactionResult } from '../types/index.js';
import { globalToolRegistry } from './tools.js';
import { countConversationTokens, getActualLLMTokenCount } from '../utils/tokenCounter.js';
import { createCompactionStrategy, DEFAULT_COMPACTION_CONFIG, CompactionConfig } from '../utils/compactionStrategy.js';

export class ConversationAgent {
  private llmProvider: LLMProvider;
  private systemPrompt: string;
  private context: ConversationContext;
  private onRequestPermission?: (toolCall: ToolCall) => Promise<boolean>;
  private onContextUpdate?: (context: ConversationContext) => void;
  private lastApiCall: number = 0;
  private apiThrottleMs: number = 3000; // 3 seconds default
  private compactionStrategy = createCompactionStrategy();
  private compactionConfig: CompactionConfig = DEFAULT_COMPACTION_CONFIG;

  constructor(
    llmProvider: LLMProvider, 
    maxIterations: number = 10, 
    onRequestPermission?: (toolCall: ToolCall) => Promise<boolean>,
    apiThrottleMs: number = 3000,
    onContextUpdate?: (context: ConversationContext) => void,
    compactionConfig?: Partial<CompactionConfig>
  ) {
    this.llmProvider = llmProvider;
    this.onRequestPermission = onRequestPermission;
    this.onContextUpdate = onContextUpdate;
    this.apiThrottleMs = apiThrottleMs;
    
    // Merge custom compaction config with defaults
    if (compactionConfig) {
      this.compactionConfig = { ...DEFAULT_COMPACTION_CONFIG, ...compactionConfig };
    }
    this.context = {
      messages: [],
      allMessages: [],
      lastCompactionIndex: 0,
      tools: globalToolRegistry.getAll(),
      maxIterations,
      currentIteration: 0,
      tokenCount: 0
    };
    
    this.systemPrompt = this.buildSystemPrompt();
    this.addSystemMessage(this.systemPrompt);
  }

  private buildSystemPrompt(): string {
    return `You are Jasper, a highly intelligent conversational AI development assistant. You help developers with their coding tasks through multi-step, tool-assisted conversations.

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
IMPORTANT: should_continue is a TECHNICAL FIELD - NEVER mention it in your content to users!

- Set should_continue=true when:
  * You have tool_calls in your response (ALWAYS true if tool_calls exist)
  * You need to execute tools and process their results
  * Task requires multiple steps or follow-up actions
  * You're waiting for tool results to continue
- Set should_continue=false when:
  * Task is completely finished AND no tool_calls in response
  * No further processing needed AND no tool_calls in response
  * User question is fully answered AND no tool_calls in response
  * Error state that can't be recovered

CRITICAL: If you include ANY tool_calls in your response, should_continue MUST be true!

DO NOT mention should_continue in your "content" field - users should never see this technical detail.


${this.buildTodoGuidance()}

Available Tools:
${this.context.tools.map(tool => {
  const schema = JSON.stringify(tool.parameters, null, 2);
  let toolDesc = `- ${tool.name}: ${tool.description}
  Parameters Schema:
  ${schema}`;

  // Add tool-specific AI prompt if available
  if (tool.prompt) {
    toolDesc += `\n  AI GUIDANCE: ${tool.prompt}`;
  }

  return toolDesc;
}).join('\n\n')}

Response Format (STRICTLY REQUIRED):
CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Do not include "ASSISTANT:" or any other prefixes.

Your response must be a single valid JSON object with this exact structure:
{
  "content": "Your response to user (explain what you're doing/planning) - NEVER mention should_continue here!",
  "tool_calls": [
    {
      "id": "call_" + timestamp + "_" + random_string,
      "name": "tool_name", 
      "parameters": { "param": "value" }
    }
  ],
  "should_continue": true/false,
  "reasoning": "Why you chose these actions and should_continue value (internal only)"
}

IMPORTANT RULES:
- Start your response directly with { and end with }
- No "ASSISTANT:" prefix, no markdown code blocks, no additional text
- ALWAYS use should_continue correctly to control conversation flow
- Be explicit about what you're doing and why in "content"
- User must approve tools - explain what each tool will do
- Generate unique IDs for tool calls (timestamp + random)
- If tools fail, explain and set should_continue appropriately
- NEVER mention should_continue, reasoning, or any technical JSON fields in your "content" - users only see "content"

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

WRONG Response (DON'T DO THIS - missing tool calls):
{
  "content": "I can help with that. I will use the bash tool to ping google.com.",
  "tool_calls": [],
  "should_continue": false,
  "reasoning": "Just explaining what I would do"
}

WRONG Response (DON'T DO THIS - exposing technical fields to user):
{
  "content": "I found the files. I will set should_continue to false since the task is complete.",
  "tool_calls": [],
  "should_continue": false,
  "reasoning": "Task completed"
}

CRITICAL ACTION REQUIREMENT:
When you say "I will do X" or "I'll X" in your content, you MUST include the tool_call to actually DO X in the same response. 
NEVER defer tool execution to future responses. If you mention an action, execute it immediately.

Examples of MANDATORY immediate action:
- "I will list the files" → MUST include file_ops tool_call
- "I'll ping the server" → MUST include bash tool_call  
- "I will read the file" → MUST include file_ops tool_call
- "Let me check the directory" → MUST include file_ops tool_call

CRITICAL: When user asks you to DO something (ping, list files, run commands, etc.), you MUST include the actual tool_calls in your response. Don't just talk about what you would do - actually do it by calling the appropriate tools!`;
  }

  private buildTodoGuidance(): string {
    // Check if todo tools are available
    const todoTools = this.context.tools.filter(tool =>
      tool.name === 'todo_ops'
    );

    if (todoTools.length === 0) {
      return ''; // No todo tools available, don't include guidance
    }

    return `
TASK PLANNING AND TODO MANAGEMENT:
CRITICAL: You have access to todo management tools for complex, multi-step tasks. USE THEM PROACTIVELY!

WHEN TO USE TODO TOOLS:
- ALWAYS use todo_ops with operation="create" when starting complex tasks requiring 3+ steps
- Break down large tasks into specific, actionable todo items
- Create todos BEFORE beginning work to track progress
- Mark todos as "in_progress" using todo_ops with operation="update_status" when starting work
- Mark todos as "completed" using todo_ops with operation="update_status" when finished
- Use todo_ops with operation="list" to check current progress and remaining tasks

TODO USAGE PATTERN:
1. User requests complex task → IMMEDIATELY create ALL todos at once using create_batch operation
2. Start work → Mark first todo as "in_progress" using update_status
3. Complete step → Mark as "completed", move to next todo
4. Continue until all todos are completed

BATCH CREATION:
- Use todo_ops with operation="create_batch" and todos=[{title, description, priority}] for multiple todos
- This is MORE EFFICIENT than multiple create calls
- Example: {"operation": "create_batch", "todos": [{"title": "Step 1"}, {"title": "Step 2"}]}

EXAMPLES OF WHEN TO USE TODOS:
✅ "Implement user authentication system" → Create todos for: database setup, auth routes, password hashing, session management, testing
✅ "Set up development environment" → Create todos for: install dependencies, configure database, setup environment variables, run initial tests
✅ "Debug and fix performance issues" → Create todos for: identify bottlenecks, profile code, optimize database queries, test performance improvements
✅ "Deploy application to production" → Create todos for: build application, configure server, setup CI/CD, deploy and verify

❌ "What is the current time?" → Single simple query, no todos needed
❌ "Show me the file contents" → Single action, no todos needed

IMPORTANT: Create todos at the START of complex tasks, not at the end. This helps track progress and ensures nothing is forgotten.`;
  }

  private addSystemMessage(content: string): void {
    const message = {
      role: 'system' as const,
      content,
      timestamp: new Date()
    };
    this.context.messages.push(message);
    this.context.allMessages.push(message);
    this.updateTokenCount();
  }

  addUserMessage(content: string): void {
    const message = {
      role: 'user' as const,
      content,
      timestamp: new Date()
    };
    this.context.messages.push(message);
    this.context.allMessages.push(message);
    this.updateTokenCount();
    
    // Immediately notify UI of the user message addition
    if (this.onContextUpdate) {
      this.onContextUpdate({ ...this.context });
    }
  }

  private addAssistantMessage(response: AIResponse): void {
    // Store response with proper structure, but avoid double-encoding
    const message = {
      role: 'assistant' as const,
      content: JSON.stringify({
        content: response.content,
        tool_calls: response.tool_calls || [],
        reasoning: response.reasoning
      }),
      timestamp: new Date()
    };
    this.context.messages.push(message);
    this.context.allMessages.push(message);
    this.updateTokenCount();
  }

  private addToolResults(toolResults: ToolResult[]): void {
    // Create a clean structured message with tool results
    const message = {
      role: 'system' as const,
      content: `Tool execution results: ${toolResults.length} results`,
      toolResults: toolResults,
      timestamp: new Date()
    };
    
    this.context.messages.push(message);
    this.context.allMessages.push(message);
    this.updateTokenCount();
  }

  private updateTokenCount(): void {
    this.context.tokenCount = countConversationTokens(this.context.messages);
  }

  private async checkAndCompactConversation(): Promise<void> {
    if (this.compactionStrategy.shouldCompact(this.context.messages, this.compactionConfig)) {
      await this.compactConversation();
    }
  }

  private async compactConversation(): Promise<void> {
    // Don't compact if we've already compacted recently (less than min messages ago)
    if (this.context.allMessages.length - this.context.lastCompactionIndex < this.compactionConfig.minMessagesBeforeCompaction) {
      return;
    }

    // Notify UI that compaction is starting
    if (this.onContextUpdate) {
      this.onContextUpdate({ ...this.context, isCompacting: true });
    }

    try {
      // Get messages to compact (exclude system message)
      const messagesToCompact = this.context.messages.filter(m => 
        m.role !== 'system' || !m.content.startsWith('You are Jasper')
      );

      if (messagesToCompact.length < this.compactionConfig.minMessagesBeforeCompaction) {
        if (this.onContextUpdate) {
          this.onContextUpdate({ ...this.context, isCompacting: false });
        }
        return;
      }

      // Use intelligent compaction strategy
      const compactionResult = await this.compactionStrategy.compactMessages(
        messagesToCompact, 
        this.llmProvider,
        this.compactionConfig
      );

      // Create compaction message for UI display
      const compactionMessage = {
        role: 'system' as const,
        content: '===================== Previous Conversation Compacted =====================',
        compactionResult: compactionResult,
        timestamp: new Date()
      };

      // Add to allMessages for UI display (not to messages for AI context)
      this.context.allMessages.push(compactionMessage);
      
      // Store the compacted summary for reference
      this.context.compactedSummary = compactionResult.summary;
      this.context.lastCompactionIndex = this.context.allMessages.length;

      // Replace messages for AI context (keep system prompt + summary + recent messages)
      const systemPrompt = this.context.messages.find(m => 
        m.role === 'system' && m.content.startsWith('You are Jasper')
      );
      
      const recentMessages = this.context.messages.slice(-3); // Keep last 3 messages
      
      // Create AI context with compacted summary and tool summaries
      const toolSummariesText = compactionResult.toolSummaries.length > 0 
        ? `\n\nTool actions taken:\n${compactionResult.toolSummaries.map(tool => `- ${tool.summary}`).join('\n')}`
        : '';
      
      this.context.messages = [
        ...(systemPrompt ? [systemPrompt] : []),
        {
          role: 'system' as const,
          content: `======================================== Previous Conversation Compacted ========================================\n${compactionResult.summary}${toolSummariesText}`,
          timestamp: new Date()
        },
        ...recentMessages
      ];

      this.updateTokenCount();

      // Notify UI of compaction completion
      if (this.onContextUpdate) {
        this.onContextUpdate({ ...this.context, isCompacting: false });
      }

    } catch (error) {
      console.warn('Failed to compact conversation:', error);
      
      // Create failed compaction result
      const failedCompactionResult: CompactionResult = {
        summary: `Compaction failed: ${error instanceof Error ? error.message : String(error)}`,
        toolSummaries: [],
        messagesCompacted: 0,
        originalTokens: this.context.tokenCount,
        compactedTokens: 0,
        timestamp: new Date()
      };

      // Add failed compaction message to UI
      const failedCompactionMessage = {
        role: 'system' as const,
        content: '===================== Conversation Compaction Failed =====================',
        compactionResult: failedCompactionResult,
        timestamp: new Date()
      };
      this.context.allMessages.push(failedCompactionMessage);
      
      // Notify UI that compaction failed/ended
      if (this.onContextUpdate) {
        this.onContextUpdate({ ...this.context, isCompacting: false });
      }
    }
  }

  async processMessage(userInput: string): Promise<ConversationContext> {
    this.addUserMessage(userInput);
    
    // Check if this is a continuation request after hitting iteration limit
    const isContinueRequest = this.isContinueRequest(userInput);
    if (isContinueRequest) {
      // Reset iteration counter to allow another full cycle
      this.context.currentIteration = 0;
      
      // User requested continuation - reset iteration counter
      
      // Add a system message to acknowledge the continuation
      this.addAssistantMessage({
        content: "Continuing with the task. I'll proceed with another round of iterations to help complete your request.",
        tool_calls: [],
        reasoning: "User requested continuation after iteration limit",
        should_continue: true
      });
      
      // Notify UI of context update
      if (this.onContextUpdate) {
        this.onContextUpdate({ ...this.context });
      }
    } else {
      // Normal message processing - reset iteration counter
      this.context.currentIteration = 0;
    }
    
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

        // If there's content but no tool calls, add the assistant message
        if (!aiResponse.tool_calls || aiResponse.tool_calls.length === 0) {
          this.addAssistantMessage(aiResponse);
          
          // Notify UI immediately
          if (this.onContextUpdate) {
            this.onContextUpdate({ ...this.context });
          }
        } else {
          // If there's both content and tool calls, add content first
          if (aiResponse.content && aiResponse.content.trim()) {
            const contentOnlyResponse = {
              ...aiResponse,
              tool_calls: [] // Don't show tool calls in this message
            };
            this.addAssistantMessage(contentOnlyResponse);
            
            // Notify UI of content update
            if (this.onContextUpdate) {
              this.onContextUpdate({ ...this.context });
            }
          }
        }

        // Execute tool calls sequentially with individual messages
        if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
          for (const toolCall of aiResponse.tool_calls) {
            // Ensure every tool call has a unique ID
            if (!toolCall.id) {
              toolCall.id = `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            }
            // Add individual tool call message
            const toolCallMessage = {
              content: "",
              tool_calls: [toolCall],
              reasoning: `Executing ${toolCall.name}`,
              should_continue: true
            };
            this.addAssistantMessage(toolCallMessage);
            
            // Notify UI of tool call display
            if (this.onContextUpdate) {
              this.onContextUpdate({ ...this.context });
            }
            
            // Request permission for this specific tool call
            const permission = await this.requestToolPermission(toolCall);
            
            if (permission) {
              // Execute this single tool call
              const toolResults = await globalToolRegistry.executeMultiple([toolCall]);
              
              this.addToolResults(toolResults);
              
              // Notify UI of tool result immediately
              if (this.onContextUpdate) {
                this.onContextUpdate({ ...this.context });
              }
              
              // Note: Compaction will happen at the end of processMessage, not after each tool
              
              // Check if this tool failed critically
              const criticalFailures = toolResults.filter(result => !result.success && this.isCriticalFailure(result));
              if (criticalFailures.length > 0) {
                break; // Stop executing remaining tools if critical failure
              }
            } else {
              // Add a denial result for this specific tool
              this.addToolResults([{
                id: `${toolCall.name}_permission_denied_${Date.now()}`,
                toolName: toolCall.name,
                success: false,
                error: 'User denied permission to execute this tool',
                result: null
              }]);
              
              // Notify UI of permission denial immediately
              if (this.onContextUpdate) {
                this.onContextUpdate({ ...this.context });
              }
              
              // Note: Compaction will happen at the end of processMessage, not after each denial
              
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
        content: "I've reached the maximum number of iterations for this conversation. The task may be too complex or require user intervention.\n\nIf you'd like me to continue working on this task, just type 'continue' and I'll start another round of iterations.",
        tool_calls: [],
        reasoning: "Maximum iterations reached",
        should_continue: false
      });
    }

    // Check if we need to compact the conversation AFTER processing the user's request
    // This ensures compaction happens after the AI has completed its response, not before
    await this.checkAndCompactConversation();

    return this.context;
  }

  private async requestToolPermission(toolCall: ToolCall): Promise<boolean> {
    if (this.onRequestPermission) {
      return await this.onRequestPermission(toolCall);
    }
    // Default: auto-approve if no permission callback is set
    return true;
  }

  private isCriticalFailure(_result: ToolResult): boolean {
    // Define what constitutes a critical failure
    // For now, we'll be lenient and not treat any single failure as critical
    return false;
  }

  private isContinueRequest(userInput: string): boolean {
    const trimmedInput = userInput.trim().toLowerCase();
    
    // Check if this is a continuation request
    const continueKeywords = [
      'continue',
      'continue please',
      'please continue', 
      'keep going',
      'go on',
      'proceed',
      'carry on',
      'resume',
      'don\'t stop',
      'keep working'
    ];
    
    return continueKeywords.some(keyword => 
      trimmedInput === keyword || 
      trimmedInput.startsWith(keyword + ' ') ||
      trimmedInput.endsWith(' ' + keyword)
    );
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

  setCompactionConfig(config: Partial<CompactionConfig>): void {
    this.compactionConfig = { ...this.compactionConfig, ...config };
  }

  getCompactionConfig(): CompactionConfig {
    return { ...this.compactionConfig };
  }

  refreshTools(): void {
    // Update tools from the global registry
    this.context.tools = globalToolRegistry.getAll();

    // Rebuild system prompt with updated tool list
    this.systemPrompt = this.buildSystemPrompt();

    // Update the system message with new tools (replace the first system message)
    if (this.context.messages.length > 0 && this.context.messages[0].role === 'system') {
      this.context.messages[0].content = this.systemPrompt;
      this.context.allMessages[0].content = this.systemPrompt;
    }

    this.updateTokenCount();

    // Notify context update callback if present
    if (this.onContextUpdate) {
      this.onContextUpdate(this.context);
    }
  }
}