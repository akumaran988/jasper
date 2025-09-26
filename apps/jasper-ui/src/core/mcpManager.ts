import type { MCPClientManager, MCPServerConfig, MCPTool, MCPServerStatus } from '../../../../packages/mcp-client-lib/dist/index.js';
import { MCPClientManager as ClientManager } from '../../../../packages/mcp-client-lib/dist/index.js';
import { globalToolRegistry } from './tools.js';
import { MCPToolWrapper } from '../tools/mcpTool.js';
import { MCPServerManager, type MixedMCPServerConfig } from './mcpServerManager.js';
import { ServiceDeploymentManager, type ServiceDefinition } from './serviceDeploymentManager.js';

export interface MCPManagerConfig {
  servers: Record<string, MixedMCPServerConfig>;
  serviceDefinitions?: Record<string, ServiceDefinition>;
  deploymentProfiles?: Record<string, {
    description: string;
    services: string[];
    parallel?: boolean;
    autoStart?: boolean;
  }>;
  debugMode?: boolean;
}

export class MCPManager {
  private clientManager: MCPClientManager;
  private serverManager: MCPServerManager;
  private deploymentManager: ServiceDeploymentManager;
  private isInitialized = false;

  constructor(private config: MCPManagerConfig) {
    this.clientManager = new ClientManager(config.debugMode || false);
    this.serverManager = new MCPServerManager();
    this.deploymentManager = new ServiceDeploymentManager(this);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🚀 Initializing Enhanced MCP Manager...');

    // 1. Initialize server manager (starts local servers, checks remote ones)
    await this.serverManager.initialize(this.config.servers);

    // 2. Wait for local servers to be ready before connecting clients
    await this.waitForLocalServers();

    // Give servers additional time to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Add servers to client manager and connect
    for (const [serverName, serverConfig] of Object.entries(this.config.servers)) {
      // Convert to basic MCPServerConfig for client manager
      const clientConfig: MCPServerConfig = {
        httpUrl: serverConfig.httpUrl,
        url: serverConfig.url,
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
        cwd: serverConfig.cwd,
        timeout: serverConfig.timeout,
        headers: serverConfig.headers,
        trust: serverConfig.trust,
        description: serverConfig.description,
        name: serverName
      };
      
      try {
        await this.clientManager.addServer(clientConfig);
        console.log(`✅ Added MCP server '${serverName}'`);
      } catch (error) {
        console.error(`❌ Failed to add MCP server '${serverName}':`, error);
      }
    }

    // 4. Connect to all servers
    await this.clientManager.connectAll();

    // 5. Discover and register tools
    await this.discoverAndRegisterTools();

    // 6. Initialize service deployment manager
    if (this.config.serviceDefinitions) {
      await this.deploymentManager.initialize(this.config.serviceDefinitions);
    }

    // 7. Auto-start services if configured
    await this.autoStartServices();

    this.isInitialized = true;
    console.log('✅ Enhanced MCP Manager initialized successfully');
  }

