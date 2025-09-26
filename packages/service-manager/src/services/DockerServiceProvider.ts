import Docker from 'dockerode';
import path from 'path';
import type { IServiceProvider } from '../interfaces/IServiceProvider.js';
import type { ServiceInstance, ServiceStats } from '../types.js';
import type { ILogger } from '../interfaces/ILogger.js';

export class DockerServiceProvider implements IServiceProvider {
  readonly type = 'docker' as const;
  private docker: Docker;

  constructor(private logger: ILogger) {
    this.docker = new Docker();
  }

  async start(service: ServiceInstance): Promise<void> {
    const { image, containerName, ports = {}, volumes = {}, env = {}, dockerArgs = [] } = service.config;
    
    if (!image) {
      throw new Error('Docker image is required for docker services');
    }

    this.logger.addLog(service.id, 'info', `Starting Docker container from image: ${image}`);

    const createOptions = this.buildCreateOptions(service, image, containerName, ports, volumes, env, dockerArgs);

    try {
      // Pull image if not present
      await this.pullImageIfNeeded(image, service.id);

      // Create container
      const container = await this.docker.createContainer(createOptions);
      service.containerId = container.id;

      this.logger.addLog(service.id, 'info', `Created container: ${container.id}`);

      // Start container
      await container.start();
      this.logger.addLog(service.id, 'info', `Started container: ${container.id}`);

      // Attach to logs
      await this.attachToLogs(container, service);

      // Monitor container
      this.monitorContainer(service, container);

    } catch (error) {
      throw new Error(`Failed to start Docker container: ${error}`);
    }
  }

  async stop(service: ServiceInstance): Promise<void> {
    if (!service.containerId) {
      return;
    }

    this.logger.addLog(service.id, 'info', `Stopping Docker container: ${service.containerId}`);

    try {
      const container = this.docker.getContainer(service.containerId);
      await container.stop({ t: 10 }); // 10 second grace period
      await container.remove();
      
      this.logger.addLog(service.id, 'info', `Stopped and removed container: ${service.containerId}`);
      service.containerId = undefined;
    } catch (error) {
      throw new Error(`Failed to stop Docker container: ${error}`);
    }
  }

  async getStats(service: ServiceInstance): Promise<ServiceStats | null> {
    if (!service.containerId) {
      return null;
    }

    try {
      const container = this.docker.getContainer(service.containerId);
      const stats = await container.stats({ stream: false });
      
      return this.parseDockerStats(stats, service);
    } catch (error) {
      this.logger.addLog(service.id, 'warn', `Failed to get Docker stats: ${error}`);
      return null;
    }
  }

  async isRunning(service: ServiceInstance): Promise<boolean> {
    if (!service.containerId) {
      return false;
    }

    try {
      const container = this.docker.getContainer(service.containerId);
      const info = await container.inspect();
      return info.State.Running;
    } catch (error) {
      return false;
    }
  }

  async cleanup(service: ServiceInstance): Promise<void> {
    if (service.containerId) {
      try {
        const container = this.docker.getContainer(service.containerId);
        const info = await container.inspect();
        
        if (info.State.Running) {
          await container.stop({ t: 5 });
        }
        
        await container.remove();
        this.logger.addLog(service.id, 'info', `Cleaned up container: ${service.containerId}`);
      } catch (error) {
        this.logger.addLog(service.id, 'warn', `Failed to cleanup container: ${error}`);
      }
    }
  }

