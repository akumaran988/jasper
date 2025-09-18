import { Message, ToolResult, CompactionResult, LLMProvider } from '../types/index.js';
import { estimateTokens } from './tokenCounter.js';

export interface CompactionConfig {
  maxMessageAge: number; // Messages older than this will be ignored (default: 300)
  toolResultDeduplicationEnabled: boolean; // Enable tool result deduplication
  conversationCompactionEnabled: boolean; // Enable AI-powered conversation compaction
  maxCompactionIterations: number; // Max iterations for AI compaction (default: 5)
  tokenThreshold: number; // Token threshold to trigger compaction (default: 25000)
  minMessagesBeforeCompaction: number; // Minimum messages before compaction (default: 10)
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  maxMessageAge: 300,
  toolResultDeduplicationEnabled: true,
  conversationCompactionEnabled: true,
  maxCompactionIterations: 5,
  tokenThreshold: 25000,
  minMessagesBeforeCompaction: 10
};

export interface ToolResultFingerprint {
  toolName: string;
  parameters: string; // Serialized parameters
  resultHash: string; // Hash of the result content
  timestamp: Date;
  messageIndex: number;
}

export interface CompactionStrategy {
  shouldCompact(messages: Message[], config: CompactionConfig): boolean;
  compactMessages(
    messages: Message[], 
    llmProvider: LLMProvider, 
    config: CompactionConfig
  ): Promise<CompactionResult>;
}

export class IntelligentCompactionStrategy implements CompactionStrategy {
  private toolResultCache = new Map<string, ToolResultFingerprint>();

  shouldCompact(messages: Message[], config: CompactionConfig): boolean {
    if (messages.length < config.minMessagesBeforeCompaction) {
      return false;
    }

    const totalTokens = this.calculateTotalTokens(messages);
    return totalTokens > config.tokenThreshold;
  }

  async compactMessages(
    messages: Message[],
    llmProvider: LLMProvider,
    config: CompactionConfig
  ): Promise<CompactionResult> {
    const originalTokens = this.calculateTotalTokens(messages);

    // Step 1: Filter out old messages based on age limit
    const recentMessages = this.filterByAge(messages, config.maxMessageAge);

    // Step 2: Deduplicate tool results if enabled
    const messagesAfterDeduplication = config.toolResultDeduplicationEnabled 
      ? this.deduplicateToolResults(recentMessages)
      : recentMessages;

    // Step 3: Separate messages for different compaction strategies
    const { conversationMessages, toolMessages, recentMessages: keepRecent } = 
      this.categorizeMessages(messagesAfterDeduplication);

    // Step 4: Compact tool messages (without AI)
    const compactedToolSummaries = this.compactToolMessages(toolMessages);

    // Step 5: Compact conversation messages (with AI) if enabled
    let conversationSummary = '';
    if (config.conversationCompactionEnabled && conversationMessages.length > 0) {
      try {
        conversationSummary = await this.compactConversationMessages(
          conversationMessages,
          llmProvider,
          config.maxCompactionIterations
        );
      } catch (error) {
        // Fallback to basic summary
        conversationSummary = this.createBasicConversationSummary(conversationMessages);
      }
    }

    const compactedTokens = estimateTokens(conversationSummary) + 
                           compactedToolSummaries.reduce((sum, tool) => sum + estimateTokens(tool.summary), 0);

    return {
      summary: conversationSummary,
      toolSummaries: compactedToolSummaries,
      messagesCompacted: recentMessages.length - keepRecent.length,
      originalTokens,
      compactedTokens,
      timestamp: new Date()
    };
  }

  private calculateTotalTokens(messages: Message[]): number {
    return messages.reduce((total, message) => {
      let messageTokens = estimateTokens(message.content || '');
      
      if (message.toolResults) {
        for (const result of message.toolResults) {
          if (result.result) {
            try {
              messageTokens += estimateTokens(this.safeStringify(result.result));
            } catch (error) {
              // If JSON.stringify fails (e.g., circular reference), estimate based on result type
              messageTokens += this.estimateTokensForResult(result.result);
            }
          }
        }
      }
      
      return total + messageTokens;
    }, 0);
  }

