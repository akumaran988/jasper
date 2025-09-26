export interface CompactionToolSummary {
  toolName: string;
  summary: string; // e.g., "Read src/core/agent.ts (487 lines)"
  success: boolean;
  executionTime?: number;
}

export interface CompactionResult {
  summary: string; // Conversational summary of what happened
  toolSummaries: CompactionToolSummary[]; // Individual tool execution summaries
  messagesCompacted: number;
  originalTokens: number;
  compactedTokens: number;
  timestamp: Date;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolResults?: ToolResult[]; // For system messages containing tool results
  compactionResult?: CompactionResult; // For compaction summary messages
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
  executionTime?: number;
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
  prompt?: string; // AI-specific guidance for this tool
}

export interface LLMProvider {
  name: string;
  generateResponse: (messages: Message[], tools: Tool[], maxTokens?: number) => Promise<AIResponse>;
}

export interface ConversationContext {
  messages: Message[];
  allMessages: Message[]; // Full history including compacted messages for UI display
  compactedSummary?: string; // Summary of compacted messages
  lastCompactionIndex: number; // Index of last message when compaction occurred
  tools: Tool[];
  maxIterations: number;
  currentIteration: number;
  tokenCount: number; // Current token usage
  isCompacting?: boolean; // Flag to show compaction indicator
}

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  trust?: boolean;
  description?: string;
  includeTools?: string[];
  excludeTools?: string[];
  oauth?: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  };
}

export interface ServiceDefinition {
  name?: string; // Optional top-level name for compatibility
  mcpServer: string;
  config: {
    name: string;
    type: 'process' | 'docker';
    command?: string;
    args?: string[];
    workingDir?: string;
    image?: string;
    ports?: Record<string, string>;
    volumes?: Record<string, string>;
    env?: Record<string, string>;
    healthCheck?: {
      url?: string;
      command?: string;
      interval?: number;
    };
    autoRestart?: boolean;
    restartDelay?: number;
    maxRestarts?: number;
  };
  deployment?: {
    environment?: 'local' | 'remote';
    region?: string;
    namespace?: string;
  };
}

export interface DeploymentProfile {
  description: string;
  services: string[];
  parallel?: boolean;
  autoStart?: boolean;
}

export interface JasperConfig {
  llmProvider: 'google-ai' | 'custom';
  apiKey?: string;
  customEndpoint?: string;
  maxIterations: number;
  model?: string;
  apiThrottleMs?: number;
  tokenLimit?: number; // Default: 10000
  mcpServers?: Record<string, any>;
  serviceDefinitions?: Record<string, ServiceDefinition>;
  deploymentProfiles?: Record<string, DeploymentProfile>;
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
  arguments?: string; // Optional arguments description
  handler: (...args: string[]) => Promise<void> | void;
}