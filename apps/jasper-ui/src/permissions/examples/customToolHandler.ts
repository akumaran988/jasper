/**
 * Example: Custom Permission Handler for a hypothetical "database_query" tool
 * 
 * This example shows how to create a permission handler for a new tool.
 * The database tool might want to approve permissions based on:
 * - Database name/connection
 * - Query type (SELECT, INSERT, UPDATE, DELETE)  
 * - Table access patterns
 */

import { ToolPermissionHandler, ToolCall, PermissionContext, PermissionCheckResult, ScopeInfo } from '../types.js';

export class DatabaseQueryPermissionHandler implements ToolPermissionHandler {
  toolName = 'database_query';
  
  generatePermissionKey(toolCall: ToolCall): string {
    // Strategy 1: Permission per database
    if (toolCall.parameters?.database) {
      const database = toolCall.parameters.database;
      return `${toolCall.name}:database:${database}`;
    }
    
    // Strategy 2: Permission per query type
    if (toolCall.parameters?.queryType) {
      const queryType = toolCall.parameters.queryType.toUpperCase();
      return `${toolCall.name}:queryType:${queryType}`;
    }
    
    // Strategy 3: Permission per table (if specified)
    if (toolCall.parameters?.table) {
      const table = toolCall.parameters.table;
      return `${toolCall.name}:table:${table}`;
    }
    
    // Fallback to tool-only permission
    return `${toolCall.name}:tool`;
  }
  
  checkPermission(context: PermissionContext): PermissionCheckResult {
    const { toolCall, existingApprovals } = context;
    
    // Check exact key match first
    const exactKey = this.generatePermissionKey(toolCall);
    if (existingApprovals.has(exactKey)) {
      const rule = existingApprovals.get(exactKey)!;
      return {
        allowed: true,
        reason: `Exact permission match: ${exactKey}`,
        matchedRule: rule
      };
    }
    
    // Custom logic: Check if we have database-wide permission
    if (toolCall.parameters?.database) {
      const requestedDatabase = toolCall.parameters.database;
      
      for (const [key, rule] of existingApprovals.entries()) {
        if (rule.toolName === 'database_query' && rule.scope === 'custom' && rule.scopeValue === `database:${requestedDatabase}`) {
          return {
            allowed: true,
            reason: `Database-wide permission for ${requestedDatabase}`,
            matchedRule: rule
          };
        }
      }
    }
    
    // Custom logic: Check query type permissions (e.g., SELECT might be more permissive)
    if (toolCall.parameters?.queryType) {
      const queryType = toolCall.parameters.queryType.toUpperCase();
      
      for (const [key, rule] of existingApprovals.entries()) {
        if (rule.toolName === 'database_query' && rule.scope === 'custom' && rule.scopeValue === `queryType:${queryType}`) {
          return {
            allowed: true,
            reason: `Query type permission for ${queryType} operations`,
            matchedRule: rule
          };
        }
      }
      
      // Special case: If user approved SELECT, also allow DESCRIBE/SHOW operations
      if (['DESCRIBE', 'SHOW', 'EXPLAIN'].includes(queryType)) {
        for (const [key, rule] of existingApprovals.entries()) {
          if (rule.toolName === 'database_query' && rule.scope === 'custom' && rule.scopeValue === 'queryType:SELECT') {
            return {
              allowed: true,
              reason: `${queryType} allowed under SELECT permissions (read-only operation)`,
              matchedRule: rule
            };
          }
        }
      }
    }
    
    return { allowed: false };
  }
  
  getScopeInfo(toolCall: ToolCall): ScopeInfo {
    // Prioritize database-level permissions for session approvals
    if (toolCall.parameters?.database) {
      return {
        scope: 'custom',
        scopeValue: `database:${toolCall.parameters.database}`,
        description: `all queries on database ${toolCall.parameters.database}`
      };
    }
    
    if (toolCall.parameters?.queryType) {
      return {
        scope: 'custom',
        scopeValue: `queryType:${toolCall.parameters.queryType.toUpperCase()}`,
        description: `all ${toolCall.parameters.queryType.toUpperCase()} operations`
      };
    }
    
    return {
      scope: 'tool',
      description: 'all database operations'
    };
  }
  
  getSessionDescription(toolCall: ToolCall): string {
    const scopeInfo = this.getScopeInfo(toolCall);
    return `Yes for this session (${scopeInfo.description})`;
  }
}

// Usage example:
// import { permissionRegistry } from '../registry.js';
// import { DatabaseQueryPermissionHandler } from './customToolHandler.js';
// 
// // Register the handler
// permissionRegistry.registerHandler(new DatabaseQueryPermissionHandler());