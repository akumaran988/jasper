import { EventEmitter } from 'events';

export interface ServiceDefinition {
  name?: string;
  mcpServer: string; // Reference to MCP server ID
  config: {
    name: string;
    type: 'process' | 'docker';
    command?: string;
    args?: string[];
    image?: string;
    ports?: Record<string, string>;
    volumes?: Record<string, string>;
    env?: Record<string, string>;
    workingDir?: string;
    healthCheck?: {
      url?: string;
      command?: string;
      interval?: number;
    };
    autoRestart?: boolean;
    restartDelay?: number;
    maxRestarts?: number;
  };
  deployment?: {
    environment?: 'local' | 'remote';
    region?: string;
    namespace?: string;
  };
}

export interface ServiceInstance {
  id: string;
  definition: ServiceDefinition;
  mcpServerId: string;
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

export interface DeploymentTarget {
  id: string;
  mcpServer: string;
  environment: 'local' | 'remote';
  region?: string;
  namespace?: string;
  available: boolean;
  services: string[]; // Service IDs deployed to this target
}

export class ServiceDeploymentManager extends EventEmitter {
  private mcpManager: any; // MCPManager
  private serviceDefinitions: Map<string, ServiceDefinition> = new Map();
  private serviceInstances: Map<string, ServiceInstance> = new Map();
  private deploymentTargets: Map<string, DeploymentTarget> = new Map();

  constructor(mcpManager: any) {
    super();
    this.mcpManager = mcpManager;
  }

  /**
   * Initialize with service definitions
   */
  async initialize(serviceDefinitions: Record<string, ServiceDefinition>): Promise<void> {
    console.log('🚀 Initializing Service Deployment Manager...');
    
    // Store service definitions
    for (const [serviceId, definition] of Object.entries(serviceDefinitions)) {
      definition.name = definition.name || serviceId;
      this.serviceDefinitions.set(serviceId, definition);
    }

    // Create deployment targets based on available MCP servers
    await this.discoverDeploymentTargets();
    
    console.log(`✅ Service Deployment Manager initialized with ${this.serviceDefinitions.size} services`);
  }

  /**
   * Discover available deployment targets from MCP servers
   */
  private async discoverDeploymentTargets(): Promise<void> {
    const servers = this.mcpManager.getAvailableServers();

    for (const serverId of servers) {
      const allStatuses = this.mcpManager.getAllServerStatuses();
      const serverStatus = allStatuses[serverId];

      const target: DeploymentTarget = {
        id: serverId,
        mcpServer: serverId,
        environment: serverId.includes('local') ? 'local' : 'remote',
        available: serverStatus === 'connected' || false,
        services: []
      };
      
      this.deploymentTargets.set(serverId, target);
    }
  }

  /**
   * Deploy a service to its configured target
   */
  async deployService(serviceId: string): Promise<ServiceInstance> {
    const definition = this.serviceDefinitions.get(serviceId);
    if (!definition) {
      throw new Error(`Service definition not found: ${serviceId}`);
    }

    const mcpServer = definition.mcpServer;
    const target = this.deploymentTargets.get(mcpServer);
    
    if (!target || !target.available) {
      throw new Error(`Deployment target not available: ${mcpServer}`);
    }

    console.log(`🚀 Deploying service ${serviceId} to ${mcpServer}...`);

    try {
      // Execute service creation through MCP
      const result = await this.mcpManager.executeTool(mcpServer, 'create_service', definition.config);

      // Extract service ID from MCP response format: {content: [{type: "text", text: "service-1"}]}
      const actualServiceId = result?.content?.[0]?.text || result?.serviceId || `${serviceId}-${Date.now()}`;

      const serviceInstance: ServiceInstance = {
        id: actualServiceId,
        definition,
        mcpServerId: mcpServer,
        status: 'pending',
        lastUpdated: new Date()
      };

      this.serviceInstances.set(serviceInstance.id, serviceInstance);
      target.services.push(serviceInstance.id);

      // Start the service
      await this.startService(serviceInstance.id);
      
      console.log(`✅ Service deployed successfully: ${serviceId}`);
      this.emit('serviceDeployed', serviceInstance);
      
      return serviceInstance;
      
    } catch (error) {
      console.error(`❌ Failed to deploy service ${serviceId}:`, error);
      this.emit('deploymentError', serviceId, error);
      throw error;
    }
  }

  /**
   * Start a deployed service
   */
  async startService(instanceId: string): Promise<void> {
    const instance = this.serviceInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    try {
      instance.status = 'starting';
      this.emit('serviceStatusChanged', instance);

      await this.mcpManager.executeTool(instance.mcpServerId, 'start_service', {
        serviceId: instance.id
      });

      instance.status = 'running';
      instance.lastUpdated = new Date();
      
      console.log(`✅ Service started: ${instance.definition.name}`);
      this.emit('serviceStarted', instance);
      
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to start service ${instanceId}:`, error);
      this.emit('serviceError', instance, error);
      throw error;
    }
  }

  /**
   * Stop a service
   */
  async stopService(instanceId: string): Promise<void> {
    const instance = this.serviceInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    try {
      await this.mcpManager.executeTool(instance.mcpServerId, 'stop_service', {
        serviceId: instance.id
      });

      instance.status = 'stopped';
      instance.lastUpdated = new Date();
      
      console.log(`🛑 Service stopped: ${instance.definition.name}`);
      this.emit('serviceStopped', instance);
      
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to stop service ${instanceId}:`, error);
      this.emit('serviceError', instance, error);
      throw error;
    }
  }

