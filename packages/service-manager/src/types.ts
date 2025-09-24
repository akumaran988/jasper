export interface ServiceConfig {
  name: string;
  type: 'process' | 'docker';
  
  // Process specific
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  workingDir?: string;
  
  // Docker specific
  image?: string;
  containerName?: string;
  ports?: Record<string, string>; // host:container
  volumes?: Record<string, string>; // host:container
  dockerArgs?: string[];
  
  // Service management
  healthCheck?: {
    url?: string;
    command?: string;
    interval?: number; // seconds
    timeout?: number; // seconds
    retries?: number;
  };
  
  autoRestart?: boolean;
  restartDelay?: number; // seconds
  maxRestarts?: number;
}

export interface ServiceInstance {
  id: string;
  name: string;
  config: ServiceConfig;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'unhealthy';
  pid?: number;
  containerId?: string;
  startedAt?: Date;
  stoppedAt?: Date;
  restartCount: number;
  lastError?: string;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  logs: LogEntry[];
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: 'stdout' | 'stderr' | 'system';
}

export interface ServiceStats {
  cpu?: number; // percentage
  memory?: number; // bytes
  network?: {
    rx: number; // bytes received
    tx: number; // bytes transmitted
  };
  uptime?: number; // seconds
}

export interface ServerConfig {
  mode: 'local' | 'remote';
  port: number;
  auth: 'none' | 'required';
  apiKey?: string;
  allowedHosts?: string[];
  maxServices?: number;
  logRetention?: number; // days
}