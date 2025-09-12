import { ToolDisplayHandler, DisplayContext, DisplayResult } from '../types.js';

export class BashDisplayHandler implements ToolDisplayHandler {
  toolName = 'bash';
  
  canHandle(context: DisplayContext): boolean {
    return context.toolName === 'bash';
  }
  
  formatResult(context: DisplayContext): DisplayResult {
    const { result, parameters } = context;
    const command = parameters?.command || 'unknown command';
    
    if (!result.success) {
      return this.handleErrorResult(context);
    }
    
    return this.handleSuccessResult(context);
  }
  
  private handleSuccessResult(context: DisplayContext): DisplayResult {
    const { result, parameters } = context;
    const command = parameters?.command || 'unknown command';
    
    let content = '';
    
    // Add command header
    content += `💻 Command: ${command}\n`;
    
    // Add execution info if available
    if (result.result?.duration) {
      content += `⏱️ Duration: ${result.result.duration}ms\n`;
    }
    
    if (result.result?.exitCode !== undefined) {
      content += `📋 Exit code: ${result.result.exitCode}\n`;
    }
    
    content += '\n';
    
    // Add stdout if present
    if (result.stdout && result.stdout.trim()) {
      content += '📤 Output:\n';
      content += result.stdout.trim();
    }
    
    // Add stderr if present (even for successful commands)
    if (result.stderr && result.stderr.trim()) {
      content += content ? '\n\n' : '';
      content += '⚠️ Warnings:\n';
      content += result.stderr.trim();
    }
    
    // Special handling for common commands
    if (this.isListCommand(parameters?.command)) {
      return {
        content: this.formatListOutput(result.stdout || ''),
        isFileContent: false,
        shouldCollapse: false
      };
    }
    
    if (this.isProcessCommand(parameters?.command)) {
      return {
        content: this.formatProcessOutput(result.stdout || '', command),
        isFileContent: false,
        shouldCollapse: false
      };
    }
    
    return {
      content: content || 'Command executed successfully (no output)',
      isFileContent: false,
      shouldCollapse: this.shouldCollapse(context)
    };
  }
  
  private handleErrorResult(context: DisplayContext): DisplayResult {
    const { result, parameters } = context;
    const command = parameters?.command || 'unknown command';
    
    let content = '';
    content += `💻 Command: ${command}\n`;
    content += `❌ Failed with exit code: ${result.result?.exitCode || 'unknown'}\n\n`;
    
    if (result.stderr && result.stderr.trim()) {
      content += '🔴 Error output:\n';
      content += result.stderr.trim();
    }
    
    if (result.stdout && result.stdout.trim()) {
      content += content ? '\n\n' : '';
      content += '📤 Standard output:\n';
      content += result.stdout.trim();
    }
    
    if (result.error) {
      content += content ? '\n\n' : '';
      content += `🚨 System error: ${result.error}`;
    }
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: false
    };
  }
  
  private formatListOutput(stdout: string): string {
    // Enhanced formatting for ls, dir, find, etc.
    if (!stdout.trim()) return 'No files found';
    
    const lines = stdout.trim().split('\n');
    
    // Try to detect if it's detailed listing (ls -l style)
    if (lines.some(line => /^[d\-rwx]/.test(line))) {
      return '📁 Directory listing:\n' + stdout.trim();
    }
    
    // Simple file list
    const fileCount = lines.length;
    return `📁 Found ${fileCount} item${fileCount !== 1 ? 's' : ''}:\n` + stdout.trim();
  }
  
  private formatProcessOutput(stdout: string, command: string): string {
    // Enhanced formatting for ps, top, htop, etc.
    if (!stdout.trim()) return 'No processes found';
    
    return `🔄 Process information (${command}):\n` + stdout.trim();
  }
  
  getSummary(context: DisplayContext): string {
    const { result, parameters } = context;
    const command = this.truncateCommand(parameters?.command || 'unknown');
    
    if (!result.success) {
      const exitCode = result.result?.exitCode;
      return `❌ ${command} (exit ${exitCode || 'error'})`;
    }
    
    const duration = result.result?.duration;
    if (duration) {
      return `✅ ${command} (${duration}ms)`;
    }
    
    return `✅ ${command}`;
  }
  
  shouldCollapse(context: DisplayContext): boolean {
    const { result } = context;
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const totalOutput = stdout + stderr;
    
    // Collapse if output is very long
    return totalOutput.length > 1500 || totalOutput.split('\n').length > 30;
  }
  
  private isListCommand(command?: string): boolean {
    if (!command) return false;
    return /^(ls|dir|find|locate)\b/.test(command.trim());
  }
  
  private isProcessCommand(command?: string): boolean {
    if (!command) return false;
    return /^(ps|top|htop|pgrep)\b/.test(command.trim());
  }
  
  private truncateCommand(command: string, maxLength: number = 50): string {
    if (command.length <= maxLength) return command;
    return command.substring(0, maxLength - 3) + '...';
  }
}