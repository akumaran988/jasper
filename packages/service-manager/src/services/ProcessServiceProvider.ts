import { spawn, ChildProcess } from 'child_process';
import psTree from 'ps-tree';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import type { IServiceProvider } from '../interfaces/IServiceProvider.js';
import type { ServiceInstance, ServiceStats } from '../types.js';
import type { ILogger } from '../interfaces/ILogger.js';

const psTreeAsync = promisify(psTree);

export class ProcessServiceProvider implements IServiceProvider {
  readonly type = 'process' as const;
  private processes: Map<string, ChildProcess> = new Map();

  constructor(private logger: ILogger) {}

  async start(service: ServiceInstance): Promise<void> {
    const { command, args = [], env = {}, workingDir } = service.config;

    if (!command) {
      throw new Error('Command is required for process services');
    }

    // Validate and resolve working directory
    const resolvedWorkingDir = this.resolveWorkingDirectory(workingDir);

    this.logger.addLog(service.id, 'info', `Starting process: ${command} ${args.join(' ')}`);
    this.logger.addLog(service.id, 'debug', `Working directory: ${resolvedWorkingDir}`);

    // Windows-specific command handling
    const { finalCommand, finalArgs } = this.prepareCommandForPlatform(command, args);

    // Log the resolved command if it changed
    if (finalCommand !== command) {
      this.logger.addLog(service.id, 'debug', `Resolved command: ${finalCommand} ${finalArgs.join(' ')}`);
    }

    const childProcess = spawn(finalCommand, finalArgs, {
      cwd: resolvedWorkingDir,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32', // Use shell on Windows for better command resolution
      windowsHide: true, // Hide console window on Windows
    });

    if (!childProcess.pid) {
      throw new Error('Failed to start process - no PID assigned');
    }

    service.pid = childProcess.pid;
    this.processes.set(service.id, childProcess);

    // Handle process output
    childProcess.stdout?.on('data', (data) => {
      this.logger.addLog(service.id, 'info', data.toString().trim(), 'stdout');
    });

    childProcess.stderr?.on('data', (data) => {
      this.logger.addLog(service.id, 'warn', data.toString().trim(), 'stderr');
    });

    childProcess.on('exit', (code, signal) => {
      this.logger.addLog(service.id, 'info', `Process exited with code ${code}, signal ${signal}`);
      service.status = 'stopped';
      service.stoppedAt = new Date();
      service.pid = undefined;
      this.processes.delete(service.id);
    });

    childProcess.on('error', (error) => {
      this.logger.addLog(service.id, 'error', `Process error: ${error.message}`);
      service.status = 'error';
      service.lastError = error.message;
      this.processes.delete(service.id);
    });

    // Wait for process to start
    await this.waitForProcessStart(childProcess);
  }

  async stop(service: ServiceInstance): Promise<void> {
    if (!service.pid) {
      return;
    }

    this.logger.addLog(service.id, 'info', `Stopping process with PID: ${service.pid}`);

    try {
      if (process.platform === 'win32') {
        // Windows process termination
        await this.stopWindowsProcess(service);
      } else {
        // Unix/Linux process termination
        await this.stopUnixProcess(service);
      }

      this.processes.delete(service.id);

    } catch (error) {
      throw new Error(`Failed to stop process: ${error}`);
    }
  }

  async getStats(service: ServiceInstance): Promise<ServiceStats | null> {
    if (!service.pid) {
      return null;
    }

    try {
      // Basic implementation - would need platform-specific code for detailed stats
      const isRunning = await this.isProcessRunning(service.pid);
      
      if (!isRunning) {
        return null;
      }

      return {
        cpu: 0, // Would implement using platform-specific APIs
        memory: 0, // Would read from /proc/<pid>/status on Linux
        uptime: service.startedAt ? Math.floor((Date.now() - service.startedAt.getTime()) / 1000) : 0,
      };
    } catch (error) {
      this.logger.addLog(service.id, 'warn', `Failed to get process stats: ${error}`);
      return null;
    }
  }

  async isRunning(service: ServiceInstance): Promise<boolean> {
    if (!service.pid) {
      return false;
    }

    return this.isProcessRunning(service.pid);
  }

  async cleanup(service: ServiceInstance): Promise<void> {
    this.processes.delete(service.id);
  }

