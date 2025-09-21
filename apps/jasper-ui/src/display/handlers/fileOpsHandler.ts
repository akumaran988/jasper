import { ToolDisplayHandler, DisplayContext, DisplayResult } from '../types.js';

export class FileOpsDisplayHandler implements ToolDisplayHandler {
  toolName = 'file_ops';
  
  canHandle(context: DisplayContext): boolean {
    return context.toolName === 'file_ops' && context.result.success;
  }
  
  formatResult(context: DisplayContext): DisplayResult {
    const { operation, result } = context;
    const parsed = result;
    
    // Handle different file operations
    switch (operation) {
      case 'read':
        return this.handleReadOperation(context);
      
      case 'list_dir':
        return this.handleListDirOperation(context);
      
      case 'update':
      case 'update_lines':
        return this.handleUpdateOperation(context);
      
      case 'create':
      case 'write':
        return this.handleCreateOperation(context);
      
      case 'delete':
        return this.handleDeleteOperation(context);
      
      default:
        return this.handleGenericOperation(context);
    }
  }
  
  private handleReadOperation(context: DisplayContext): DisplayResult {
    const content = context.result.result?.content || '';
    
    return {
      content,
      isFileContent: true,
      hasExistingLineNumbers: this.hasLineNumbers(content),
      shouldCollapse: this.shouldCollapse(context)
    };
  }
  
  private handleListDirOperation(context: DisplayContext): DisplayResult {
    const items = context.result.result?.items;
    
    if (!items || !Array.isArray(items)) {
      return { content: 'No items found' };
    }
    
    const formatDirectoryTree = (items: any[]) => {
      let output: string[] = [];
      
      items.forEach((item, index) => {
        const isLast = index === items.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const icon = item.type === 'directory' ? '📁 ' : '📄 ';
        
        output.push(`${prefix}${icon}${item.name}`);
      });
      
      return output.join('\n');
    };
    
    return {
      content: formatDirectoryTree(items),
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private handleUpdateOperation(context: DisplayContext): DisplayResult {
    const { result } = context;
    const diff = result.result?.diff;
    const message = result.result?.message || 'File updated';
    
    if (!diff) {
      return { content: message };
    }
    
    let output: string[] = [];
    output.push(`📝 ${message}`);
    output.push('');
    output.push('📋 Changes:');
    
    if (typeof diff === 'string') {
      // Handle unified diff format
      output.push(diff);
    } else if (diff.added || diff.removed || diff.lines) {
      if (diff.lines) {
        diff.lines.forEach((line: any) => {
          if (line.added) {
            output.push(`+ ${line.value || line.content || line}`);
          } else if (line.removed) {
            output.push(`- ${line.value || line.content || line}`);
          } else {
            output.push(`  ${line.value || line.content || line}`);
          }
        });
      } else {
        if (diff.removed) {
          output.push('🔴 Removed:');
          output.push(`- ${diff.removed}`);
        }
        if (diff.added) {
          output.push('🟢 Added:');
          output.push(`+ ${diff.added}`);
        }
      }
    }
    
    return {
      content: output.join('\n'),
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private handleCreateOperation(context: DisplayContext): DisplayResult {
    const { result } = context;
    const filePath = result.result?.file_path || context.parameters?.file_path || 'unknown';
    const operation = result.result?.operation || context.operation;
    const size = result.result?.size || result.result?.lines_added;
    
    let content = `📄 File ${operation === 'create' ? 'created' : 'written'}: ${filePath}`;
    
    if (size) {
      if (typeof size === 'number' && size > 1000) {
        content += `\n📊 Size: ${size} bytes`;
      } else {
        content += `\n📝 Lines: ${size}`;
      }
    }
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private handleDeleteOperation(context: DisplayContext): DisplayResult {
    const { result } = context;
    const filePath = result.result?.file_path || result.result?.path || context.parameters?.file_path || 'unknown';
    
    let content = `🗑️ File deleted: ${filePath}`;
    
    if (result.result?.size) {
      content += `\n📊 Size: ${result.result.size} bytes`;
    }
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private handleGenericOperation(context: DisplayContext): DisplayResult {
    const { result } = context;
    
    // Try to extract meaningful content
    if (result.result?.content) {
      return {
        content: result.result.content,
        isFileContent: true,
        hasExistingLineNumbers: this.hasLineNumbers(result.result.content),
        shouldCollapse: this.shouldCollapse(context)
      };
    }
    
    if (result.result?.message) {
      return {
        content: result.result.message,
        isFileContent: false,
        shouldCollapse: false
      };
    }
    
    // Fallback to JSON
    return {
      content: JSON.stringify(result.result, null, 2),
      isFileContent: false,
      shouldCollapse: true
    };
  }
  
  getSummary(context: DisplayContext): string {
    const { operation, parameters, result } = context;
    const filePath = parameters?.file_path || parameters?.dir_path || 'unknown';
    
    switch (operation) {
      case 'read':
        const lines = result.result?.total_lines || 'unknown';
        return `Read ${filePath} (${lines} lines)`;
      
      case 'list_dir':
        const itemCount = result.result?.total_items || result.result?.items?.length || 0;
        return `Listed ${filePath} (${itemCount} items)`;
      
      case 'update':
      case 'update_lines':
        const changes = result.result?.original_lines && result.result?.new_lines 
          ? `${result.result.original_lines}→${result.result.new_lines}` 
          : 'modified';
        return `Updated ${filePath} (${changes})`;
      
      case 'create':
        return `Created ${filePath}`;
      
      case 'delete':
        return `Deleted ${filePath}`;
      
      default:
        return `${operation || 'Operation'} on ${filePath}`;
    }
  }
  
  shouldCollapse(context: DisplayContext): boolean {
    const content = context.result.result?.content;
    if (!content || typeof content !== 'string') return false;
    
    // Collapse if content is very long
    return content.length > 2000 || content.split('\n').length > 50;
  }
  
  private hasLineNumbers(content: string): boolean {
    if (!content) return false;
    return /^\s*\d+\s/.test(content.split('\n')[0]);
  }
}