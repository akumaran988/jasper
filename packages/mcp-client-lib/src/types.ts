export interface MCPServerConfig {
  // Transport configurations
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  headers?: Record<string, string>;
  
  // Common settings
  timeout?: number;
  trust?: boolean;
  
  // Metadata
  name: string;
  description?: string;
  includeTools?: string[];
  excludeTools?: string[];
  
  // Authentication
  oauth?: MCPOAuthConfig;
  authProviderType?: AuthProviderType;
}

export interface MCPOAuthConfig {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
}

export enum AuthProviderType {
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  GOOGLE_CREDENTIALS = 'google_credentials',
}

export enum MCPServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export enum MCPDiscoveryState {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed'
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  serverName: string;
  originalName: string;
  prompt?: string; // AI-specific guidance for this tool
}

export interface MCPToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface MCPToolResult {
  id: string;
  success: boolean;
  result: any;
  error?: string;
  executionTime?: number;
}

export interface StatusChangeListener {
  (serverName: string, status: MCPServerStatus): void;
}