  private async waitForProcessStart(childProcess: ChildProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Process start timeout'));
      }, 10000);

      childProcess.on('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      // If process exits immediately, it's likely an error
      childProcess.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Process exited immediately with code ${code}`));
        }
      });
    });
  }

  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
      return true;
    } catch (error) {
      return false;
    }
  }

  private resolveWorkingDirectory(workingDir?: string): string {
    if (!workingDir) {
      return process.cwd();
    }

    // Resolve relative paths to absolute paths
    const resolved = path.resolve(workingDir);

    // Validate that the directory exists
    if (!fs.existsSync(resolved)) {
      throw new Error(`Working directory does not exist: ${resolved}`);
    }

    // Validate that it's actually a directory
    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) {
      throw new Error(`Working directory is not a directory: ${resolved}`);
    }

    return resolved;
  }

  private prepareCommandForPlatform(command: string, args: string[]): { finalCommand: string; finalArgs: string[] } {
    if (process.platform === 'win32') {
      // Windows-specific handling

      // Handle executable files with full paths or relative paths
      if (command.endsWith('.exe')) {
        const resolvedCommand = this.resolveExecutablePath(command);
        return {
          finalCommand: resolvedCommand,
          finalArgs: args
        };
      }

      // Handle common Node.js commands
      if (command === 'npm' || command === 'yarn' || command === 'node') {
        return {
          finalCommand: command + '.cmd', // Use .cmd version on Windows
          finalArgs: args
        };
      }

      // Handle PowerShell scripts
      if (command.endsWith('.ps1')) {
        const resolvedScript = this.resolveScriptPath(command);
        return {
          finalCommand: 'powershell.exe',
          finalArgs: ['-ExecutionPolicy', 'Bypass', '-File', resolvedScript, ...args]
        };
      }

      // Handle batch files
      if (command.endsWith('.bat') || command.endsWith('.cmd')) {
        const resolvedScript = this.resolveScriptPath(command);
        return {
          finalCommand: 'cmd.exe',
          finalArgs: ['/c', resolvedScript, ...args]
        };
      }

      // Handle Windows executables without extension
      // Try to find .exe version first
      const possibleExe = command + '.exe';
      if (this.fileExists(possibleExe)) {
        const resolvedCommand = this.resolveExecutablePath(possibleExe);
        return {
          finalCommand: resolvedCommand,
          finalArgs: args
        };
      }
    }

    // Default behavior for Unix/Linux/macOS or unhandled Windows commands
    return {
      finalCommand: command,
      finalArgs: args
    };
  }

  private resolveExecutablePath(exePath: string): string {
    // If it's already an absolute path, validate and return
    if (path.isAbsolute(exePath)) {
      if (!fs.existsSync(exePath)) {
        throw new Error(`Executable not found: ${exePath}`);
      }
      return exePath;
    }

    // If it's a relative path, resolve relative to current working directory
    const resolvedPath = path.resolve(exePath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }

    // If not found in current directory, try to find in common locations
    const commonPaths = [
      path.join(process.cwd(), exePath),
      path.join(process.cwd(), 'bin', exePath),
      path.join(process.cwd(), 'tools', exePath),
      path.join(process.cwd(), 'executables', exePath),
      path.join(process.cwd(), 'vendor', exePath),
      path.join(__dirname, '..', '..', 'bin', exePath),
    ];

    for (const testPath of commonPaths) {
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    // If still not found, return as-is and let spawn handle it
    // This allows for executables in PATH or will fail with a descriptive error
    return exePath;
  }

  private resolveScriptPath(scriptPath: string): string {
    // If it's already an absolute path, validate and return
    if (path.isAbsolute(scriptPath)) {
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script not found: ${scriptPath}`);
      }
      return scriptPath;
    }

    // If it's a relative path, resolve relative to current working directory
    const resolvedPath = path.resolve(scriptPath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }

    // Try common script locations
    const commonPaths = [
      path.join(process.cwd(), scriptPath),
      path.join(process.cwd(), 'scripts', scriptPath),
      path.join(process.cwd(), 'tools', scriptPath),
    ];

    for (const testPath of commonPaths) {
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    // Return as-is if not found in common locations
    return scriptPath;
  }

  private fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  private async stopWindowsProcess(service: ServiceInstance): Promise<void> {
    const pid = service.pid!;

    try {
      // First try taskkill for graceful termination
      const { spawn } = await import('child_process');
      const taskkill = spawn('taskkill', ['/pid', pid.toString(), '/t'], {
        stdio: 'ignore',
        windowsHide: true
      });

      await new Promise<void>((resolve) => {
        taskkill.on('close', () => resolve());
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      });

      // Check if process is still running
      if (await this.isProcessRunning(pid)) {
        // Force kill if still running
        const forceKill = spawn('taskkill', ['/pid', pid.toString(), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true
        });

        await new Promise<void>((resolve) => {
          forceKill.on('close', () => resolve());
          setTimeout(resolve, 3000);
        });

        this.logger.addLog(service.id, 'warn', `Force killed Windows process ${pid}`);
      }

    } catch (error) {
      this.logger.addLog(service.id, 'error', `Failed to stop Windows process: ${error}`);
    }
  }

  private async stopUnixProcess(service: ServiceInstance): Promise<void> {
    const pid = service.pid!;

    try {
      // Get all child processes
      const children = await psTreeAsync(pid);

      // Kill child processes first
      for (const child of children) {
        try {
          process.kill(parseInt(child.PID), 'SIGTERM');
        } catch (error) {
          // Process might already be dead
          this.logger.addLog(service.id, 'debug', `Could not kill child process ${child.PID}: ${error}`);
        }
      }

      // Kill main process
      process.kill(pid, 'SIGTERM');

      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (service.pid) {
          try {
            process.kill(service.pid, 'SIGKILL');
            this.logger.addLog(service.id, 'warn', `Force killed Unix process ${service.pid}`);
          } catch (error) {
            // Process already dead
          }
        }
      }, 5000);

    } catch (error) {
      this.logger.addLog(service.id, 'error', `Failed to stop Unix process: ${error}`);
    }
  }
}