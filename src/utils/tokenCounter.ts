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
  // If no LLM provider available, fall back to basic summary
  if (!llmProvider) {
    return createBasicSummary(messages);
  }
  
  try {
    // Prepare conversation for AI summarization
    const conversationText = messages
      .filter(m => m.role !== 'system' || !m.content.startsWith('Tool execution results:'))
      .map(m => {
        if (m.role === 'assistant') {
          try {
            const parsed = JSON.parse(m.content);
            return `Assistant: ${parsed.content}`;
          } catch {
            return `Assistant: ${m.content}`;
          }
        }
        return `${m.role.charAt(0).toUpperCase() + m.role.slice(1)}: ${m.content}`;
      })
      .join('\n\n');
    
    const summaryPrompt = `You are tasked with creating a comprehensive conversation summary that will serve as context for continuing an AI assistant conversation. This summary will replace the original messages to save token space while preserving all essential information.

**CRITICAL REQUIREMENTS:**
- Preserve ALL important technical details, file paths, code snippets, configurations
- Maintain exact context about what the user was trying to achieve
- Record specific tools used and their exact parameters/results
- Keep track of decisions made and reasoning behind them
- Note any errors encountered and how they were resolved
- Preserve the current state of any ongoing tasks or projects
- Include specific commands, file names, directory structures mentioned
- Maintain the chronological flow of events and problem-solving steps

**STRUCTURE YOUR SUMMARY AS FOLLOWS:**

## 🎯 Main Objective & Context
[What is the user trying to accomplish? What's the overall goal or project?]

## 📋 Key Topics Discussed
[List the main topics, technologies, or areas covered in detail]

## 🔧 Technical Details & Configurations
[Preserve exact file paths, commands, code snippets, configuration values, error messages, etc.]

## 🛠️ Tools & Operations Performed
[List each tool used, with specific parameters and outcomes - be precise about file operations, command results, etc.]

## 📊 Current State & Progress
[What has been accomplished? What's the current state of the project/task?]

## ⚠️ Issues & Resolutions
[Any problems encountered and how they were solved, or ongoing issues]

## 🔄 Next Steps & Pending Items
[What needs to be done next? Any unfinished tasks or follow-up items?]

**CONVERSATION TO SUMMARIZE:**
${conversationText}

**IMPORTANT:** This summary will be used to continue the conversation seamlessly. The AI must be able to pick up exactly where the conversation left off with full context. Be thorough and precise - losing important details could break the conversation flow.`;

    const response = await llmProvider.generateResponse([
      { role: 'user', content: summaryPrompt, timestamp: new Date() }
    ], [], 2000); // Use higher token limit for detailed summary
    
    return `📊 AI-Generated Conversation Summary (${messages.length} messages compacted)\n\n${response.content}\n\n⏰ This conversation has been automatically compacted to stay within token limits while preserving important context.`;
    
  } catch (error) {
    console.warn('Failed to generate AI summary, using basic fallback:', error);
    return createBasicSummary(messages);
  }
}

function createBasicSummary(messages: Message[]): string {
  // Fallback basic summary
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const systemMessages = messages.filter(m => m.role === 'system');
  
  const summary = [
    `📊 Basic Conversation Summary (${messages.length} messages compacted)`,
    '',
    '🔍 Key Topics Discussed:',
    ...userMessages.slice(-5).map((m, i) => `${i + 1}. User: ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`),
    '',
    '🤖 Recent AI Responses:',
    ...assistantMessages.slice(-3).map((m, i) => `${i + 1}. Assistant: ${m.content.slice(0, 150)}${m.content.length > 150 ? '...' : ''}`),
    '',
    '🛠️ Tool Operations:',
    `${systemMessages.length} tool operations were performed`,
    '',
    '⏰ Context: This conversation has been automatically compacted to stay within token limits while preserving recent context.'
  ];
  
  return summary.join('\n');
}