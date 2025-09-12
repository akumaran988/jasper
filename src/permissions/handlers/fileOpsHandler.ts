import path from 'path';
import { ToolPermissionHandler, ToolCall, PermissionContext, PermissionCheckResult, ScopeInfo } from '../types.js';

export class FileOpsPermissionHandler implements ToolPermissionHandler {
  toolName = 'file_ops';
  
  generatePermissionKey(toolCall: ToolCall): string {
    if (toolCall.parameters?.file_path) {
      const filePath = toolCall.parameters.file_path;
      const folder = path.dirname(filePath);
      return `${toolCall.name}:folder:${folder}`;
    }
    
    if (toolCall.parameters?.dir_path) {
      return `${toolCall.name}:folder:${toolCall.parameters.dir_path}`;
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
    
    // For file operations, check folder hierarchy
    if (toolCall.parameters?.file_path) {
      const requestedFilePath = toolCall.parameters.file_path;
      
      for (const [key, rule] of existingApprovals.entries()) {
        if (rule.toolName === 'file_ops' && rule.scope === 'folder' && rule.scopeValue) {
          const approvedFolder = rule.scopeValue;
          
          // Check if the requested file is within the approved folder or its subfolders
          if (this.isPathWithinFolder(requestedFilePath, approvedFolder)) {
            return {
              allowed: true,
              reason: `File ${requestedFilePath} is within approved folder ${approvedFolder}`,
              matchedRule: rule
            };
          }
        }
      }
    }
    
    // For directory operations, check if the directory is within approved folders
    if (toolCall.parameters?.dir_path) {
      const requestedDirPath = toolCall.parameters.dir_path;
      
      for (const [key, rule] of existingApprovals.entries()) {
        if (rule.toolName === 'file_ops' && rule.scope === 'folder' && rule.scopeValue) {
          const approvedFolder = rule.scopeValue;
          
          if (this.isPathWithinFolder(requestedDirPath, approvedFolder)) {
            return {
              allowed: true,
              reason: `Directory ${requestedDirPath} is within approved folder ${approvedFolder}`,
              matchedRule: rule
            };
          }
        }
      }
    }
    
    return { allowed: false };
  }
  
  getScopeInfo(toolCall: ToolCall): ScopeInfo {
    if (toolCall.parameters?.file_path) {
      const folder = path.dirname(toolCall.parameters.file_path);
      return {
        scope: 'folder',
        scopeValue: folder,
        description: `all files in ${folder}`
      };
    }
    
    if (toolCall.parameters?.dir_path) {
      return {
        scope: 'folder',
        scopeValue: toolCall.parameters.dir_path,
        description: `all files in ${toolCall.parameters.dir_path}`
      };
    }
    
    return {
      scope: 'tool',
      description: 'all file operations'
    };
  }
  
  getSessionDescription(toolCall: ToolCall): string {
    const scopeInfo = this.getScopeInfo(toolCall);
    return `Yes for this session (${scopeInfo.description})`;
  }
  
  private isPathWithinFolder(filePath: string, folderPath: string): boolean {
    // Normalize paths to handle different separators and resolve relative paths
    const normalizedFile = path.resolve(filePath);
    const normalizedFolder = path.resolve(folderPath);
    
    // Check if file is exactly the folder or within it
    return normalizedFile === normalizedFolder || 
           normalizedFile.startsWith(normalizedFolder + path.sep);
  }
}