import { ToolPermissionHandler, ToolCall, PermissionContext, PermissionCheckResult, ScopeInfo } from '../types.js';

export class DefaultPermissionHandler implements ToolPermissionHandler {
  toolName: string;
  
  constructor(toolName: string) {
    this.toolName = toolName;
  }
  
  generatePermissionKey(toolCall: ToolCall): string {
    // Default: tool-only permission
    return `${toolCall.name}:tool`;
  }
  
  checkPermission(context: PermissionContext): PermissionCheckResult {
    const { toolCall, existingApprovals } = context;
    
    // Check for tool-wide approval
    const toolKey = this.generatePermissionKey(toolCall);
    if (existingApprovals.has(toolKey)) {
      const rule = existingApprovals.get(toolKey)!;
      return {
        allowed: true,
        reason: `Tool-wide permission for ${toolCall.name}`,
        matchedRule: rule
      };
    }
    
    return { allowed: false };
  }
  
  getScopeInfo(toolCall: ToolCall): ScopeInfo {
    return {
      scope: 'tool',
      description: `all ${toolCall.name} operations`
    };
  }
  
  getSessionDescription(toolCall: ToolCall): string {
    const scopeInfo = this.getScopeInfo(toolCall);
    return `Yes for this session (${scopeInfo.description})`;
  }
}