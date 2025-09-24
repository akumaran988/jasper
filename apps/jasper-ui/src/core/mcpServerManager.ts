import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import type { MCPServerConfig } from '../../../../packages/mcp-client-lib/src/index.js';
import { resolveMCPServerConfig, isBuiltinServer, getBuiltinServerPath } from './builtinMcpServers.js';
import { mcpServerRegistry } from './mcpServerRegistry.js';

export interface LocalMCPServerConfig extends MCPServerConfig {
  mode: 'local';
  autoStart: boolean;
  serverConfig: {
    script: string;
    port: number;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  };
}

export interface RemoteMCPServerConfig extends MCPServerConfig {
  mode: 'remote';
  healthCheck?: boolean;
  retryAttempts?: number;
}

export interface MixedMCPServerConfig extends MCPServerConfig {
  mode: 'local' | 'remote';
  autoStart?: boolean;
  serverConfig?: LocalMCPServerConfig['serverConfig'];
  healthCheck?: boolean;
  retryAttempts?: number;
}

export interface ServerInstance {
  id: string;
  config: MixedMCPServerConfig;
  process?: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error' | 'unreachable';
  lastHealthCheck?: Date;
  error?: string;
}

export class MCPServerManager extends EventEmitter {
  private servers: Map<string, ServerInstance> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupShutdownHandlers();
  }

  /**
   * Resolve server script path from various sources
   */
  private resolveServerScript(serverId: string, config: MixedMCPServerConfig): MixedMCPServerConfig {
    // 1. Check if it's a built-in server
    if (isBuiltinServer(serverId)) {
      console.log(`📦 Using built-in MCP server: ${serverId}`);
      return resolveMCPServerConfig(serverId, config);
    }

    // 2. Check if it's an installed server
    const installedPath = mcpServerRegistry.getServerScriptPath(serverId);
    if (installedPath) {
      console.log(`📥 Using installed MCP server: ${serverId} at ${installedPath}`);
      return {
        ...config,
        serverConfig: {
          ...config.serverConfig!,
          script: installedPath
        }
      };
    }

    // 3. Use the provided script path as-is (for custom servers)
    const scriptPath = config.serverConfig?.script;
    if (scriptPath) {
      // Resolve relative paths relative to current working directory
      const resolvedPath = path.isAbsolute(scriptPath) 
        ? scriptPath 
        : path.resolve(process.cwd(), scriptPath);
      
      console.log(`🔧 Using custom MCP server script: ${resolvedPath}`);
      return {
        ...config,
        serverConfig: {
          ...config.serverConfig,
          script: resolvedPath
        }
      };
    }

    throw new Error(`Could not resolve script path for MCP server: ${serverId}`);
  }

  /**
   * Initialize all configured MCP servers
   */
  async initialize(serverConfigs: Record<string, MixedMCPServerConfig>): Promise<void> {
    console.log('🚀 Initializing MCP Server Manager...');
    
    // Initialize server instances
    for (const [serverId, config] of Object.entries(serverConfigs)) {
      const serverInstance: ServerInstance = {
        id: serverId,
        config,
        status: 'stopped'
      };
      
      this.servers.set(serverId, serverInstance);
    }

    // Start local servers that have autoStart enabled
    const localServers = Array.from(this.servers.values())
      .filter(server => server.config.mode === 'local' && server.config.autoStart);
    
    if (localServers.length > 0) {
      console.log(`🏠 Starting ${localServers.length} local MCP servers...`);
      await this.startLocalServers(localServers);
    }

    // Check health of remote servers (silently during startup)
    const remoteServers = Array.from(this.servers.values())
      .filter(server => server.config.mode === 'remote');
    
    if (remoteServers.length > 0) {
      console.log(`🌐 Checking ${remoteServers.length} remote MCP servers...`);
      await this.checkRemoteServers(remoteServers);
    }

    // Start health monitoring
    this.startHealthMonitoring();
    
    console.log('✅ MCP Server Manager initialized');
  }

  /**
   * Get a summary of connection issues for display after initialization
   */
  getConnectionSummary(): { connected: string[], unreachable: { id: string, error: string }[] } {
    const connected: string[] = [];
    const unreachable: { id: string, error: string }[] = [];

    for (const server of this.servers.values()) {
      if (server.status === 'running') {
        connected.push(server.id);
      } else if (server.status === 'unreachable' && server.error) {
        unreachable.push({ id: server.id, error: server.error });
      }
    }

    return { connected, unreachable };
  }

  /**
   * Start local MCP servers
   */
  private async startLocalServers(servers: ServerInstance[]): Promise<void> {
    const startPromises = servers.map(server => this.startLocalServer(server));
    await Promise.allSettled(startPromises);
  }

  /**
   * Start a single local MCP server
   */
  private async startLocalServer(server: ServerInstance): Promise<void> {
    if (!server.config.serverConfig) {
      throw new Error(`Local server ${server.id} missing serverConfig`);
    }

    // Resolve the script path (built-in, installed, or custom)
    const resolvedConfig = this.resolveServerScript(server.id, server.config);
    const { script, port, args = [], env = {}, cwd } = resolvedConfig.serverConfig;
    
    console.log(`🚀 Starting local MCP server: ${server.id} on port ${port}`);
    console.log(`📂 Script: ${script}`);
    console.log(`🔧 Args: ${JSON.stringify(args)}`);
    server.status = 'starting';
    
    try {
      // Check if port is available
      if (await this.isPortInUse(port)) {
        throw new Error(`Port ${port} is already in use`);
      }

      // Determine the working directory
      const workingDir = cwd || path.dirname(path.resolve(script));
      
      // Prepare environment variables
      const serverEnv = {
        ...process.env,
        ...env,
        PORT: port.toString(),
        NODE_ENV: env.NODE_ENV || 'development'
      };

      // Start the server process
      const serverArgs = args || [];
      const serverProcess = spawn('npx', ['tsx', script, ...serverArgs], {
        cwd: workingDir,
        env: serverEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      server.process = serverProcess;

      // Handle process events
      serverProcess.stdout?.on('data', (data) => {
        console.log(`[${server.id}] ${data.toString().trim()}`);
      });

      serverProcess.stderr?.on('data', (data) => {
        console.error(`[${server.id}] ERROR: ${data.toString().trim()}`);
      });

      serverProcess.on('error', (error) => {
        console.error(`[${server.id}] Process error:`, error);
        server.status = 'error';
        server.error = error.message;
        this.emit('serverError', server.id, error);
      });

      serverProcess.on('exit', (code, signal) => {
        console.log(`[${server.id}] Process exited with code ${code}, signal ${signal}`);
        server.status = 'stopped';
        server.process = undefined;
        this.emit('serverStopped', server.id, code, signal);
      });

      // Wait for server to be ready
      await this.waitForServerReady(server, 30000); // 30 second timeout
      
      server.status = 'running';
      console.log(`✅ Local MCP server started: ${server.id}`);
      this.emit('serverStarted', server.id);
      
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to start local MCP server ${server.id}:`, error);
      this.emit('serverError', server.id, error);
      throw error;
    }
  }

  /**
   * Check if a port is in use
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const childProcess = spawn('lsof', ['-i', `:${port}`]);
      
      childProcess.on('close', (code: number) => {
        resolve(code === 0); // Port is in use if lsof returns 0
      });
      
      childProcess.on('error', () => {
        resolve(false); // Assume port is available if lsof fails
      });
    });
  }

  /**
   * Wait for server to be ready by checking health endpoint
   */
  private async waitForServerReady(server: ServerInstance, timeout: number): Promise<void> {
    const startTime = Date.now();
    const healthUrl = server.config.httpUrl?.replace('/mcp/tools', '/health') || 
                     `http://localhost:${server.config.serverConfig?.port}/health`;
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(healthUrl, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          return; // Server is ready
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    
    throw new Error(`Server ${server.id} did not become ready within ${timeout}ms`);
  }

  /**
   * Check health of remote servers
   */
  private async checkRemoteServers(servers: ServerInstance[]): Promise<void> {
    const checkPromises = servers.map(server => this.checkRemoteServerHealth(server));
    await Promise.allSettled(checkPromises);
  }

  /**
   * Check health of a single remote server
   */
  private async checkRemoteServerHealth(server: ServerInstance): Promise<void> {
    if (!server.config.healthCheck) {
      server.status = 'running'; // Assume it's running if health check is disabled
      return;
    }

    try {
      const healthUrl = server.config.httpUrl?.replace('/mcp/tools', '/health');
      if (!healthUrl) {
        throw new Error('No health URL available');
      }

      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: server.config.headers || {},
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        server.status = 'running';
        server.lastHealthCheck = new Date();
        // Only log success during health monitoring, not initial startup
        if (this.healthCheckInterval) {
          console.log(`✅ Remote MCP server healthy: ${server.id}`);
        }
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      server.status = 'unreachable';
      server.error = error instanceof Error ? error.message : String(error);
      // Store error but don't console.warn during startup to prevent UI duplication
      this.emit('serverUnreachable', server.id, error);
    }
  }

  /**
   * Start health monitoring for all servers
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const remoteServers = Array.from(this.servers.values())
        .filter(server => server.config.mode === 'remote' && server.config.healthCheck);
      
      // During monitoring, we can log status changes
      this.checkRemoteServers(remoteServers);
    }, 60000); // Check every minute
  }

  /**
   * Get server status
   */
  getServerStatus(serverId: string): ServerInstance | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get all server statuses
   */
  getAllServerStatuses(): ServerInstance[] {
    return Array.from(this.servers.values());
  }

  /**
   * Stop a specific server
   */
  async stopServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server || server.config.mode !== 'local') {
      return;
    }

    if (server.process && server.status === 'running') {
      console.log(`🛑 Stopping local MCP server: ${serverId}`);
      server.process.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (server.process && !server.process.killed) {
          server.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Shutdown all servers
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down MCP Server Manager...');
    this.isShuttingDown = true;

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop all local servers
    const localServers = Array.from(this.servers.values())
      .filter(server => server.config.mode === 'local' && server.process);

    const stopPromises = localServers.map(server => this.stopServer(server.id));
    await Promise.allSettled(stopPromises);

    console.log('✅ MCP Server Manager shutdown complete');
  }

  /**
   * Setup shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = () => {
      this.shutdown().then(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
  }

  /**
   * Restart a local server
   */
  async restartServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server || server.config.mode !== 'local') {
      throw new Error(`Cannot restart server ${serverId}: not a local server`);
    }

    await this.stopServer(serverId);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await this.startLocalServer(server);
  }
}