  private buildCreateOptions(
    service: ServiceInstance,
    image: string,
    containerName: string | undefined,
    ports: Record<string, string>,
    volumes: Record<string, string>,
    env: Record<string, string>,
    dockerArgs: string[]
  ): any {
    const createOptions: any = {
      Image: image,
      name: containerName || `${service.name}-${service.id.substring(0, 8)}`,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
      HostConfig: {
        PortBindings: {},
        Binds: Object.entries(volumes).map(([host, container]) => `${this.resolveVolumePath(host)}:${container}`),
        RestartPolicy: { Name: 'no' }, // We handle restarts manually
      },
    };

    // Configure port mappings
    for (const [hostPort, containerPort] of Object.entries(ports)) {
      createOptions.HostConfig.PortBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort }];
    }

    // Apply additional docker args (would need proper parsing)
    this.applyDockerArgs(createOptions, dockerArgs);

    return createOptions;
  }

  private applyDockerArgs(createOptions: any, dockerArgs: string[]): void {
    // Basic implementation - would need more sophisticated arg parsing
    for (let i = 0; i < dockerArgs.length; i++) {
      const arg = dockerArgs[i];
      
      switch (arg) {
        case '--memory':
        case '-m':
          createOptions.HostConfig.Memory = this.parseMemoryString(dockerArgs[++i]);
          break;
        case '--cpus':
          createOptions.HostConfig.NanoCpus = parseFloat(dockerArgs[++i]) * 1000000000;
          break;
        case '--network':
          createOptions.HostConfig.NetworkMode = dockerArgs[++i];
          break;
        // Add more cases as needed
      }
    }
  }

  private parseMemoryString(memory: string): number {
    const match = memory.match(/^(\d+)([kmgt]?)b?$/i);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      case 't': return value * 1024 * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private async pullImageIfNeeded(image: string, serviceId: string): Promise<void> {
    try {
      // Check if image exists locally
      const images = await this.docker.listImages();
      const imageExists = images.some(img => 
        img.RepoTags && img.RepoTags.includes(image)
      );

      if (!imageExists) {
        this.logger.addLog(serviceId, 'info', `Pulling Docker image: ${image}`);
        const stream = await this.docker.pull(image);
        
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err: any, res: any) => {
            if (err) {
              this.logger.addLog(serviceId, 'error', `Failed to pull image: ${err}`);
              reject(err);
            } else {
              this.logger.addLog(serviceId, 'info', `Successfully pulled image: ${image}`);
              resolve(res);
            }
          });
        });
      }
    } catch (error) {
      this.logger.addLog(serviceId, 'warn', `Could not pull image ${image}: ${error}`);
      // Continue anyway - image might exist locally with different tag
    }
  }

  private async attachToLogs(container: any, service: ServiceInstance): Promise<void> {
    try {
      const logStream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
        timestamps: true,
      });

      logStream.on('data', (chunk: Buffer) => {
        const log = chunk.toString();
        // Docker logs have 8-byte header, skip it
        const cleanLog = log.length > 8 ? log.substring(8).trim() : log.trim();
        if (cleanLog) {
          this.logger.addLog(service.id, 'info', cleanLog, 'stdout');
        }
      });

      logStream.on('error', (error: Error) => {
        this.logger.addLog(service.id, 'warn', `Log stream error: ${error.message}`);
      });

    } catch (error) {
      this.logger.addLog(service.id, 'warn', `Failed to attach to logs: ${error}`);
    }
  }

  private monitorContainer(service: ServiceInstance, container: any): void {
    container.wait((err: any, data: any) => {
      if (err) {
        this.logger.addLog(service.id, 'error', `Container error: ${err}`);
        service.status = 'error';
        service.lastError = err.message;
      } else {
        this.logger.addLog(service.id, 'info', `Container exited with code: ${data.StatusCode}`);
        service.status = 'stopped';
        service.stoppedAt = new Date();
        service.containerId = undefined;
      }
    });
  }

  private parseDockerStats(stats: any, service: ServiceInstance): ServiceStats {
    const cpuPercent = this.calculateCpuPercent(stats);
    const memoryUsage = stats.memory_stats?.usage || 0;
    
    return {
      cpu: cpuPercent,
      memory: memoryUsage,
      network: {
        rx: stats.networks?.eth0?.rx_bytes || 0,
        tx: stats.networks?.eth0?.tx_bytes || 0,
      },
      uptime: service.startedAt ? Math.floor((Date.now() - service.startedAt.getTime()) / 1000) : 0,
    };
  }

  private calculateCpuPercent(stats: any): number {
    if (!stats.cpu_stats || !stats.precpu_stats) {
      return 0;
    }

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats.system_cpu_usage || 0);
    const numberCpus = stats.cpu_stats.online_cpus || 1;

    if (systemDelta === 0) return 0;

    return Math.round((cpuDelta / systemDelta) * numberCpus * 100 * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Resolve volume paths to absolute paths for Docker
   * Docker requires absolute paths for host directory mounts
   */
  private resolveVolumePath(hostPath: string): string {
    // If it's already absolute, return as-is
    if (path.isAbsolute(hostPath)) {
      return hostPath;
    }

    // If it starts with ./ or ../, resolve to absolute path
    if (hostPath.startsWith('./') || hostPath.startsWith('../')) {
      return path.resolve(process.cwd(), hostPath);
    }

    // For other relative paths, resolve from current working directory
    return path.resolve(process.cwd(), hostPath);
  }
}