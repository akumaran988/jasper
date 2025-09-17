import { Message } from '../types/index.js';

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
  
  return roleTokens + contentTokens + timestampTokens;
}

export function countConversationTokens(messages: Message[]): number {
  return messages.reduce((total, message) => total + countMessageTokens(message), 0);
}

export function shouldCompactConversation(messages: Message[], tokenLimit: number): boolean {
  const totalTokens = countConversationTokens(messages);
  return totalTokens > tokenLimit;
}

export async function createConversationSummary(messages: Message[], llmProvider?: any): Promise<string> {
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