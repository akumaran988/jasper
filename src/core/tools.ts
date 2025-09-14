import { Tool, ToolCall, ToolResult } from '../types/index.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(toolName: string): void {
    this.tools.delete(toolName);
  }

  get(toolName: string): Tool | undefined {
    return this.tools.get(toolName);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    
    if (!tool) {
      return {
        id: toolCall.id,
        success: false,
        result: null,
        error: `Tool '${toolCall.name}' not found`
      };
    }

    try {
      const startTime = Date.now();
      const result = await tool.execute(toolCall.parameters);
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      return {
        id: toolCall.id,
        success: true,
        result,
        executionTime
      };
    } catch (error) {
      const startTime = Date.now();
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      return {
        id: toolCall.id,
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      };
    }
  }

  async executeMultiple(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    
    for (const toolCall of toolCalls) {
      const result = await this.execute(toolCall);
      results.push(result);
      
      // If a tool fails, continue with remaining tools
    }
    
    return results;
  }

  validateToolCall(toolCall: ToolCall): boolean {
    const tool = this.tools.get(toolCall.name);
    if (!tool) return false;

    // Basic parameter validation could be added here
    // For now, we'll just check if the tool exists
    return true;
  }

  getToolsForLLM(): Tool[] {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: tool.execute // This won't be serialized to the LLM, but kept for local execution
    }));
  }
}

// Singleton instance for global tool registry
export const globalToolRegistry = new ToolRegistry();