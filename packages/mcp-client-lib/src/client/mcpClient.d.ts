import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import type { MCPServerConfig, MCPServerStatus, MCPTool, MCPToolCall, MCPToolResult, StatusChangeListener } from '../types.js';
export declare const MCP_DEFAULT_TIMEOUT_MSEC: number;
export declare class MCPClient {
    private readonly serverName;
    private readonly serverConfig;
    private readonly debugMode;
    private client;
    private transport;
    private status;
    private isDisconnecting;
    private statusListeners;
    private discoveredTools;
    constructor(serverName: string, serverConfig: MCPServerConfig, debugMode?: boolean);
    connect(): Promise<void>;
    discoverTools(): Promise<MCPTool[]>;
    discoverPrompts(): Promise<Prompt[]>;
    callTool(toolCall: MCPToolCall): Promise<MCPToolResult>;
    disconnect(): Promise<void>;
    getStatus(): MCPServerStatus;
    getDiscoveredTools(): MCPTool[];
    onStatusChange(listener: StatusChangeListener): void;
    offStatusChange(listener: StatusChangeListener): void;
    private updateStatus;
    private createTransport;
    private generateValidToolName;
}
//# sourceMappingURL=mcpClient.d.ts.map