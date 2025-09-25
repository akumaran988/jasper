import { ToolDisplayHandler, DisplayContext, DisplayResult } from './types.js';
import { FileOpsDisplayHandler } from './handlers/fileOpsHandler.js';
import { BashDisplayHandler } from './handlers/bashHandler.js';
import { WebFetchDisplayHandler } from './handlers/webFetchHandler.js';
import { TodoDisplayHandler } from './handlers/todoHandler.js';
import { DefaultDisplayHandler } from './handlers/defaultHandler.js';

export class DisplayRegistry {
  private handlers = new Map<string, ToolDisplayHandler>();
  
  constructor() {
    // Register built-in handlers
    this.registerHandler(new FileOpsDisplayHandler());
    this.registerHandler(new BashDisplayHandler());
    this.registerHandler(new WebFetchDisplayHandler());
    this.registerHandler(new TodoDisplayHandler());
  }
  
  /**
   * Register a display handler for a specific tool
   */
  registerHandler(handler: ToolDisplayHandler): void {
    this.handlers.set(handler.toolName, handler);
  }
  
  /**
   * Get the handler for a specific tool (creates default if not found)
   */
  private getHandler(toolName: string): ToolDisplayHandler {
    if (this.handlers.has(toolName)) {
      return this.handlers.get(toolName)!;
    }
    
    // Create and cache a default handler for unknown tools
    const defaultHandler = new DefaultDisplayHandler(toolName);
    this.handlers.set(toolName, defaultHandler);
    return defaultHandler;
  }
  
  /**
   * Format tool result using the appropriate handler
   */
  formatToolResult(context: DisplayContext): DisplayResult {
    const handler = this.getHandler(context.toolName);
    
    // Double-check that the handler can handle this context
    if (!handler.canHandle(context)) {
      // Fallback to default handler
      const defaultHandler = new DefaultDisplayHandler(context.toolName);
      return defaultHandler.formatResult(context);
    }
    
    return handler.formatResult(context);
  }
  
  /**
   * Get a summary for collapsed view
   */
  getSummary(context: DisplayContext): string {
    const handler = this.getHandler(context.toolName);
    return handler.getSummary(context);
  }
  
  /**
   * Check if content should be collapsed
   */
  shouldCollapse(context: DisplayContext): boolean {
    const handler = this.getHandler(context.toolName);
    return handler.shouldCollapse(context);
  }
  
  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }
  
  /**
   * Check if a specific tool has a registered handler
   */
  hasHandler(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
  
  /**
   * Remove a handler (useful for testing or dynamic reconfiguration)
   */
  unregisterHandler(toolName: string): boolean {
    return this.handlers.delete(toolName);
  }
  
  /**
   * Parse tool call information from a JSON string result
   */
  parseToolCall(jsonContent: string): { toolName: string; operation?: string; parameters: Record<string, any> } | null {
    try {
      const parsed = JSON.parse(jsonContent);
      
      // Try different patterns to extract tool information
      if (parsed.tool_name || parsed.toolName) {
        return {
          toolName: parsed.tool_name || parsed.toolName,
          operation: parsed.operation,
          parameters: parsed.parameters || parsed.params || {}
        };
      }
      
      // Look for common patterns in the result structure
      if (parsed.result && typeof parsed.result === 'object') {
        // Check if result contains tool information
        if (parsed.result.tool_name) {
          return {
            toolName: parsed.result.tool_name,
            operation: parsed.result.operation,
            parameters: parsed.result.parameters || {}
          };
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }
}

// Global registry instance
export const displayRegistry = new DisplayRegistry();