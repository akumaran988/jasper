/**
 * Direct Service Manager for jasper-ui
 * Uses the unified service manager directly (no MCP overhead)
 */

import { createServiceManager, type ServiceConfig, type ServiceInstance as ServiceManagerInstance } from '../../../../packages/service-manager/dist/index.js';
import { EventEmitter } from 'events';

export interface JasperServiceDefinition {
  name: string;
  config: ServiceConfig;
  deployment?: {
    environment: 'local' | 'remote';
    region?: string;
    namespace?: string;
  };
}

export interface JasperServiceInstance {
  id: string;
  definition: JasperServiceDefinition;
  status: 'pending' | 'starting' | 'running' | 'stopped' | 'error' | 'unknown';
  lastUpdated: Date;
  error?: string;
  metadata?: {
    pid?: number;
    containerId?: string;
    ports?: Record<string, string>;
    logs?: string[];
  };
}

/**
 * Direct Service Manager for jasper-ui
 * No MCP server overhead - direct function calls!
 */
export class DirectServiceManager extends EventEmitter {
  private serviceManager = createServiceManager();
  private deployedServices = new Map<string, JasperServiceInstance>();

  /**
   * Deploy a service directly (no MCP calls needed!)
   */
  async deployService(definition: JasperServiceDefinition): Promise<string> {
    console.log(`🚀 Deploying service directly: ${definition.name}`);

    try {
      // Create service directly using unified service manager
      const serviceId = await this.serviceManager.createService(definition.config);
      
      // Track the deployed service
      const instance: JasperServiceInstance = {
        id: serviceId,
        definition,
        status: 'pending',
        lastUpdated: new Date()
      };
      
      this.deployedServices.set(serviceId, instance);
      this.emit('serviceDeployed', instance);
      
      console.log(`✅ Service deployed directly: ${definition.name} (${serviceId})`);
      return serviceId;
      
    } catch (error) {
      console.error(`❌ Failed to deploy service: ${definition.name}`, error);
      throw error;
    }
  }

  /**
   * Start a service directly
   */
  async startService(serviceId: string): Promise<void> {
    console.log(`▶️ Starting service directly: ${serviceId}`);

    try {
      const instance = this.deployedServices.get(serviceId);
      if (!instance) {
        throw new Error(`Service not found: ${serviceId}`);
      }

      instance.status = 'starting';
      instance.lastUpdated = new Date();
      this.emit('serviceStatusChanged', instance);

      // Start service directly using unified service manager
      await this.serviceManager.startService(serviceId);
      
      instance.status = 'running';
      instance.lastUpdated = new Date();
      this.emit('serviceStatusChanged', instance);
      
      console.log(`✅ Service started directly: ${serviceId}`);
      
    } catch (error) {
      const instance = this.deployedServices.get(serviceId);
      if (instance) {
        instance.status = 'error';
        instance.error = error instanceof Error ? error.message : String(error);
        instance.lastUpdated = new Date();
        this.emit('serviceStatusChanged', instance);
      }
      console.error(`❌ Failed to start service: ${serviceId}`, error);
      throw error;
    }
  }

  /**
   * Stop a service directly
   */
  async stopService(serviceId: string): Promise<void> {
    console.log(`⏹️ Stopping service directly: ${serviceId}`);

    try {
      const instance = this.deployedServices.get(serviceId);
      if (!instance) {
        throw new Error(`Service not found: ${serviceId}`);
      }

      instance.status = 'stopped';
      instance.lastUpdated = new Date();
      
      // Stop service directly using unified service manager  
      await this.serviceManager.stopService(serviceId);
      
      this.emit('serviceStatusChanged', instance);
      console.log(`✅ Service stopped directly: ${serviceId}`);
      
    } catch (error) {
      console.error(`❌ Failed to stop service: ${serviceId}`, error);
      throw error;
    }
  }

  /**
   * Get service status directly
   */
  getServiceStatus(serviceId: string): JasperServiceInstance | undefined {
    return this.deployedServices.get(serviceId);
  }

  /**
   * List all services directly
   */
  listServices(): JasperServiceInstance[] {
    return Array.from(this.deployedServices.values());
  }

  /**
   * Get service manager stats directly
   */
  async getManagerStats() {
    return this.serviceManager.getStats();
  }

  /**
   * Remove a service directly
   */
  async removeService(serviceId: string): Promise<void> {
    console.log(`🗑️ Removing service directly: ${serviceId}`);

    try {
      // Remove from unified service manager
      await this.serviceManager.removeService(serviceId);
      
      // Remove from tracking
      this.deployedServices.delete(serviceId);
      
      this.emit('serviceRemoved', serviceId);
      console.log(`✅ Service removed directly: ${serviceId}`);
      
    } catch (error) {
      console.error(`❌ Failed to remove service: ${serviceId}`, error);
      throw error;
    }
  }

  /**
   * Deploy multiple services in sequence
   */
  async deployServices(definitions: JasperServiceDefinition[]): Promise<string[]> {
    console.log(`📦 Deploying ${definitions.length} services directly`);
    
    const serviceIds: string[] = [];
    
    for (const definition of definitions) {
      try {
        const serviceId = await this.deployService(definition);
        serviceIds.push(serviceId);
      } catch (error) {
        console.error(`Failed to deploy ${definition.name}:`, error);
        // Continue with other services
      }
    }
    
    console.log(`✅ Deployed ${serviceIds.length}/${definitions.length} services directly`);
    return serviceIds;
  }

  /**
   * Start multiple services in sequence  
   */
  async startServices(serviceIds: string[]): Promise<void> {
    console.log(`▶️ Starting ${serviceIds.length} services directly`);
    
    for (const serviceId of serviceIds) {
      try {
        await this.startService(serviceId);
      } catch (error) {
        console.error(`Failed to start ${serviceId}:`, error);
        // Continue with other services
      }
    }
    
    console.log(`✅ Started services directly`);
  }
}