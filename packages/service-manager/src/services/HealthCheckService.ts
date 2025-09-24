import { spawn } from 'child_process';
import type { IHealthChecker } from '../interfaces/IHealthChecker.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { ServiceInstance } from '../types.js';

export class HealthCheckService implements IHealthChecker {
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(private logger: ILogger) {}

  startHealthChecks(service: ServiceInstance): void {
    const { healthCheck } = service.config;
    if (!healthCheck) {
      return;
    }

    // Stop existing health checks for this service
    this.stopHealthChecks(service.id);

    const interval = setInterval(async () => {
      try {
        const isHealthy = await this.checkHealth(service);
        
        const previousStatus = service.healthStatus;
        service.healthStatus = isHealthy ? 'healthy' : 'unhealthy';
        
        // Log status changes
        if (previousStatus !== service.healthStatus) {
          this.logger.addLog(
            service.id, 
            isHealthy ? 'info' : 'warn', 
            `Health status changed: ${previousStatus} -> ${service.healthStatus}`
          );
        }

        // Update service status based on health
        if (!isHealthy && service.status === 'running') {
          service.status = 'unhealthy';
          this.logger.addLog(service.id, 'warn', 'Service marked as unhealthy due to failed health check');
        } else if (isHealthy && service.status === 'unhealthy') {
          service.status = 'running';
          this.logger.addLog(service.id, 'info', 'Service recovered - health check passed');
        }

      } catch (error) {
        service.healthStatus = 'unknown';
        this.logger.addLog(service.id, 'error', `Health check error: ${error}`);
      }
    }, (healthCheck.interval || 30) * 1000);

    this.healthCheckIntervals.set(service.id, interval);
    this.logger.addLog(
      service.id, 
      'info', 
      `Started health checks (interval: ${healthCheck.interval || 30}s)`
    );
  }

  stopHealthChecks(serviceId: string): void {
    const interval = this.healthCheckIntervals.get(serviceId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(serviceId);
      this.logger.addLog(serviceId, 'info', 'Stopped health checks');
    }
  }

  async checkHealth(service: ServiceInstance): Promise<boolean> {
    const { healthCheck } = service.config;
    if (!healthCheck) {
      return true; // No health check configured = healthy
    }

    try {
      if (healthCheck.url) {
        return await this.checkHttpHealth(healthCheck.url, healthCheck.timeout || 5000);
      } else if (healthCheck.command) {
        return await this.checkCommandHealth(healthCheck.command, healthCheck.timeout || 5000);
      }
      
      return true;
    } catch (error) {
      this.logger.addLog(service.id, 'debug', `Health check failed: ${error}`);
      return false;
    }
  }

  private async checkHttpHealth(url: string, timeout: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        method: 'GET',
        headers: {
          'User-Agent': 'Jasper-ServiceManager-HealthCheck/1.0',
        },
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Health check timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  private async checkCommandHealth(command: string, timeout: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGKILL');
        reject(new Error(`Health check command timeout after ${timeout}ms`));
      }, timeout);

      const childProcess = spawn('sh', ['-c', command], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('exit', (code, signal) => {
        clearTimeout(timeoutId);
        
        if (signal) {
          reject(new Error(`Health check command killed by signal: ${signal}`));
        } else {
          resolve(code === 0);
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Health check command error: ${error.message}`));
      });
    });
  }

  cleanup(): void {
    // Stop all health checks
    for (const [serviceId] of this.healthCheckIntervals) {
      this.stopHealthChecks(serviceId);
    }
  }

  getActiveHealthChecks(): string[] {
    return Array.from(this.healthCheckIntervals.keys());
  }

  getHealthCheckStats(): { activeChecks: number; serviceIds: string[] } {
    return {
      activeChecks: this.healthCheckIntervals.size,
      serviceIds: Array.from(this.healthCheckIntervals.keys()),
    };
  }
}