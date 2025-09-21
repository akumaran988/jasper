import { ToolDisplayHandler, DisplayContext, DisplayResult } from '../types.js';

export class DefaultDisplayHandler implements ToolDisplayHandler {
  toolName: string;
  
  constructor(toolName: string) {
    this.toolName = toolName;
  }
  
  canHandle(context: DisplayContext): boolean {
    return context.toolName === this.toolName;
  }
  
  formatResult(context: DisplayContext): DisplayResult {
    const { result } = context;
    
    if (!result.success) {
      return this.handleErrorResult(context);
    }
    
    return this.handleSuccessResult(context);
  }
  
  private handleSuccessResult(context: DisplayContext): DisplayResult {
    const { result } = context;
    
    // Try different content sources in order of preference
    if (result.stdout && result.stdout.trim()) {
      return {
        content: result.stdout.trim(),
        isFileContent: false,
        shouldCollapse: this.shouldCollapse(context)
      };
    }
    
    if (result.result) {
      if (typeof result.result === 'string') {
        return {
          content: result.result,
          isFileContent: false,
          shouldCollapse: this.shouldCollapse(context)
        };
      }
      
      // For objects, try to format nicely
      if (typeof result.result === 'object') {
        // Check if it has a specific structure we can format
        if (result.result.message) {
          let content = result.result.message;
          
          // Add additional info if available
          if (result.result.details) {
            content += '\n\nDetails:\n' + result.result.details;
          }
          
          if (result.result.data) {
            content += '\n\nData:\n' + JSON.stringify(result.result.data, null, 2);
          }
          
          return {
            content,
            isFileContent: false,
            shouldCollapse: this.shouldCollapse(context)
          };
        }
        
        // Generic object formatting
        return {
          content: JSON.stringify(result.result, null, 2),
          isFileContent: false,
          shouldCollapse: true
        };
      }
    }
    
    // Fallback for successful operations with no content
    return {
      content: `✅ ${context.toolName} operation completed successfully`,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private handleErrorResult(context: DisplayContext): DisplayResult {
    const { result } = context;
    
    let content = `❌ ${context.toolName} operation failed\n`;
    
    if (result.error) {
      content += `\nError: ${result.error}`;
    }
    
    if (result.stderr && result.stderr.trim()) {
      content += '\n\nError details:\n' + result.stderr.trim();
    }
    
    if (result.stdout && result.stdout.trim()) {
      content += '\n\nOutput:\n' + result.stdout.trim();
    }
    
    if (result.result && typeof result.result === 'object') {
      content += '\n\nAdditional info:\n' + JSON.stringify(result.result, null, 2);
    }
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  getSummary(context: DisplayContext): string {
    const { result, toolName, parameters } = context;
    
    if (!result.success) {
      return `❌ ${toolName} failed`;
    }
    
    // Try to create a meaningful summary
    if (parameters && Object.keys(parameters).length > 0) {
      const firstParam = Object.values(parameters)[0];
      if (typeof firstParam === 'string' && firstParam.length < 30) {
        return `✅ ${toolName}: ${firstParam}`;
      }
    }
    
    return `✅ ${toolName} completed`;
  }
  
  shouldCollapse(context: DisplayContext): boolean {
    const { result } = context;
    
    let contentLength = 0;
    
    if (result.stdout) contentLength += result.stdout.length;
    if (result.stderr) contentLength += result.stderr.length;
    if (typeof result.result === 'string') contentLength += result.result.length;
    if (typeof result.result === 'object') {
      contentLength += JSON.stringify(result.result).length;
    }
    
    return contentLength > 1000;
  }
}