  /**
   * Get service status from MCP server
   */
  async refreshServiceStatus(instanceId: string): Promise<ServiceInstance> {
    const instance = this.serviceInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    try {
      const status = await this.mcpManager.executeTool(instance.mcpServerId, 'get_service', {
        serviceId: instance.id
      });

      // Update instance with latest status
      instance.status = this.mapMCPStatus(status.status);
      instance.lastUpdated = new Date();
      instance.metadata = {
        pid: status.pid,
        containerId: status.containerId,
        ports: status.ports,
        logs: status.logs
      };

      this.emit('serviceStatusChanged', instance);
      return instance;
      
    } catch (error) {
      instance.status = 'unknown';
      instance.error = error instanceof Error ? error.message : String(error);
      this.emit('serviceError', instance, error);
      return instance;
    }
  }

  /**
   * Map MCP service status to our status
   */
  private mapMCPStatus(mcpStatus: string): ServiceInstance['status'] {
    switch (mcpStatus?.toLowerCase()) {
      case 'running': return 'running';
      case 'stopped': return 'stopped';
      case 'starting': return 'starting';
      case 'error': return 'error';
      default: return 'unknown';
    }
  }

  /**
   * Deploy multiple services with dependency ordering
   */
  async deployServices(serviceIds: string[], options?: {
    parallel?: boolean;
    maxConcurrent?: number;
  }): Promise<ServiceInstance[]> {
    const { parallel = false, maxConcurrent = 3 } = options || {};
    
    if (parallel) {
      // Deploy services in parallel with concurrency limit
      const results: ServiceInstance[] = [];
      const batches = this.chunkArray(serviceIds, maxConcurrent);
      
      for (const batch of batches) {
        const batchPromises = batch.map(id => this.deployService(id));
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            console.error('Deployment failed:', result.reason);
          }
        }
      }
      
      return results;
    } else {
      // Deploy services sequentially
      const results: ServiceInstance[] = [];
      for (const serviceId of serviceIds) {
        try {
          const instance = await this.deployService(serviceId);
          results.push(instance);
        } catch (error) {
          console.error(`Failed to deploy service ${serviceId}:`, error);
          // Continue with next service
        }
      }
      return results;
    }
  }

  /**
   * Utility to chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get all service instances
   */
  getAllServices(): ServiceInstance[] {
    return Array.from(this.serviceInstances.values());
  }

  /**
   * Get services by deployment target
   */
  getServicesByTarget(targetId: string): ServiceInstance[] {
    return Array.from(this.serviceInstances.values())
      .filter(instance => instance.mcpServerId === targetId);
  }

  /**
   * Get services by status
   */
  getServicesByStatus(status: ServiceInstance['status']): ServiceInstance[] {
    return Array.from(this.serviceInstances.values())
      .filter(instance => instance.status === status);
  }

  /**
   * Get deployment targets
   */
  getDeploymentTargets(): DeploymentTarget[] {
    return Array.from(this.deploymentTargets.values());
  }

  /**
   * Remove a service instance
   */
  async removeService(instanceId: string): Promise<void> {
    const instance = this.serviceInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    try {
      // Stop the service first if it's running
      if (instance.status === 'running') {
        await this.stopService(instanceId);
      }

      // Remove from MCP server
      await this.mcpManager.executeTool(instance.mcpServerId, 'remove_service', {
        serviceId: instance.id
      });

      // Remove from our tracking
      this.serviceInstances.delete(instanceId);
      
      // Remove from deployment target
      const target = this.deploymentTargets.get(instance.mcpServerId);
      if (target) {
        target.services = target.services.filter(id => id !== instanceId);
      }

      console.log(`🗑️ Service removed: ${instance.definition.name}`);
      this.emit('serviceRemoved', instance);
      
    } catch (error) {
      console.error(`❌ Failed to remove service ${instanceId}:`, error);
      this.emit('serviceError', instance, error);
      throw error;
    }
  }

  /**
   * Get service logs
   */
  async getServiceLogs(instanceId: string, options?: {
    limit?: number;
    since?: Date;
  }): Promise<string[]> {
    const instance = this.serviceInstances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    try {
      const result = await this.mcpManager.executeTool(instance.mcpServerId, 'get_service_logs', {
        serviceId: instance.id,
        limit: options?.limit || 100
      });

      return result.logs || [];
      
    } catch (error) {
      console.error(`❌ Failed to get logs for service ${instanceId}:`, error);
      return [];
    }
  }

  /**
   * Refresh all service statuses
   */
  async refreshAllServices(): Promise<void> {
    const instances = Array.from(this.serviceInstances.keys());
    const refreshPromises = instances.map(id => 
      this.refreshServiceStatus(id).catch(error => 
        console.error(`Failed to refresh status for ${id}:`, error)
      )
    );
    
    await Promise.allSettled(refreshPromises);
  }
}