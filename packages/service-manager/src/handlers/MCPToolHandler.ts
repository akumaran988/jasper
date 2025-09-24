import type { ServiceManager } from '../services/ServiceManager.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { ServiceConfig } from '../types.js';

export class MCPToolHandler {
  constructor(
    private serviceManager: ServiceManager,
    private logger: ILogger
  ) {}

  async handleToolCall(toolName: string, args: any): Promise<any> {
    try {
      switch (toolName) {
        case 'create_service':
          return await this.handleCreateService(args);
        case 'start_service':
          return await this.handleStartService(args);
        case 'stop_service':
          return await this.handleStopService(args);
        case 'restart_service':
          return await this.handleRestartService(args);
        case 'remove_service':
          return await this.handleRemoveService(args);
        case 'get_service':
          return await this.handleGetService(args);
        case 'list_services':
          return await this.handleListServices(args);
        case 'get_service_stats':
          return await this.handleGetServiceStats(args);
        case 'get_service_logs':
          return await this.handleGetServiceLogs(args);
        case 'get_manager_stats':
          return await this.handleGetManagerStats(args);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  }

  private async handleCreateService(args: any): Promise<any> {
    const config: ServiceConfig = {
      name: args.name,
      type: args.type,
      // Process specific
      command: args.command,
      args: args.args,
      env: args.env,
      workingDir: args.workingDir,
      // Docker specific
      image: args.image,
      containerName: args.containerName,
      ports: args.ports,
      volumes: args.volumes,
      dockerArgs: args.dockerArgs,
      // Service management
      healthCheck: args.healthCheck,
      autoRestart: args.autoRestart,
      restartDelay: args.restartDelay,
      maxRestarts: args.maxRestarts,
    };

    const serviceId = await this.serviceManager.createService(config);
    
    return {
      content: [{
        type: 'text',
        text: `✅ Service created successfully!\n\n**Service ID:** ${serviceId}\n**Name:** ${config.name}\n**Type:** ${config.type}\n\nUse \`start_service\` to start the service.`
      }],
    };
  }

  private async handleStartService(args: any): Promise<any> {
    await this.serviceManager.startService(args.serviceId);
    const service = await this.serviceManager.getService(args.serviceId);
    
    return {
      content: [{
        type: 'text',
        text: `✅ Service started successfully!\n\n**Service:** ${service?.name}\n**Status:** ${service?.status}\n**Started at:** ${service?.startedAt?.toISOString()}`
      }],
    };
  }

  private async handleStopService(args: any): Promise<any> {
    await this.serviceManager.stopService(args.serviceId);
    const service = await this.serviceManager.getService(args.serviceId);
    
    return {
      content: [{
        type: 'text',
        text: `🛑 Service stopped successfully!\n\n**Service:** ${service?.name}\n**Status:** ${service?.status}\n**Stopped at:** ${service?.stoppedAt?.toISOString()}`
      }],
    };
  }

  private async handleRestartService(args: any): Promise<any> {
    await this.serviceManager.restartService(args.serviceId);
    const service = await this.serviceManager.getService(args.serviceId);
    
    return {
      content: [{
        type: 'text',
        text: `🔄 Service restarted successfully!\n\n**Service:** ${service?.name}\n**Status:** ${service?.status}\n**Restart count:** ${service?.restartCount}\n**Started at:** ${service?.startedAt?.toISOString()}`
      }],
    };
  }

  private async handleRemoveService(args: any): Promise<any> {
    const service = await this.serviceManager.getService(args.serviceId);
    const serviceName = service?.name || 'Unknown';
    
    await this.serviceManager.removeService(args.serviceId);
    
    return {
      content: [{
        type: 'text',
        text: `🗑️ Service removed successfully!\n\n**Service:** ${serviceName}\n**Service ID:** ${args.serviceId}`
      }],
    };
  }

  private async handleGetService(args: any): Promise<any> {
    const service = await this.serviceManager.getService(args.serviceId);
    
    if (!service) {
      return {
        content: [{ type: 'text', text: `❌ Service not found: ${args.serviceId}` }],
        isError: true,
      };
    }

    const statusIcon = this.getStatusIcon(service.status);
    const uptime = service.startedAt && service.status === 'running' 
      ? Math.floor((Date.now() - service.startedAt.getTime()) / 1000) 
      : 0;

    return {
      content: [{
        type: 'text',
        text: `# Service Details

**${statusIcon} ${service.name}** (\`${service.id}\`)

## Status Information
- **Status:** ${service.status}
- **Type:** ${service.config.type}
- **Health:** ${service.healthStatus || 'unknown'}
- **Restart Count:** ${service.restartCount}
- **Uptime:** ${uptime > 0 ? `${uptime}s` : 'N/A'}

## Timestamps
- **Created:** ${service.startedAt ? 'N/A' : 'Available'}
- **Started:** ${service.startedAt?.toISOString() || 'Not started'}
- **Stopped:** ${service.stoppedAt?.toISOString() || 'Not stopped'}

## Configuration
- **Command:** ${service.config.command || 'N/A'}
- **Image:** ${service.config.image || 'N/A'}
- **Args:** ${service.config.args?.join(' ') || 'None'}
- **Auto Restart:** ${service.config.autoRestart ? '✅' : '❌'}
- **Health Check:** ${service.config.healthCheck ? '✅' : '❌'}

${service.lastError ? `## Last Error\n\`\`\`\n${service.lastError}\n\`\`\`` : ''}
        `
      }],
    };
  }

  private async handleListServices(args: any): Promise<any> {
    const services = args.status 
      ? await this.serviceManager.getServicesByStatus(args.status)
      : await this.serviceManager.getAllServices();

    if (services.length === 0) {
      return {
        content: [{
          type: 'text',
          text: args.status 
            ? `No services found with status: ${args.status}`
            : 'No services found. Create a service first using `create_service`.'
        }],
      };
    }

    const serviceList = services.map(service => {
      const statusIcon = this.getStatusIcon(service.status);
      const uptime = service.startedAt && service.status === 'running' 
        ? Math.floor((Date.now() - service.startedAt.getTime()) / 1000) 
        : 0;
      
      return `${statusIcon} **${service.name}** (\`${service.id.substring(0, 8)}\`)
   Type: ${service.config.type} | Status: ${service.status}${uptime > 0 ? ` | Uptime: ${uptime}s` : ''}${service.restartCount > 0 ? ` | Restarts: ${service.restartCount}` : ''}`;
    }).join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `# Services List${args.status ? ` (Status: ${args.status})` : ''}\n\n${serviceList}\n\n**Total:** ${services.length} service${services.length !== 1 ? 's' : ''}`
      }],
    };
  }

  private async handleGetServiceStats(args: any): Promise<any> {
    const service = await this.serviceManager.getService(args.serviceId);
    if (!service) {
      return {
        content: [{ type: 'text', text: `❌ Service not found: ${args.serviceId}` }],
        isError: true,
      };
    }

    const stats = await this.serviceManager.getServiceStats(args.serviceId);
    
    if (!stats) {
      return {
        content: [{
          type: 'text',
          text: `📊 No statistics available for service: ${service.name}\n\nStatistics are only available for running services.`
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: `# Service Statistics: ${service.name}

## Performance Metrics
- **CPU Usage:** ${stats.cpu ? `${stats.cpu.toFixed(2)}%` : 'N/A'}
- **Memory Usage:** ${stats.memory ? this.formatBytes(stats.memory) : 'N/A'}
- **Uptime:** ${stats.uptime ? `${stats.uptime}s` : 'N/A'}

${stats.network ? `## Network
- **Bytes Received:** ${this.formatBytes(stats.network.rx)}
- **Bytes Transmitted:** ${this.formatBytes(stats.network.tx)}` : ''}

**Last Updated:** ${new Date().toISOString()}
        `
      }],
    };
  }

  private async handleGetServiceLogs(args: any): Promise<any> {
    const service = await this.serviceManager.getService(args.serviceId);
    if (!service) {
      return {
        content: [{ type: 'text', text: `❌ Service not found: ${args.serviceId}` }],
        isError: true,
      };
    }

    const logs = await this.serviceManager.getServiceLogs(args.serviceId, args.limit);
    
    if (logs.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `📄 No logs available for service: ${service.name}`
        }],
      };
    }

