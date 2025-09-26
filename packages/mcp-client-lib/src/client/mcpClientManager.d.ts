import type { MCPServerConfig, MCPTool, MCPToolCall, MCPToolResult, StatusChangeListener } from '../types.js';
import { MCPDiscoveryState, MCPServerStatus } from '../types.js';
export declare class MCPClientManager {
    private readonly debugMode;
    private clients;
    private discoveryState;
    private statusListeners;
    private allDiscoveredTools;
    constructor(debugMode?: boolean);
    addServer(config: MCPServerConfig): Promise<void>;
    removeServer(serverName: string): Promise<void>;
    connectAll(): Promise<void>;
    discoverAllTools(): Promise<MCPTool[]>;
    callTool(toolCall: MCPToolCall): Promise<MCPToolResult>;
    disconnectAll(): Promise<void>;
    getServerStatus(serverName: string): MCPServerStatus;
    getAllServerStatuses(): Record<string, MCPServerStatus>;
    getMCPDiscoveryState(): MCPDiscoveryState;
    getDiscoveredTools(): MCPTool[];
    getServerNames(): string[];
    hasServer(serverName: string): boolean;
    onStatusChange(listener: StatusChangeListener): void;
    offStatusChange(listener: StatusChangeListener): void;
    private notifyStatusChange;
}
//# sourceMappingURL=mcpClientManager.d.ts.map