  /**
   * Wait for local servers to be ready
   */
  private async waitForLocalServers(): Promise<void> {
    const localServers = Object.entries(this.config.servers)
      .filter(([_, config]) => config.mode === 'local' && config.autoStart);

    if (localServers.length === 0) return;

    console.log('⏳ Waiting for local MCP servers to be ready...');
    
    const maxWait = 3000; // 3 seconds (reduced for built-in servers)
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const allReady = localServers.every(([serverId]) => {
        const status = this.serverManager.getServerStatus(serverId);
        return status?.status === 'running';
      });

      if (allReady) {
        console.log('✅ All local MCP servers are ready');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.warn('⚠️ Some local MCP servers may not be ready yet');
  }

  /**
   * Auto-start services based on deployment profiles
   */
  private async autoStartServices(): Promise<void> {
    if (!this.config.deploymentProfiles) return;

    const autoStartProfiles = Object.entries(this.config.deploymentProfiles)
      .filter(([_, profile]) => profile.autoStart);

    for (const [profileName, profile] of autoStartProfiles) {
      console.log(`🚀 Auto-starting services for profile: ${profileName}`);
      try {
        await this.deployServices(profileName);
      } catch (error) {
        console.error(`Failed to auto-start profile ${profileName}:`, error);
      }
    }
  }

  async discoverAndRegisterTools(): Promise<void> {
    try {
      const mcpTools = await this.clientManager.discoverAllTools();
      
      // Register MCP tools with Jasper's tool registry
      for (const mcpTool of mcpTools) {
        const wrappedTool = MCPToolWrapper.fromMCPTool(mcpTool, this.clientManager);
        globalToolRegistry.register(wrappedTool);
      }

      console.log(`Discovered and registered ${mcpTools.length} MCP tools`);
    } catch (error) {
      console.error('Failed to discover MCP tools:', error);
    }
  }

  async addServer(serverName: string, serverConfig: MCPServerConfig): Promise<void> {
    const config = {
      ...serverConfig,
      name: serverName
    };

    await this.clientManager.addServer(config);
    
    // If already initialized, connect and discover tools immediately
    if (this.isInitialized) {
      try {
        // Connect and discover tools for this server
        await this.discoverAndRegisterTools();
      } catch (error) {
        console.error(`Failed to initialize server '${serverName}':`, error);
      }
    }
  }

  async removeServer(serverName: string): Promise<void> {
    await this.clientManager.removeServer(serverName);
    
    // Remove tools from this server from the registry
    const toolsToRemove = globalToolRegistry.getAll().filter(tool => 
      tool instanceof MCPToolWrapper && 
      (tool as any).mcpTool.serverName === serverName
    );
    
    for (const tool of toolsToRemove) {
      globalToolRegistry.unregister(tool.name);
    }
  }

  getServerStatus(serverName: string): MCPServerStatus {
    return this.clientManager.getServerStatus(serverName);
  }

  getAllServerStatuses(): Record<string, MCPServerStatus> {
    return this.clientManager.getAllServerStatuses();
  }

  getServerNames(): string[] {
    return this.clientManager.getServerNames();
  }

  getAvailableServers(): string[] {
    return this.clientManager.getServerNames();
  }

  /**
   * Execute a tool on a specific MCP server
   */
  async executeTool(serverName: string, toolName: string, parameters: Record<string, any>): Promise<any> {
    const toolCall = {
      id: `tool-${Date.now()}`,
      name: toolName,
      parameters
    };

    const result = await this.clientManager.callTool(toolCall);

    if (!result.success) {
      throw new Error(result.error || `Tool execution failed: ${toolName}`);
    }

    return result.result;
  }

  getDiscoveredTools(): MCPTool[] {
    return this.clientManager.getDiscoveredTools();
  }

  /**
   * Deploy services using a deployment profile
   */
  async deployServices(profileName: string): Promise<void> {
    const profile = this.config.deploymentProfiles?.[profileName];
    if (!profile) {
      throw new Error(`Deployment profile not found: ${profileName}`);
    }

    console.log(`🚀 Deploying services for profile: ${profileName}`);
    await this.deploymentManager.deployServices(profile.services, {
      parallel: profile.parallel,
      maxConcurrent: 3
    });
  }

  /**
   * Deploy a single service
   */
  async deployService(serviceId: string): Promise<void> {
    await this.deploymentManager.deployService(serviceId);
  }

  /**
   * Get all services status
   */
  getServicesStatus(): any[] {
    return this.deploymentManager.getAllServices();
  }

  /**
   * Get deployment targets
   */
  getDeploymentTargets(): any[] {
    return this.deploymentManager.getDeploymentTargets();
  }

  /**
   * Get server manager status
   */
  getServerManagerStatus(): any[] {
    return this.serverManager.getAllServerStatuses();
  }

  /**
   * Get connection summary from server manager
   */
  getConnectionSummary(): { connected: string[], unreachable: { id: string, error: string }[] } {
    return this.serverManager.getConnectionSummary();
  }

  /**
   * Restart a local MCP server
   */
  async restartServer(serverId: string): Promise<void> {
    await this.serverManager.restartServer(serverId);
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Enhanced MCP Manager...');
    
    // Shutdown in reverse order - remove all services
    try {
      const services = this.deploymentManager.getAllServices();
      for (const service of services) {
        await this.deploymentManager.removeService(service.id);
      }
    } catch (error) {
      console.warn('Failed to remove services during shutdown:', error);
    }
    await this.clientManager.disconnectAll();
    await this.serverManager.shutdown();
    
    this.isInitialized = false;
    console.log('✅ Enhanced MCP Manager shutdown complete');
  }

  onStatusChange(callback: (serverName: string, status: MCPServerStatus) => void): void {
    this.clientManager.onStatusChange(callback);
  }

  /**
   * Get comprehensive status of all components
   */
  getFullStatus(): {
    servers: any[];
    services: any[];
    targets: any[];
    mcpStatus: Record<string, MCPServerStatus>;
  } {
    return {
      servers: this.serverManager.getAllServerStatuses(),
      services: this.deploymentManager.getAllServices(),
      targets: this.deploymentManager.getDeploymentTargets(),
      mcpStatus: this.clientManager.getAllServerStatuses()
    };
  }
}

// Global MCP manager instance
let globalMCPManager: MCPManager | null = null;

export function initializeMCPManager(config: MCPManagerConfig): MCPManager {
  if (globalMCPManager) {
    throw new Error('MCP Manager already initialized');
  }
  
  globalMCPManager = new MCPManager(config);
  return globalMCPManager;
}

export function getMCPManager(): MCPManager | null {
  return globalMCPManager;
}