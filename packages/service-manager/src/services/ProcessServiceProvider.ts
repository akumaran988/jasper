import { spawn, ChildProcess } from 'child_process';
import psTree from 'ps-tree';
import { promisify } from 'util';
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

    this.logger.addLog(service.id, 'info', `Starting process: ${command} ${args.join(' ')}`);

    const childProcess = spawn(command, args, {
      cwd: workingDir,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
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
      // Get all child processes
      const children = await psTreeAsync(service.pid);
      
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
      process.kill(service.pid, 'SIGTERM');

      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (service.pid) {
          try {
            process.kill(service.pid, 'SIGKILL');
            this.logger.addLog(service.id, 'warn', `Force killed process ${service.pid}`);
          } catch (error) {
            // Process already dead
          }
        }
      }, 5000);

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
}