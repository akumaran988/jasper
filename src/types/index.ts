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
  tokenLimit?: number; // Default: 10000
}

export type PermissionResponse = 'yes' | 'session' | 'no';

export interface PermissionRule {
  toolName: string;
  scope: 'tool' | 'domain' | 'folder' | 'custom';
  scopeValue?: string; // domain for web fetch, folder path for file ops, or custom scope identifier
  approved: boolean;
  timestamp: Date;
}

export interface PermissionContext {
  toolCall: ToolCall;
  resolve: (response: PermissionResponse) => void;
  sessionApprovals?: Map<string, PermissionRule>; // Track approved rules for session
}

export interface SlashCommand {
  name: string;
  description: string;
  handler: (...args: string[]) => Promise<void> | void;
}