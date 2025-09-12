import { PermissionRule } from '../types/index.js';

export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface PermissionContext {
  toolCall: ToolCall;
  existingApprovals: Map<string, PermissionRule>;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  matchedRule?: PermissionRule;
}

export interface ScopeInfo {
  scope: 'tool' | 'domain' | 'folder' | 'custom';
  scopeValue?: string;
  description: string;
}

export interface ToolPermissionHandler {
  /**
   * The name of the tool this handler manages
   */
  toolName: string;
  
  /**
   * Generate a permission key for this tool call
   */
  generatePermissionKey(toolCall: ToolCall): string;
  
  /**
   * Check if an existing approval covers this tool call
   */
  checkPermission(context: PermissionContext): PermissionCheckResult;
  
  /**
   * Get scope information for session permissions
   */
  getScopeInfo(toolCall: ToolCall): ScopeInfo;
  
  /**
   * Get a human-readable description for the session permission
   */
  getSessionDescription(toolCall: ToolCall): string;
}