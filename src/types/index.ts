export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface ToolResult {
  id: string;
  success: boolean;
  result: any;
  error?: string;
}

export interface AIResponse {
  content: string;
  tool_calls?: ToolCall[];
  should_continue: boolean;
  reasoning?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: Record<string, any>) => Promise<any>;
}

export interface LLMProvider {
  name: string;
  generateResponse: (messages: Message[], tools: Tool[], maxTokens?: number) => Promise<AIResponse>;
}

export interface ConversationContext {
  messages: Message[];
  tools: Tool[];
  maxIterations: number;
  currentIteration: number;
}

export interface JasperConfig {
  llmProvider: 'gemini' | 'custom';
  apiKey?: string;
  customEndpoint?: string;
  maxIterations: number;
  model?: string;
  apiThrottleMs?: number;
}