    const logOutput = logs.map(log => {
      const timestamp = log.timestamp.toISOString();
      const level = log.level.toUpperCase().padEnd(5);
      const source = log.source ? `[${log.source}]` : '';
      return `${timestamp} ${level} ${source} ${log.message}`;
    }).join('\n');

    return {
      content: [{
        type: 'text',
        text: `# Service Logs: ${service.name}

\`\`\`
${logOutput}
\`\`\`

**Total:** ${logs.length} log entr${logs.length !== 1 ? 'ies' : 'y'}${args.limit ? ` (last ${args.limit})` : ''}`
      }],
    };
  }

  private async handleGetManagerStats(args: any): Promise<any> {
    const stats = await this.serviceManager.getManagerStats();
    
    const statusBreakdown = Object.entries(stats.servicesByStatus)
      .map(([status, count]) => `- **${status}:** ${count}`)
      .join('\n');

    const typeBreakdown = Object.entries(stats.servicesByType)
      .map(([type, count]) => `- **${type}:** ${count}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `# Service Manager Statistics

## Overview
- **Total Services:** ${stats.totalServices}
- **Total Logs:** ${stats.totalLogs}
- **Active Health Checks:** ${stats.activeHealthChecks}

## Services by Status
${statusBreakdown || '- No services'}

## Services by Type
${typeBreakdown || '- No services'}

**Last Updated:** ${new Date().toISOString()}
        `
      }],
    };
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '🟢';
      case 'starting': return '🟡';
      case 'stopping': return '🟠';
      case 'stopped': return '🔴';
      case 'error': return '❌';
      case 'unhealthy': return '🟤';
      default: return '⚪';
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}