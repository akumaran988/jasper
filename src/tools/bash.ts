import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { Tool } from '../types/index.js';
import { globalPermissionManager } from '../core/permissions.js';

const execAsync = promisify(exec);

export interface BashToolParams {
  command: string;
  timeout?: number;
  workingDirectory?: string;
  background?: boolean;
}

export class BashTool implements Tool {
  name = 'bash';
  description = 'Execute bash commands in the terminal. Supports timeout and working directory options.';
  parameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        default: 30000
      },
      workingDirectory: {
        type: 'string',
        description: 'Working directory for the command (default: current directory)'
      },
      background: {
        type: 'boolean',
        description: 'Run command in background (default: false)',
        default: false
      }
    },
    required: ['command']
  };

  private runningProcesses: Map<string, any> = new Map();

  async execute(params: Record<string, any>): Promise<any> {
    const { command, timeout = 30000, workingDirectory, background = false } = params as BashToolParams;

    if (!command?.trim()) {
      throw new Error('Command cannot be empty');
    }

    // Check permissions using the permission manager
    const toolCall = {
      id: `temp_${Date.now()}`,
      name: 'bash',
      parameters: { command, timeout, workingDirectory, background }
    };

    const hasPermission = await globalPermissionManager.requestPermission(toolCall);
    if (!hasPermission) {
      throw new Error('Permission denied by security policy');
    }

    console.log(`🐚 Executing: ${command}`);

    if (background) {
      return this.executeBackground(command, workingDirectory);
    } else {
      return this.executeSync(command, timeout, workingDirectory);
    }
  }

  private async executeSync(command: string, timeout: number, workingDirectory?: string): Promise<any> {
    try {
      const options: any = {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
        encoding: 'utf8'
      };

      if (workingDirectory) {
        options.cwd = workingDirectory;
      }

      const { stdout, stderr } = await execAsync(command, options);
      
      return {
        success: true,
        stdout: String(stdout).trim(),
        stderr: String(stderr).trim(),
        exitCode: 0,
        command,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`❌ Command failed: ${command}`, error.message);
      
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        command,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  private executeBackground(command: string, workingDirectory?: string): any {
    const processId = `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const options: any = {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      };

      if (workingDirectory) {
        options.cwd = workingDirectory;
      }

      const child = spawn(command, [], options);
      
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      this.runningProcesses.set(processId, {
        process: child,
        command,
        stdout,
        stderr,
        startTime: new Date()
      });

      child.on('exit', (code) => {
        const processInfo = this.runningProcesses.get(processId);
        if (processInfo) {
          processInfo.exitCode = code;
          processInfo.endTime = new Date();
        }
      });

      return {
        success: true,
        processId,
        message: `Started background process: ${command}`,
        command,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        command,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Additional methods for background process management
  getProcessStatus(processId: string): any {
    const processInfo = this.runningProcesses.get(processId);
    if (!processInfo) {
      return { error: 'Process not found' };
    }

    return {
      processId,
      command: processInfo.command,
      isRunning: !processInfo.process.killed && processInfo.exitCode === undefined,
      stdout: processInfo.stdout,
      stderr: processInfo.stderr,
      exitCode: processInfo.exitCode,
      startTime: processInfo.startTime,
      endTime: processInfo.endTime
    };
  }

  killProcess(processId: string): any {
    const processInfo = this.runningProcesses.get(processId);
    if (!processInfo) {
      return { success: false, error: 'Process not found' };
    }

    try {
      processInfo.process.kill('SIGTERM');
      this.runningProcesses.delete(processId);
      return { success: true, message: `Process ${processId} terminated` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const bashTool = new BashTool();