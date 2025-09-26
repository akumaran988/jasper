import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, CallToolResultSchema, ListPromptsResultSchema, } from '@modelcontextprotocol/sdk/types.js';
import { MCPServerStatus as Status } from '../types.js';
export const MCP_DEFAULT_TIMEOUT_MSEC = 10 * 60 * 1000; // 10 minutes
export class MCPClient {
    constructor(serverName, serverConfig, debugMode = false) {
        this.serverName = serverName;
        this.serverConfig = serverConfig;
        this.debugMode = debugMode;
        this.status = Status.DISCONNECTED;
        this.isDisconnecting = false;
        this.statusListeners = [];
        this.discoveredTools = [];
        this.client = new Client({
            name: `jasper-mcp-client-${this.serverName}`,
            version: '1.0.0',
        });
    }
    async connect() {
        this.isDisconnecting = false;
        this.updateStatus(Status.CONNECTING);
        try {
            console.log(`[${this.serverName}] Creating transport...`);
            this.transport = await this.createTransport();
            console.log(`[${this.serverName}] Transport created successfully`);
            this.client.onerror = (error) => {
                if (this.isDisconnecting) {
                    return;
                }
                console.error(`MCP ERROR (${this.serverName}):`, error.toString());
                // Don't mark HTTP transport clients as disconnected for individual request failures
                // HTTP is stateless and a failed request doesn't mean the connection is broken
                if (!this.serverConfig.httpUrl) {
                    this.updateStatus(Status.ERROR);
                }
            };
            console.log(`[${this.serverName}] Connecting client...`);
            await this.client.connect(this.transport, {
                timeout: this.serverConfig.timeout ?? MCP_DEFAULT_TIMEOUT_MSEC,
            });
            console.log(`[${this.serverName}] Client connected successfully`);
            this.updateStatus(Status.CONNECTED);
            console.log(`[${this.serverName}] Status updated to CONNECTED`);
        }
        catch (error) {
            console.error(`[${this.serverName}] Connection failed:`, error);
            this.updateStatus(Status.ERROR);
            throw error;
        }
    }
    async discoverTools() {
        if (this.status !== Status.CONNECTED) {
            throw new Error('Client is not connected.');
        }
        try {
            const response = await this.client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema);
            this.discoveredTools = response.tools.map((tool) => {
                // Extract AI prompt from description if present
                const description = tool.description || '';
                let cleanDescription = description;
                let aiPrompt = undefined;
                // Check if description contains AI prompt (marked with AI_PROMPT: delimiter)
                const promptMatch = description.match(/AI_PROMPT:\s*(.*?)(?:\n|$)/s);
                if (promptMatch) {
                    aiPrompt = promptMatch[1].trim();
                    cleanDescription = description.replace(/AI_PROMPT:\s*.*?(?:\n|$)/s, '').trim();
                }
                return {
                    name: this.generateValidToolName(tool.name),
                    description: cleanDescription,
                    parameters: tool.inputSchema || { type: 'object', properties: {} },
                    serverName: this.serverName,
                    originalName: tool.name,
                    prompt: aiPrompt
                };
            });
            return this.discoveredTools;
        }
        catch (error) {
            console.error(`Error discovering tools from ${this.serverName}:`, error);
            return [];
        }
    }
    async discoverPrompts() {
        if (this.status !== Status.CONNECTED) {
            throw new Error('Client is not connected.');
        }
        try {
            const response = await this.client.request({ method: 'prompts/list', params: {} }, ListPromptsResultSchema);
            return response.prompts;
        }
        catch (error) {
            console.error(`Error discovering prompts from ${this.serverName}:`, error);
            return [];
        }
    }
    async callTool(toolCall) {
        console.log(`[${this.serverName}] callTool: status=${this.status}, toolName=${toolCall.name}`);
        if (this.status !== Status.CONNECTED) {
            console.error(`[${this.serverName}] Tool call rejected: status is ${this.status}, expected CONNECTED`);
            throw new Error('Client is not connected.');
        }
        const startTime = Date.now();
        try {
            // Find the original tool name
            const tool = this.discoveredTools.find(t => t.name === toolCall.name);
            const originalName = tool?.originalName || toolCall.name;
            const response = await this.client.request({
                method: 'tools/call',
                params: {
                    name: originalName,
                    arguments: toolCall.parameters,
                },
            }, CallToolResultSchema);
            const endTime = Date.now();
            return {
                id: toolCall.id,
                success: !response.isError,
                result: response.content,
                error: response.isError ? 'Tool execution failed' : undefined,
                executionTime: endTime - startTime,
            };
        }
        catch (error) {
            const endTime = Date.now();
            return {
                id: toolCall.id,
                success: false,
                result: null,
                error: error instanceof Error ? error.message : String(error),
                executionTime: endTime - startTime,
            };
        }
    }
    async disconnect() {
        this.isDisconnecting = true;
        if (this.transport) {
            await this.transport.close();
        }
        this.client.close();
        this.updateStatus(Status.DISCONNECTED);
    }
    getStatus() {
        return this.status;
    }
    getDiscoveredTools() {
        return this.discoveredTools;
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
    updateStatus(status) {
        this.status = status;
        this.statusListeners.forEach(listener => {
            listener(this.serverName, status);
        });
    }
    async createTransport() {
        const config = this.serverConfig;
        // HTTP transport
        if (config.httpUrl) {
            const options = {};
            if (config.headers) {
                options.requestInit = {
                    headers: config.headers,
                };
            }
            return new StreamableHTTPClientTransport(new URL(config.httpUrl), options);
        }
        // SSE transport
        if (config.url) {
            const options = {};
            if (config.headers) {
                options.requestInit = {
                    headers: config.headers,
                };
            }
            return new SSEClientTransport(new URL(config.url), options);
        }
        // Stdio transport
        if (config.command) {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: {
                    ...process.env,
                    ...(config.env || {}),
                },
                cwd: config.cwd,
                stderr: 'pipe',
            });
            if (this.debugMode && transport.stderr) {
                transport.stderr.on('data', (data) => {
                    const stderrStr = data.toString().trim();
                    console.debug(`[MCP STDERR (${this.serverName})]:`, stderrStr);
                });
            }
            return transport;
        }
        throw new Error(`Invalid MCP server configuration: missing httpUrl, url, or command for ${this.serverName}`);
    }
    generateValidToolName(name) {
        // Replace invalid characters with underscores
        let validName = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
        // Ensure name isn't too long
        if (validName.length > 63) {
            validName = validName.slice(0, 28) + '___' + validName.slice(-32);
        }
        return validName;
    }
}
//# sourceMappingURL=mcpClient.js.map