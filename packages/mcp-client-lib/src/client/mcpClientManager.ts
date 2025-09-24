import type {
  MCPServerConfig,
  MCPServerStatus,
  MCPDiscoveryState,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  StatusChangeListener
} from '../types.js';
import { MCPDiscoveryState as DiscoveryState, MCPServerStatus } from '../types.js';
import { MCPClient } from './mcpClient.js';

export class MCPClientManager {
  private clients: Map<string, MCPClient> = new Map();
  private discoveryState: MCPDiscoveryState = DiscoveryState.NOT_STARTED;
  private statusListeners: StatusChangeListener[] = [];
  private allDiscoveredTools: MCPTool[] = [];

  constructor(
    private readonly debugMode: boolean = false
  ) {}

  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP server '${config.name}' already exists`);
    }

    const client = new MCPClient(config.name, config, this.debugMode);
    
    // Forward status changes
    client.onStatusChange((serverName, status) => {
      this.notifyStatusChange(serverName, status);
    });

    this.clients.set(config.name, client);
  }

  async removeServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverName);
      
      // Remove tools from this server
      this.allDiscoveredTools = this.allDiscoveredTools.filter(
        tool => tool.serverName !== serverName
      );
    }
  }

  async connectAll(): Promise<void> {
    this.discoveryState = DiscoveryState.IN_PROGRESS;
    
    const connectionPromises = Array.from(this.clients.values()).map(
      async (client) => {
        try {
          await client.connect();
        } catch (error) {
          console.error(`Failed to connect to ${client['serverName']}:`, error);
        }
      }
    );

    await Promise.all(connectionPromises);
  }

  async discoverAllTools(): Promise<MCPTool[]> {
    this.discoveryState = DiscoveryState.IN_PROGRESS;
    
    const discoveryPromises = Array.from(this.clients.values()).map(
      async (client) => {
        try {
          const tools = await client.discoverTools();
          return tools;
        } catch (error) {
          console.error(`Failed to discover tools from ${client['serverName']}:`, error);
          return [];
        }
      }
    );

    const toolArrays = await Promise.all(discoveryPromises);
    this.allDiscoveredTools = toolArrays.flat();
    
    this.discoveryState = DiscoveryState.COMPLETED;
    return this.allDiscoveredTools;
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    // Find which server has this tool
    const tool = this.allDiscoveredTools.find(t => t.name === toolCall.name);
    if (!tool) {
      return {
        id: toolCall.id,
        success: false,
        result: null,
        error: `Tool '${toolCall.name}' not found`,
        executionTime: 0
      };
    }

    const client = this.clients.get(tool.serverName);
    if (!client) {
      return {
        id: toolCall.id,
        success: false,
        result: null,
        error: `MCP server '${tool.serverName}' not found`,
        executionTime: 0
      };
    }

    return await client.callTool(toolCall);
  }

  async disconnectAll(): Promise<void> {
    const disconnectionPromises = Array.from(this.clients.values()).map(
      async (client) => {
        try {
          await client.disconnect();
        } catch (error) {
          console.error(`Error disconnecting client:`, error);
        }
      }
    );

    await Promise.all(disconnectionPromises);
    this.clients.clear();
    this.allDiscoveredTools = [];
  }

  getServerStatus(serverName: string): MCPServerStatus {
    const client = this.clients.get(serverName);
    return client ? client.getStatus() : MCPServerStatus.DISCONNECTED;
  }

  getAllServerStatuses(): Record<string, MCPServerStatus> {
    const statuses: Record<string, MCPServerStatus> = {};
    for (const [serverName, client] of this.clients) {
      statuses[serverName] = client.getStatus();
    }
    return statuses;
  }

  getDiscoveryState(): MCPDiscoveryState {
    return this.discoveryState;
  }

  getDiscoveredTools(): MCPTool[] {
    return this.allDiscoveredTools;
  }

  getServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  hasServer(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  onStatusChange(listener: StatusChangeListener): void {
    this.statusListeners.push(listener);
  }

  offStatusChange(listener: StatusChangeListener): void {
    const index = this.statusListeners.indexOf(listener);
    if (index !== -1) {
      this.statusListeners.splice(index, 1);
    }
  }

  private notifyStatusChange(serverName: string, status: MCPServerStatus): void {
    this.statusListeners.forEach(listener => {
      listener(serverName, status);
    });
  }
}