import { Tool } from '../types/index.js';
import type { MCPClientManager, MCPTool, MCPToolCall } from '../../../../packages/mcp-client-lib/src/index.js';

export class MCPToolWrapper implements Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: Record<string, any>;
  public readonly prompt?: string;

  constructor(
    private readonly mcpTool: MCPTool,
    private readonly clientManager: MCPClientManager
  ) {
    this.name = mcpTool.name;
    this.description = `${mcpTool.description} (from ${mcpTool.serverName} MCP server)`;
    this.parameters = mcpTool.parameters;
    this.prompt = mcpTool.prompt;
  }

  async execute(params: Record<string, any>): Promise<any> {
    const toolCall: MCPToolCall = {
      id: `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: this.mcpTool.name,
      parameters: params
    };

    const result = await this.clientManager.callTool(toolCall);
    
    if (!result.success) {
      throw new Error(result.error || 'MCP tool execution failed');
    }

    return result.result;
  }

  static fromMCPTool(mcpTool: MCPTool, clientManager: MCPClientManager): MCPToolWrapper {
    return new MCPToolWrapper(mcpTool, clientManager);
  }
}