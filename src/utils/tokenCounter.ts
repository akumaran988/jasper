import { Message, CompactionResult, CompactionToolSummary, LLMProvider } from '../types/index.js';

// Simple token estimation - roughly 4 characters per token for English text
// This is a basic approximation, more sophisticated tokenizers could be used
export function estimateTokens(text: string): number {
  // Remove extra whitespace and count characters
  const cleanText = text.replace(/\s+/g, ' ').trim();
  // Rough estimation: 4 characters per token
  return Math.ceil(cleanText.length / 4);
}

export function countMessageTokens(message: Message): number {
  // Count tokens for role + content + small overhead for formatting
  const roleTokens = estimateTokens(message.role);
  const contentTokens = estimateTokens(message.content);
  const timestampTokens = 2; // Small overhead for timestamp
  
  let toolResultTokens = 0;
  
  // CRITICAL: Include tool results in token count since they're sent to the AI
  if (message.toolResults && message.toolResults.length > 0) {
    // Calculate tokens for the TOOL_RESULTS section that gets sent to AI
    let toolResultText = 'TOOL_RESULTS: [\n';
    
    message.toolResults.forEach(result => {
      toolResultText += '  {\n';
      toolResultText += `    "id": "${result.id}",\n`;
      toolResultText += `    "success": ${result.success},\n`;
      
      if (result.success && result.result) {
        // This is the BIG one - the actual file content/tool output
        toolResultText += `    "result": ${JSON.stringify(result.result, null, 4)},\n`;
      }
      
      if (result.error) {
        toolResultText += `    "error": "${result.error}",\n`;
      }
      
      if (result.executionTime) {
        toolResultText += `    "executionTime": ${result.executionTime}\n`;
      }
      
      toolResultText += '  },\n';
    });
    
    toolResultText += ']\n';
    toolResultTokens = estimateTokens(toolResultText);
  }
  
  return roleTokens + contentTokens + toolResultTokens + timestampTokens;
}

export function countConversationTokens(messages: Message[]): number {
  return messages.reduce((total, message) => total + countMessageTokens(message), 0);
}

// Get the actual token count that will be sent to the LLM (including tool results)
export function getActualLLMTokenCount(messages: Message[], includeSystemPrompt: boolean = true): number {
  const conversationTokens = countConversationTokens(messages);
  
  // Add estimated system prompt tokens if requested
  if (includeSystemPrompt) {
    // System prompt is approximately 1000-1500 tokens (estimated)
    const systemPromptTokens = 1200;
    return conversationTokens + systemPromptTokens;
  }
  
  return conversationTokens;
}

export function shouldCompactConversation(messages: Message[], tokenLimit: number): boolean {
  const totalTokens = countConversationTokens(messages);
  return totalTokens > tokenLimit;
}

export async function createConversationSummary(messages: Message[], _llmProvider?: LLMProvider): Promise<string> {
  // Always use basic summary to keep it short and focused
  return createBasicSummary(messages);
}

function createBasicSummary(messages: Message[]): string {
  // Extremely short summary targeting max 500 tokens (1/4 of 2000 token target)
  const userMessages = messages.filter(m => m.role === 'user');
  const toolMessages = messages.filter(m => m.role === 'system' && m.content.startsWith('Tool execution results:'));
  
  // Get last few user requests, keep very short
  const recentTopics = userMessages.slice(-2).map(m => {
    const words = m.content.split(' ').slice(0, 6);
    return words.join(' ') + (m.content.split(' ').length > 6 ? '...' : '');
  });
  
  const summary = `[${messages.length} msgs compacted] Topics: ${recentTopics.join('; ')}. ${toolMessages.length} tools executed.`;
  
  // Ensure summary is under 500 characters to stay well under token limit
  return summary.length > 500 ? summary.slice(0, 497) + '...' : summary;
}

export async function createAdvancedCompactionResult(
  messages: Message[], 
  llmProvider: LLMProvider, 
  maxIterations: number = 5
): Promise<CompactionResult> {
  const originalTokens = countConversationTokens(messages);
  
  try {
    // Extract tool summaries from messages
    const toolSummaries = extractToolSummaries(messages);
    
    // Generate conversational summary using AI (with iteration limit)
    const conversationalSummary = await generateConversationalSummary(
      messages, 
      llmProvider, 
      maxIterations
    );
    
    const compactedTokens = estimateTokens(conversationalSummary);
    
    return {
      summary: conversationalSummary,
      toolSummaries,
      messagesCompacted: messages.length,
      originalTokens,
      compactedTokens,
      timestamp: new Date()
    };
  } catch (error) {
    // Fallback to basic summary if AI compaction fails
    const basicSummary = createBasicSummary(messages);
    const toolSummaries = extractToolSummaries(messages);
    
    return {
      summary: basicSummary,
      toolSummaries,
      messagesCompacted: messages.length,
      originalTokens,
      compactedTokens: estimateTokens(basicSummary),
      timestamp: new Date()
    };
  }
}

function extractToolSummaries(messages: Message[]): CompactionToolSummary[] {
  const toolSummaries: CompactionToolSummary[] = [];
  
  // Extract from structured tool results (new format)
  for (const message of messages) {
    if (message.toolResults) {
      for (const toolResult of message.toolResults) {
        const summary = generateToolSummary(toolResult);
        if (summary) {
          toolSummaries.push({
            toolName: extractToolName(toolResult.id),
            summary,
            success: toolResult.success,
            executionTime: toolResult.executionTime
          });
        }
      }
    }
  }
  
  // Extract from legacy string-based tool results (fallback)
  const legacyToolMessages = messages.filter(m => 
    m.role === 'system' && 
    m.content.startsWith('Tool execution results:') &&
    !m.toolResults // Only process legacy if no structured results
  );
  
  for (const message of legacyToolMessages) {
    const legacyResult = parseLegacyToolResult(message.content);
    if (legacyResult) {
      toolSummaries.push(legacyResult);
    }
  }
  
  return toolSummaries;
}

