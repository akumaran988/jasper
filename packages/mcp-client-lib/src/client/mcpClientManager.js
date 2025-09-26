import { MCPDiscoveryState, MCPServerStatus } from '../types.js';
import { MCPClient } from './mcpClient.js';
export class MCPClientManager {
    constructor(debugMode = false) {
        this.debugMode = debugMode;
        this.clients = new Map();
        this.discoveryState = MCPDiscoveryState.NOT_STARTED;
        this.statusListeners = [];
        this.allDiscoveredTools = [];
    }
    async addServer(config) {
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
    async removeServer(serverName) {
        const client = this.clients.get(serverName);
        if (client) {
            await client.disconnect();
            this.clients.delete(serverName);
            // Remove tools from this server
            this.allDiscoveredTools = this.allDiscoveredTools.filter(tool => tool.serverName !== serverName);
        }
    }
    async connectAll() {
        this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
        const connectionPromises = Array.from(this.clients.values()).map(async (client) => {
            try {
                await client.connect();
            }
            catch (error) {
                console.error(`Failed to connect to ${client['serverName']}:`, error);
            }
        });
        await Promise.all(connectionPromises);
    }
    async discoverAllTools() {
        this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
        const discoveryPromises = Array.from(this.clients.values()).map(async (client) => {
            try {
                const tools = await client.discoverTools();
                return tools;
            }
            catch (error) {
                console.error(`Failed to discover tools from ${client['serverName']}:`, error);
                return [];
            }
        });
        const toolArrays = await Promise.all(discoveryPromises);
        this.allDiscoveredTools = toolArrays.flat();
        this.discoveryState = MCPDiscoveryState.COMPLETED;
        return this.allDiscoveredTools;
    }
    async callTool(toolCall) {
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
    async disconnectAll() {
        const disconnectionPromises = Array.from(this.clients.values()).map(async (client) => {
            try {
                await client.disconnect();
            }
            catch (error) {
                console.error(`Error disconnecting client:`, error);
            }
        });
        await Promise.all(disconnectionPromises);
        this.clients.clear();
        this.allDiscoveredTools = [];
    }
    getServerStatus(serverName) {
        const client = this.clients.get(serverName);
        return client ? client.getStatus() : MCPServerStatus.DISCONNECTED;
    }
    getAllServerStatuses() {
        const statuses = {};
        for (const [serverName, client] of this.clients) {
            statuses[serverName] = client.getStatus();
        }
        return statuses;
    }
    getMCPDiscoveryState() {
        return this.discoveryState;
    }
    getDiscoveredTools() {
        return this.allDiscoveredTools;
    }
    getServerNames() {
        return Array.from(this.clients.keys());
    }
    hasServer(serverName) {
        return this.clients.has(serverName);
    }
    onStatusChange(listener) {
        this.statusListeners.push(listener);
    }
    offStatusChange(listener) {
        const index = this.statusListeners.indexOf(listener);
        if (index !== -1) {
            this.statusListeners.splice(index, 1);
        }
    }
    notifyStatusChange(serverName, status) {
        this.statusListeners.forEach(listener => {
            listener(serverName, status);
        });
    }
}
//# sourceMappingURL=mcpClientManager.js.map