  private safeStringify(obj: any): string {
    const seen = new Set();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    });
  }

  private estimateTokensForResult(result: any): number {
    if (typeof result === 'string') {
      return estimateTokens(result);
    } else if (typeof result === 'object' && result !== null) {
      // For objects, estimate based on number of properties
      const propertyCount = Object.keys(result).length;
      return propertyCount * 10; // Rough estimate: 10 tokens per property
    }
    return 5; // Default fallback
  }

  private filterByAge(messages: Message[], maxAge: number): Message[] {
    if (maxAge <= 0 || messages.length <= maxAge) {
      return messages;
    }

    // Keep the most recent maxAge messages
    return messages.slice(-maxAge);
  }

  private deduplicateToolResults(messages: Message[]): Message[] {
    const deduplicatedMessages: Message[] = [];
    const seenToolResults = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      if (message.toolResults && message.toolResults.length > 0) {
        const uniqueToolResults: ToolResult[] = [];
        
        for (const toolResult of message.toolResults) {
          const fingerprint = this.createToolResultFingerprint(toolResult, i);
          const fingerprintKey = this.getFingerprintKey(fingerprint);
          
          // Check if we've seen this exact tool result before
          if (!seenToolResults.has(fingerprintKey)) {
            seenToolResults.add(fingerprintKey);
            uniqueToolResults.push(toolResult);
            this.toolResultCache.set(fingerprintKey, fingerprint);
          } else {
            // We've seen this tool result before, create a reference instead
            const originalFingerprint = this.toolResultCache.get(fingerprintKey);
            if (originalFingerprint) {
              const referenceResult: ToolResult = {
                id: `ref_${toolResult.id}`,
                success: true,
                result: `[Duplicate of tool call at message ${originalFingerprint.messageIndex}]`,
                executionTime: 0
              };
              uniqueToolResults.push(referenceResult);
            }
          }
        }
        
        // Only include the message if it has unique tool results
        if (uniqueToolResults.length > 0) {
          deduplicatedMessages.push({
            ...message,
            toolResults: uniqueToolResults
          });
        }
      } else {
        // Non-tool messages are always included
        deduplicatedMessages.push(message);
      }
    }

    return deduplicatedMessages;
  }

  private createToolResultFingerprint(toolResult: ToolResult, messageIndex: number): ToolResultFingerprint {
    const toolName = this.extractToolNameFromId(toolResult.id);
    const resultContent = toolResult.result ? this.safeStringify(toolResult.result) : '';
    const resultHash = this.simpleHash(resultContent);

    return {
      toolName,
      parameters: '', // We don't have access to original parameters in ToolResult
      resultHash,
      timestamp: new Date(),
      messageIndex
    };
  }

  private getFingerprintKey(fingerprint: ToolResultFingerprint): string {
    return `${fingerprint.toolName}:${fingerprint.resultHash}`;
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private extractToolNameFromId(toolId: string): string {
    const parts = toolId.split('_');
    if (parts.length > 1) {
      return parts.slice(0, -1).join('_');
    }
    return toolId;
  }

  private categorizeMessages(messages: Message[]): {
    conversationMessages: Message[];
    toolMessages: Message[];
    recentMessages: Message[];
  } {
    const conversationMessages: Message[] = [];
    const toolMessages: Message[] = [];
    
    // Keep the last 3 messages as recent (don't compact them)
    const recentMessages = messages.slice(-3);
    const messagesToProcess = messages.slice(0, -3);

    for (const message of messagesToProcess) {
      if (message.toolResults && message.toolResults.length > 0) {
        toolMessages.push(message);
      } else if (message.role === 'user' || message.role === 'assistant') {
        conversationMessages.push(message);
      }
      // Skip system messages that aren't tool results
    }

    return { conversationMessages, toolMessages, recentMessages };
  }

  private compactToolMessages(toolMessages: Message[]): Array<{
    toolName: string;
    summary: string;
    success: boolean;
    executionTime?: number;
  }> {
    const toolSummaries: Array<{
      toolName: string;
      summary: string;
      success: boolean;
      executionTime?: number;
    }> = [];

    for (const message of toolMessages) {
      if (message.toolResults) {
        for (const toolResult of message.toolResults) {
          const toolName = this.extractToolNameFromId(toolResult.id);
          const summary = this.generateToolSummary(toolResult);
          
          toolSummaries.push({
            toolName,
            summary,
            success: toolResult.success,
            executionTime: toolResult.executionTime
          });
        }
      }
    }

    return toolSummaries;
  }

  private generateToolSummary(toolResult: ToolResult): string {
    if (!toolResult.success) {
      return toolResult.error ? `Failed: ${toolResult.error}` : 'Failed';
    }

    const result = toolResult.result;

    if (typeof result === 'string') {
      if (result.startsWith('[Duplicate of tool call')) {
        return result;
      }
      const lines = result.split('\n').length;
      return `Read content (${lines} lines)`;
    }

    if (result && typeof result === 'object') {
      if (result.operation || result.file_path) {
        const filePath = result.file_path || result.path || 'unknown';
        const relativePath = this.getRelativePath(filePath);
        
        switch (result.operation) {
          case 'list_dir':
            const itemCount = result.total_items || (result.items ? result.items.length : 0);
            return `Listed ${relativePath} (${itemCount} items)`;
          case 'read':
            const lineCount = result.total_lines || (result.content ? result.content.split('\n').length : 0);
            return `Read ${relativePath} (${lineCount} lines)`;
          case 'write':
          case 'create':
            return `Created ${relativePath}`;
          case 'edit':
          case 'update':
            return `Edited ${relativePath}`;
          case 'delete':
            return `Deleted ${relativePath}`;
          default:
            return `${result.operation || 'Modified'} ${relativePath}`;
        }
      }

      if (result.items && Array.isArray(result.items)) {
        return `Found ${result.items.length} items`;
      }

      if (result.matches !== undefined) {
        return `Found ${result.matches} matches`;
      }

      if (result.command) {
        const cmd = result.command.split(' ')[0];
        return `Ran ${cmd} command`;
      }
    }

    return 'Completed operation';
  }

  private getRelativePath(filePath: string): string {
    if (filePath.startsWith('/Users/')) {
      return filePath.split('/').slice(-3).join('/');
    }
    return filePath;
  }

  private async compactConversationMessages(
    messages: Message[],
    llmProvider: LLMProvider,
    maxIterations: number
  ): Promise<string> {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content.slice(0, 500)}`)
      .join('\n\n');

    const compactionPrompt: Message[] = [
      {
        role: 'system',
        content: `You are a conversation summarizer. Create a concise summary of this conversation.

IMPORTANT: Tool calls and tool results are being handled separately. You will see placeholder references like "TOOL_CALL_1" and "TOOL_RESULT_1" in the conversation. Do NOT try to summarize these - they are handled by a separate compaction process.

Focus ONLY on summarizing the user and assistant conversation content:
- 1-2 sentences maximum
- Past tense, conversational style  
- Main user request and what was discussed
- Key findings or decisions made
- Ignore tool call placeholders

Example: "User requested help with React performance issues. I analyzed the component structure and suggested optimization strategies."`,
        timestamp: new Date()
      },
      {
        role: 'user',
        content: `Summarize this conversation (ignore TOOL_CALL and TOOL_RESULT placeholders):\n\n${conversationText}`,
        timestamp: new Date()
      }
    ];

    let currentIteration = 0;
    while (currentIteration < maxIterations) {
      currentIteration++;

      try {
        const response = await llmProvider.generateResponse(compactionPrompt, []);

        if (response.content && response.content.trim()) {
          let summary = response.content.trim();
          
          // Clean up common AI response prefixes
          summary = summary.replace(/^(Here's a|This is a|The conversation|Summary:|Here is the summary:)/i, '').trim();
          
          // Ensure conversational style
          if (!summary.toLowerCase().includes('user') && !summary.toLowerCase().includes('we')) {
            summary = `User worked on ${summary.toLowerCase()}`;
          }

          return summary;
        }

        if (!response.should_continue) break;
      } catch (error) {
        break; // Exit on error
      }
    }

    // Fallback to basic summary
    return this.createBasicConversationSummary(messages);
  }

  private createBasicConversationSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    
    if (userMessages.length === 0) {
      return '[No user messages found]';
    }

    const recentTopics = userMessages.slice(-2).map(m => {
      const words = m.content.split(' ').slice(0, 6);
      return words.join(' ') + (m.content.split(' ').length > 6 ? '...' : '');
    });

    const summary = `[${messages.length} msgs compacted] Topics: ${recentTopics.join('; ')}`;
    return summary.length > 500 ? summary.slice(0, 497) + '...' : summary;
  }
}

// Factory function to create the compaction strategy
export function createCompactionStrategy(): CompactionStrategy {
  return new IntelligentCompactionStrategy();
}