function generateToolSummary(toolResult: any): string | null {
  if (!toolResult.success || !toolResult.result) {
    return toolResult.error ? `Failed: ${toolResult.error}` : 'Failed';
  }
  
  const result = toolResult.result;
  
  // Handle different types of tool results with Claude Code style breadcrumbs
  if (typeof result === 'string') {
    // File read operations
    const lines = result.split('\n').length;
    return `Read content (${lines} lines)`;
  } else if (result.operation || result.file_path) {
    // File operations
    const filePath = result.file_path || result.path || 'unknown';
    const relativePath = filePath.startsWith('/Users/') ? 
      filePath.split('/').slice(-3).join('/') : // Show last 3 path components
      filePath;
    
    if (result.operation === 'list_dir' || result.directory) {
      // Directory listing
      const itemCount = result.total_items || (result.items ? result.items.length : 0);
      const dirName = result.directory ? result.directory.split('/').pop() : relativePath;
      return `Listed ${dirName} (${itemCount} items)`;
    } else if (result.operation === 'read' || result.total_lines) {
      // File read operations  
      const lineCount = result.total_lines || (result.content ? result.content.split('\n').length : 0);
      return `Read ${relativePath} (${lineCount} lines)`;
    } else if (result.operation === 'write' || result.operation === 'create') {
      return `Created ${relativePath}`;
    } else if (result.operation === 'edit' || result.operation === 'update') {
      return `Edited ${relativePath}`;
    } else if (result.operation === 'delete') {
      return `Deleted ${relativePath}`;
    } else if (result.diff) {
      // Diff/update operations
      return `Updated ${relativePath}`;
    } else {
      return `${result.operation || 'Modified'} ${relativePath}`;
    }
  } else if (result.items && Array.isArray(result.items)) {
    // Directory listing (alternative format)
    return `Found ${result.items.length} items`;
  } else if (result.matches !== undefined) {
    // Search results
    return `Found ${result.matches} matches`;
  } else if (result.command) {
    // Bash/shell operations
    const cmd = result.command.split(' ')[0]; // Get first word of command
    return `Ran ${cmd} command`;
  } else if (result.status || result.output) {
    // General command results
    return `Executed command`;
  }
  
  // Fallback for unknown result types
  return 'Completed operation';
}

function extractToolName(toolId: string): string {
  // Extract tool name from ID (e.g., "file_ops_123" -> "file_ops")
  const parts = toolId.split('_');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('_');
  }
  return toolId;
}

function parseLegacyToolResult(content: string): CompactionToolSummary | null {
  // Parse legacy string-based tool results
  const lines = content.split('\n');
  const resultLine = lines.find(line => line.includes('succeeded:') || line.includes('failed:'));
  
  if (!resultLine) return null;
  
  const isSuccess = resultLine.includes('succeeded:');
  const toolName = resultLine.split(' ')[1] || 'unknown';
  
  // Extract basic summary from content
  let summary = isSuccess ? 'Completed' : 'Failed';
  if (lines.length > 2) {
    const contentLines = lines.slice(2).join('\n');
    const lineCount = contentLines.split('\n').length;
    summary = isSuccess ? `Read content (${lineCount} lines)` : 'Failed';
  }
  
  return {
    toolName,
    summary,
    success: isSuccess
  };
}

async function generateConversationalSummary(
  messages: Message[], 
  llmProvider: LLMProvider, 
  maxIterations: number
): Promise<string> {
  const conversationText = messages.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n\n');
  
  const compactionPrompt: Message[] = [
    {
      role: 'system',
      content: `You are a conversation summarizer similar to Claude Code. Create a concise, conversational summary of what happened in this conversation.

The summary should be like Claude Code summaries:
- 1-2 sentences maximum, very concise
- Focus on the main user request and what was accomplished  
- Written in past tense, natural conversational style
- Mention key file operations, analyses, or code changes made
- Include specific details like file names, directories, or key findings when relevant

Example Claude Code style summaries:
- "User requested analysis of React components. I examined the component structure, identified performance issues in the rendering logic, and suggested optimizations."
- "User asked for help with TypeScript compilation errors. I reviewed the code, fixed type definitions in 3 files, and resolved import path issues."
- "User wanted to understand the file structure. I listed directory contents, analyzed the project architecture, and explained the module organization."

Keep it under 150 tokens and be specific about what was accomplished.`,
      timestamp: new Date()
    },
    {
      role: 'user',
      content: `Please summarize this conversation:\n\n${conversationText}`,
      timestamp: new Date()
    }
  ];
  
  try {
    // Use a limited iteration approach for compaction
    let currentIteration = 0;
    while (currentIteration < maxIterations) {
      currentIteration++;
      
      const response = await llmProvider.generateResponse(compactionPrompt, []);
      
      if (response.content && response.content.trim()) {
        // Clean up the response
        let summary = response.content.trim();
        
        // Remove common prefixes that AI might add
        summary = summary.replace(/^(Here's a|This is a|The conversation|Summary:|Here is the summary:)/i, '').trim();
        
        // Ensure it's conversational and past tense
        if (!summary.toLowerCase().includes('user') && !summary.toLowerCase().includes('we')) {
          summary = `User worked on ${summary.toLowerCase()}`;
        }
        
        return summary;
      }
      
      if (!response.should_continue) break;
    }
    
    // Fallback if AI doesn't provide good summary
    throw new Error('AI summary generation failed');
    
  } catch (error) {
    // Fallback to basic summary
    return createBasicSummary(messages);
  }
}