import { spawn, ChildProcess } from 'child_process';
import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import psTree from 'ps-tree';
import { promisify } from 'util';
import type { ServiceConfig, ServiceInstance, LogEntry, ServiceStats } from './types.js';

const psTreeAsync = promisify(psTree);

export class ServiceManager {
  private services: Map<string, ServiceInstance> = new Map();
  private docker: Docker;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.docker = new Docker();
    
    // Cleanup interval for logs and stopped services
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  async createService(config: ServiceConfig): Promise<string> {
    const serviceId = uuidv4();
    const service: ServiceInstance = {
      id: serviceId,
      name: config.name,
      config,
      status: 'stopped',
      restartCount: 0,
      logs: [],
    };

    this.services.set(serviceId, service);
    this.addLog(serviceId, 'info', `Service '${config.name}' created with ID: ${serviceId}`);
    
    return serviceId;
  }

  async startService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (service.status === 'running' || service.status === 'starting') {
      throw new Error(`Service '${service.name}' is already ${service.status}`);
    }

    service.status = 'starting';
    service.startedAt = new Date();
    this.addLog(serviceId, 'info', `Starting service '${service.name}'`);

    try {
      if (service.config.type === 'docker') {
        await this.startDockerService(service);
      } else {
        await this.startProcessService(service);
      }

      service.status = 'running';
      this.addLog(serviceId, 'info', `Service '${service.name}' started successfully`);

      // Start health checks if configured
      if (service.config.healthCheck) {
        this.startHealthChecks(service);
      }

    } catch (error) {
      service.status = 'error';
      service.lastError = error instanceof Error ? error.message : String(error);
      this.addLog(serviceId, 'error', `Failed to start service: ${service.lastError}`);
      throw error;
    }
  }

  async stopService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (service.status === 'stopped' || service.status === 'stopping') {
      return;
    }

    service.status = 'stopping';
    this.addLog(serviceId, 'info', `Stopping service '${service.name}'`);

    try {
      if (service.config.type === 'docker' && service.containerId) {
        await this.stopDockerService(service);
      } else if (service.pid) {
        await this.stopProcessService(service);
      }

      service.status = 'stopped';
      service.stoppedAt = new Date();
      this.addLog(serviceId, 'info', `Service '${service.name}' stopped`);

    } catch (error) {
      service.status = 'error';
      service.lastError = error instanceof Error ? error.message : String(error);
      this.addLog(serviceId, 'error', `Failed to stop service: ${service.lastError}`);
      throw error;
    }
  }

  async restartService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    this.addLog(serviceId, 'info', `Restarting service '${service.name}'`);
    
    if (service.status === 'running') {
      await this.stopService(serviceId);
      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, service.config.restartDelay || 2000));
    }

    service.restartCount++;
    await this.startService(serviceId);
  }

  async removeService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (service.status === 'running') {
      await this.stopService(serviceId);
    }

    this.services.delete(serviceId);
    this.addLog(serviceId, 'info', `Service '${service.name}' removed`);
  }

  getService(serviceId: string): ServiceInstance | undefined {
    return this.services.get(serviceId);
  }

  getAllServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  async getServiceStats(serviceId: string): Promise<ServiceStats | null> {
    const service = this.services.get(serviceId);
    if (!service || service.status !== 'running') {
      return null;
    }

    try {
      if (service.config.type === 'docker' && service.containerId) {
        return await this.getDockerStats(service.containerId);
      } else if (service.pid) {
        return await this.getProcessStats(service.pid);
      }
    } catch (error) {
      this.addLog(serviceId, 'warn', `Failed to get stats: ${error}`);
    }

    return null;
  }

  private async startProcessService(service: ServiceInstance): Promise<void> {
    const { command, args = [], env = {}, workingDir } = service.config;
    
    if (!command) {
      throw new Error('Command is required for process services');
    }

    const childProcess = spawn(command, args, {
      cwd: workingDir,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    service.pid = childProcess.pid;

    // Handle process output
    childProcess.stdout?.on('data', (data) => {
      this.addLog(service.id, 'info', data.toString().trim(), 'stdout');
    });

    childProcess.stderr?.on('data', (data) => {
      this.addLog(service.id, 'warn', data.toString().trim(), 'stderr');
    });

    childProcess.on('exit', (code, signal) => {
      this.addLog(service.id, 'info', `Process exited with code ${code}, signal ${signal}`);
      service.status = 'stopped';
      service.stoppedAt = new Date();
      service.pid = undefined;

      // Auto-restart if configured
      if (service.config.autoRestart && service.status !== 'stopping') {
        this.handleAutoRestart(service);
      }
    });

    childProcess.on('error', (error) => {
      this.addLog(service.id, 'error', `Process error: ${error.message}`);
      service.status = 'error';
      service.lastError = error.message;
    });

    // Wait for process to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Process start timeout'));
      }, 10000);

      childProcess.on('spawn', () => {
        clearTimeout(timeout);
        resolve(undefined);
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async startDockerService(service: ServiceInstance): Promise<void> {
    const { image, containerName, ports = {}, volumes = {}, env = {}, dockerArgs = [] } = service.config;
    
    if (!image) {
      throw new Error('Docker image is required for docker services');
    }

    const createOptions: any = {
      Image: image,
      name: containerName || `${service.name}-${service.id}`,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
      HostConfig: {
        PortBindings: {},
        Binds: Object.entries(volumes).map(([host, container]) => `${host}:${container}`),
        RestartPolicy: { Name: 'no' }, // We handle restarts manually
      },
    };

    // Configure port mappings
    for (const [hostPort, containerPort] of Object.entries(ports)) {
      createOptions.HostConfig.PortBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort }];
    }

    try {
      // Pull image if not present
      await this.pullDockerImage(image);

      // Create container
      const container = await this.docker.createContainer(createOptions);
      service.containerId = container.id;

      // Start container
      await container.start();

      // Attach to logs
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        timestamps: true,
      });

      logStream.on('data', (chunk) => {
        const log = chunk.toString();
        this.addLog(service.id, 'info', log.trim(), 'stdout');
      });

      // Monitor container
      this.monitorDockerContainer(service);

    } catch (error) {
      throw new Error(`Failed to start Docker container: ${error}`);
    }
  }

  private async stopProcessService(service: ServiceInstance): Promise<void> {
    if (!service.pid) return;

    try {
      // Get all child processes
      const children = await psTreeAsync(service.pid);
      
      // Kill child processes first
      for (const child of children) {
        try {
          process.kill(parseInt(child.PID), 'SIGTERM');
        } catch (error) {
          // Process might already be dead
        }
      }

      // Kill main process
      process.kill(service.pid, 'SIGTERM');

      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (service.pid) {
          try {
            process.kill(service.pid, 'SIGKILL');
          } catch (error) {
            // Process already dead
          }
        }
      }, 5000);

    } catch (error) {
      throw new Error(`Failed to stop process: ${error}`);
    }
  }

  private async stopDockerService(service: ServiceInstance): Promise<void> {
    if (!service.containerId) return;

    try {
      const container = this.docker.getContainer(service.containerId);
      await container.stop({ t: 10 }); // 10 second grace period
      await container.remove();
      service.containerId = undefined;
    } catch (error) {
      throw new Error(`Failed to stop Docker container: ${error}`);
    }
  }

  private async pullDockerImage(image: string): Promise<void> {
    try {
      const stream = await this.docker.pull(image);
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: any, res: any) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
    } catch (error) {
      // Image might already exist locally
      console.warn(`Could not pull image ${image}:`, error);
    }
  }

  private async monitorDockerContainer(service: ServiceInstance): Promise<void> {
    if (!service.containerId) return;

    const container = this.docker.getContainer(service.containerId);
    
    try {
      container.wait((err: any, data: any) => {
        if (err) {
          this.addLog(service.id, 'error', `Container error: ${err}`);
          service.status = 'error';
          service.lastError = err.message;
        } else {
          this.addLog(service.id, 'info', `Container exited with code: ${data.StatusCode}`);
          service.status = 'stopped';
          service.stoppedAt = new Date();
          service.containerId = undefined;

          // Auto-restart if configured
          if (service.config.autoRestart && service.status !== 'stopping') {
            this.handleAutoRestart(service);
          }
        }
      });
    } catch (error) {
      this.addLog(service.id, 'error', `Monitor error: ${error}`);
    }
  }

  private async getDockerStats(containerId: string): Promise<ServiceStats> {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    
    const cpuPercent = this.calculateCpuPercent(stats);
    const memoryUsage = stats.memory_stats.usage || 0;
    
    return {
      cpu: cpuPercent,
      memory: memoryUsage,
      network: {
        rx: stats.networks?.eth0?.rx_bytes || 0,
        tx: stats.networks?.eth0?.tx_bytes || 0,
      },
      uptime: Math.floor((Date.now() - Date.parse(stats.read)) / 1000),
    };
  }

  private async getProcessStats(pid: number): Promise<ServiceStats> {
    // Basic process stats (would need platform-specific implementation for detailed stats)
    return {
      cpu: 0, // Would need to implement CPU calculation
      memory: 0, // Would need to read from /proc or similar
      uptime: 0, // Would need to calculate from process start time
    };
  }

  private calculateCpuPercent(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const numberCpus = stats.cpu_stats.online_cpus || 1;
    
    return (cpuDelta / systemDelta) * numberCpus * 100.0;
  }

  private startHealthChecks(service: ServiceInstance): void {
    const { healthCheck } = service.config;
    if (!healthCheck) return;

    const interval = setInterval(async () => {
      try {
        let isHealthy = false;

        if (healthCheck.url) {
          const response = await fetch(healthCheck.url, {
            signal: AbortSignal.timeout(healthCheck.timeout || 5000),
          });
          isHealthy = response.ok;
        } else if (healthCheck.command) {
          // Execute health check command
          isHealthy = await this.executeHealthCheckCommand(healthCheck.command);
        }

        service.healthStatus = isHealthy ? 'healthy' : 'unhealthy';
        
        if (!isHealthy) {
          this.addLog(service.id, 'warn', 'Health check failed');
          service.status = 'unhealthy';
        } else if (service.status === 'unhealthy') {
          service.status = 'running';
          this.addLog(service.id, 'info', 'Health check passed');
        }

      } catch (error) {
        service.healthStatus = 'unhealthy';
        this.addLog(service.id, 'warn', `Health check error: ${error}`);
      }
    }, (healthCheck.interval || 30) * 1000);

    // Store interval for cleanup (would need to store in service instance)
  }

  private async executeHealthCheckCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const process = spawn('sh', ['-c', command]);
      process.on('exit', (code) => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
    });
  }

  private handleAutoRestart(service: ServiceInstance): void {
    const maxRestarts = service.config.maxRestarts || 5;
    
    if (service.restartCount >= maxRestarts) {
      this.addLog(service.id, 'error', `Max restart attempts reached (${maxRestarts})`);
      service.status = 'error';
      return;
    }

    const delay = service.config.restartDelay || 5000;
    this.addLog(service.id, 'info', `Auto-restarting in ${delay}ms (attempt ${service.restartCount + 1})`);
    
    setTimeout(() => {
      this.restartService(service.id).catch((error) => {
        this.addLog(service.id, 'error', `Auto-restart failed: ${error}`);
      });
    }, delay);
  }

  private addLog(serviceId: string, level: LogEntry['level'], message: string, source?: LogEntry['source']): void {
    const service = this.services.get(serviceId);
    if (!service) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      source,
    };

    service.logs.push(logEntry);

    // Keep only last 1000 log entries per service
    if (service.logs.length > 1000) {
      service.logs = service.logs.slice(-1000);
    }
  }

  private cleanup(): void {
    // Clean up old logs and stopped services
    for (const service of this.services.values()) {
      // Remove old log entries (older than 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      service.logs = service.logs.filter(log => log.timestamp > oneDayAgo);
    }
  }

  shutdown(): void {
    clearInterval(this.cleanupInterval);
    
    // Stop all running services
    for (const service of this.services.values()) {
      if (service.status === 'running') {
        this.stopService(service.id).catch(console.error);
      }
    }
  }
}