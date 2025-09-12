import { ToolPermissionHandler, ToolCall, PermissionContext, PermissionCheckResult, ScopeInfo } from './types.js';
import { FileOpsPermissionHandler } from './handlers/fileOpsHandler.js';
import { WebFetchPermissionHandler } from './handlers/webFetchHandler.js';
import { DefaultPermissionHandler } from './handlers/defaultHandler.js';
import { PermissionRule } from '../types/index.js';

export class PermissionRegistry {
  private handlers = new Map<string, ToolPermissionHandler>();
  
  constructor() {
    // Register built-in handlers
    this.registerHandler(new FileOpsPermissionHandler());
    this.registerHandler(new WebFetchPermissionHandler());
  }
  
  /**
   * Register a permission handler for a specific tool
   */
  registerHandler(handler: ToolPermissionHandler): void {
    this.handlers.set(handler.toolName, handler);
  }
  
  /**
   * Get the handler for a specific tool (creates default if not found)
   */
  private getHandler(toolName: string): ToolPermissionHandler {
    if (this.handlers.has(toolName)) {
      return this.handlers.get(toolName)!;
    }
    
    // Create and cache a default handler for unknown tools
    const defaultHandler = new DefaultPermissionHandler(toolName);
    this.handlers.set(toolName, defaultHandler);
    return defaultHandler;
  }
  
  /**
   * Generate a permission key for a tool call
   */
  generatePermissionKey(toolCall: ToolCall): string {
    const handler = this.getHandler(toolCall.name);
    return handler.generatePermissionKey(toolCall);
  }
  
  /**
   * Check if a tool call is permitted by existing approvals
   */
  checkPermission(toolCall: ToolCall, existingApprovals: Map<string, PermissionRule>): PermissionCheckResult {
    const handler = this.getHandler(toolCall.name);
    const context: PermissionContext = {
      toolCall,
      existingApprovals
    };
    
    return handler.checkPermission(context);
  }
  
  /**
   * Get scope information for a tool call
   */
  getScopeInfo(toolCall: ToolCall): ScopeInfo {
    const handler = this.getHandler(toolCall.name);
    return handler.getScopeInfo(toolCall);
  }
  
  /**
   * Get session description for a tool call
   */
  getSessionDescription(toolCall: ToolCall): string {
    const handler = this.getHandler(toolCall.name);
    return handler.getSessionDescription(toolCall);
  }
  
  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }
  
  /**
   * Create a permission rule from a tool call and response
   */
  createPermissionRule(toolCall: ToolCall): PermissionRule {
    const scopeInfo = this.getScopeInfo(toolCall);
    
    return {
      toolName: toolCall.name,
      scope: scopeInfo.scope,
      scopeValue: scopeInfo.scopeValue,
      approved: true,
      timestamp: new Date()
    };
  }
}

// Global registry instance
export const permissionRegistry = new PermissionRegistry();