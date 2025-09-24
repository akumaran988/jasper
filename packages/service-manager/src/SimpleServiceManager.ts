/**
 * Simplified Service Manager for demonstration
 * This shows how jasper-ui could use the service manager directly
 */

export interface ServiceConfig {
  name: string;
  type: 'process' | 'docker';
  command?: string;
  args?: string[];
  workingDir?: string;
  env?: Record<string, string>;
  image?: string;
  ports?: Record<string, string>;
  autoRestart?: boolean;
}

export interface ServiceInstance {
  id: string;
  config: ServiceConfig;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  pid?: number;
  startTime?: Date;
  error?: string;
}

export class SimpleServiceManager {
  private services = new Map<string, ServiceInstance>();
  private nextId = 1;

  /**
   * Create a new service
   */
  async createService(config: ServiceConfig): Promise<string> {
    const id = `service-${this.nextId++}`;
    const service: ServiceInstance = {
      id,
      config,
      status: 'stopped'
    };
    
    this.services.set(id, service);
    console.log(`Created service: ${config.name} (${id})`);
    return id;
  }

  /**
   * Start a service
   */
  async startService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    service.status = 'starting';
    console.log(`Starting service: ${service.config.name}`);
    
    // Simulate startup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    service.status = 'running';
    service.startTime = new Date();
    service.pid = Math.floor(Math.random() * 10000) + 1000;
    
    console.log(`Service started: ${service.config.name} (PID: ${service.pid})`);
  }

  /**
   * Stop a service
   */
  async stopService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    service.status = 'stopping';
    console.log(`Stopping service: ${service.config.name}`);
    
    // Simulate shutdown
    await new Promise(resolve => setTimeout(resolve, 500));
    
    service.status = 'stopped';
    service.pid = undefined;
    service.startTime = undefined;
    
    console.log(`Service stopped: ${service.config.name}`);
  }

  /**
   * List all services
   */
  listServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  /**
   * Get a specific service
   */
  getService(serviceId: string): ServiceInstance | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Remove a service
   */
  async removeService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    if (service.status === 'running') {
      await this.stopService(serviceId);
    }

    this.services.delete(serviceId);
    console.log(`Removed service: ${service.config.name}`);
  }

  /**
   * Get manager statistics
   */
  getStats(): {
    totalServices: number;
    runningServices: number;
    stoppedServices: number;
  } {
    const services = this.listServices();
    return {
      totalServices: services.length,
      runningServices: services.filter(s => s.status === 'running').length,
      stoppedServices: services.filter(s => s.status === 'stopped').length,
    };
  }
}