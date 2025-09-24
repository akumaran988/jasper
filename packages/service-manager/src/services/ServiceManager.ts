import { v4 as uuidv4 } from 'uuid';
import type { IServiceProvider } from '../interfaces/IServiceProvider.js';
import type { IHealthChecker } from '../interfaces/IHealthChecker.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { IServiceRepository } from '../interfaces/IServiceRepository.js';
import type { ServiceConfig, ServiceInstance, ServiceStats } from '../types.js';

export class ServiceManager {
  private serviceProviders: Map<string, IServiceProvider> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private repository: IServiceRepository,
    private logger: ILogger,
    private healthChecker: IHealthChecker,
    providers: IServiceProvider[]
  ) {
    // Register service providers
    for (const provider of providers) {
      this.serviceProviders.set(provider.type, provider);
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60000); // Every minute

    this.logger.addLog('system', 'info', 'ServiceManager initialized');
  }

  async createService(config: ServiceConfig): Promise<string> {
    this.validateServiceConfig(config);

    const serviceId = uuidv4();
    const service: ServiceInstance = {
      id: serviceId,
      name: config.name,
      config,
      status: 'stopped',
      restartCount: 0,
      logs: [],
    };

    await this.repository.save(service);
    this.logger.addLog(serviceId, 'info', `Service '${config.name}' created with ID: ${serviceId}`);
    
    return serviceId;
  }

  async startService(serviceId: string): Promise<void> {
    const service = await this.getServiceOrThrow(serviceId);

    if (service.status === 'running' || service.status === 'starting') {
      throw new Error(`Service '${service.name}' is already ${service.status}`);
    }

    const provider = this.getProviderOrThrow(service.config.type);

    service.status = 'starting';
    service.startedAt = new Date();
    service.lastError = undefined;
    await this.repository.update(service);

    this.logger.addLog(serviceId, 'info', `Starting service '${service.name}' using ${service.config.type} provider`);

    try {
      await provider.start(service);
      
      service.status = 'running';
      await this.repository.update(service);
      
      this.logger.addLog(serviceId, 'info', `Service '${service.name}' started successfully`);

      // Start health checks if configured
      if (service.config.healthCheck) {
        this.healthChecker.startHealthChecks(service);
      }

    } catch (error) {
      service.status = 'error';
      service.lastError = error instanceof Error ? error.message : String(error);
      await this.repository.update(service);
      
      this.logger.addLog(serviceId, 'error', `Failed to start service: ${service.lastError}`);
      throw error;
    }
  }

  async stopService(serviceId: string): Promise<void> {
    const service = await this.getServiceOrThrow(serviceId);

    if (service.status === 'stopped' || service.status === 'stopping') {
      return;
    }

    const provider = this.getProviderOrThrow(service.config.type);

    service.status = 'stopping';
    await this.repository.update(service);

    this.logger.addLog(serviceId, 'info', `Stopping service '${service.name}'`);

    try {
      // Stop health checks
      this.healthChecker.stopHealthChecks(serviceId);

      await provider.stop(service);

      service.status = 'stopped';
      service.stoppedAt = new Date();
      await this.repository.update(service);

      this.logger.addLog(serviceId, 'info', `Service '${service.name}' stopped successfully`);

    } catch (error) {
      service.status = 'error';
      service.lastError = error instanceof Error ? error.message : String(error);
      await this.repository.update(service);
      
      this.logger.addLog(serviceId, 'error', `Failed to stop service: ${service.lastError}`);
      throw error;
    }
  }

  async restartService(serviceId: string): Promise<void> {
    const service = await this.getServiceOrThrow(serviceId);

    this.logger.addLog(serviceId, 'info', `Restarting service '${service.name}'`);
    
    if (service.status === 'running') {
      await this.stopService(serviceId);
      
      // Wait for restart delay
      const delay = service.config.restartDelay || 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    service.restartCount++;
    await this.repository.update(service);
    
    await this.startService(serviceId);
  }

  async removeService(serviceId: string): Promise<void> {
    const service = await this.getServiceOrThrow(serviceId);

    if (service.status === 'running') {
      await this.stopService(serviceId);
    }

    const provider = this.getProviderOrThrow(service.config.type);
    await provider.cleanup(service);

    await this.repository.delete(serviceId);
    this.logger.clearLogs(serviceId);
    
    this.logger.addLog('system', 'info', `Service '${service.name}' (${serviceId}) removed`);
  }

  async getService(serviceId: string): Promise<ServiceInstance | null> {
    return await this.repository.findById(serviceId);
  }

  async getAllServices(): Promise<ServiceInstance[]> {
    return await this.repository.findAll();
  }

  async getServiceStats(serviceId: string): Promise<ServiceStats | null> {
    const service = await this.getServiceOrThrow(serviceId);
    
    if (service.status !== 'running') {
      return null;
    }

    const provider = this.getProviderOrThrow(service.config.type);
    return await provider.getStats(service);
  }

  async getServiceLogs(serviceId: string, limit?: number): Promise<any[]> {
    await this.getServiceOrThrow(serviceId); // Validate service exists
    return this.logger.getLogs(serviceId, limit);
  }

  async updateServiceConfig(serviceId: string, config: Partial<ServiceConfig>): Promise<void> {
    const service = await this.getServiceOrThrow(serviceId);

    if (service.status === 'running') {
      throw new Error('Cannot update configuration while service is running. Stop the service first.');
    }

    // Merge the new config with existing config
    service.config = { ...service.config, ...config };
    
    // Validate the updated config
    this.validateServiceConfig(service.config);

    await this.repository.update(service);
    this.logger.addLog(serviceId, 'info', `Service configuration updated`);
  }

  async getServicesByStatus(status: ServiceInstance['status']): Promise<ServiceInstance[]> {
    const allServices = await this.repository.findAll();
    return allServices.filter(service => service.status === status);
  }

  async getManagerStats(): Promise<{
    totalServices: number;
    servicesByStatus: Record<string, number>;
    servicesByType: Record<string, number>;
    totalLogs: number;
    activeHealthChecks: number;
  }> {
    const services = await this.repository.findAll();
    
    const servicesByStatus: Record<string, number> = {};
    const servicesByType: Record<string, number> = {};

    for (const service of services) {
      servicesByStatus[service.status] = (servicesByStatus[service.status] || 0) + 1;
      servicesByType[service.config.type] = (servicesByType[service.config.type] || 0) + 1;
    }

    return {
      totalServices: services.length,
      servicesByStatus,
      servicesByType,
      totalLogs: this.logger.getTotalLogCount(),
      activeHealthChecks: this.healthChecker.getActiveHealthChecks().length,
    };
  }

  async shutdown(): Promise<void> {
    this.logger.addLog('system', 'info', 'Shutting down ServiceManager...');

    // Clear cleanup interval
    clearInterval(this.cleanupInterval);

    // Stop all running services
    const services = await this.repository.findAll();
    const stopPromises = services
      .filter(service => service.status === 'running')
      .map(service => this.stopService(service.id).catch(error => 
        this.logger.addLog(service.id, 'error', `Failed to stop during shutdown: ${error}`)
      ));

    await Promise.all(stopPromises);

    // Cleanup health checks
    this.healthChecker.cleanup();

    // Cleanup providers
    const cleanupPromises = services.map(service => {
      const provider = this.serviceProviders.get(service.config.type);
      return provider ? provider.cleanup(service).catch(error =>
        this.logger.addLog(service.id, 'warn', `Cleanup error: ${error}`)
      ) : Promise.resolve();
    });

    await Promise.all(cleanupPromises);

    this.logger.addLog('system', 'info', 'ServiceManager shutdown complete');
  }

  private async getServiceOrThrow(serviceId: string): Promise<ServiceInstance> {
    const service = await this.repository.findById(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }
    return service;
  }

  private getProviderOrThrow(type: string): IServiceProvider {
    const provider = this.serviceProviders.get(type);
    if (!provider) {
      throw new Error(`No provider available for service type: ${type}`);
    }
    return provider;
  }

  private validateServiceConfig(config: ServiceConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Service name is required');
    }

    if (!config.type || !['process', 'docker'].includes(config.type)) {
      throw new Error('Service type must be either "process" or "docker"');
    }

    if (config.type === 'process' && !config.command) {
      throw new Error('Command is required for process services');
    }

    if (config.type === 'docker' && !config.image) {
      throw new Error('Image is required for docker services');
    }

    // Validate health check configuration
    if (config.healthCheck) {
      const { url, command, interval, timeout } = config.healthCheck;
      
      if (!url && !command) {
        throw new Error('Health check must specify either url or command');
      }

      if (interval && (interval < 5 || interval > 3600)) {
        throw new Error('Health check interval must be between 5 and 3600 seconds');
      }

      if (timeout && (timeout < 1 || timeout > 300)) {
        throw new Error('Health check timeout must be between 1 and 300 seconds');
      }
    }

    // Validate restart configuration
    if (config.maxRestarts && config.maxRestarts < 0) {
      throw new Error('Max restarts must be non-negative');
    }

    if (config.restartDelay && config.restartDelay < 0) {
      throw new Error('Restart delay must be non-negative');
    }
  }

  private async performCleanup(): Promise<void> {
    try {
      // Cleanup logs
      this.logger.cleanup();

      // Update service statuses by checking with providers
      const services = await this.repository.findAll();
      
      for (const service of services) {
        if (service.status === 'running') {
          const provider = this.serviceProviders.get(service.config.type);
          if (provider) {
            const isRunning = await provider.isRunning(service);
            if (!isRunning) {
              service.status = 'stopped';
              service.stoppedAt = new Date();
              await this.repository.update(service);
              this.logger.addLog(service.id, 'warn', 'Service detected as stopped during cleanup');
            }
          }
        }
      }
      
    } catch (error) {
      this.logger.addLog('system', 'error', `Cleanup error: ${error}`);
    }
  }
}