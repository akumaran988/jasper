import { getMCPManager } from '../core/mcpManager.js';

export interface SlashCommand {
  name: string;
  description: string;
  handler: (...args: string[]) => Promise<void>;
}

export const enhancedMcpCommands: SlashCommand[] = [
  {
    name: '/mcp',
    description: 'Show MCP server and service status',
    handler: async () => {
      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      const status = mcpManager.getFullStatus();
      
      console.log('\n🔗 MCP System Status');
      console.log('═══════════════════════');
      
      // MCP Servers
      console.log('\n📡 MCP Servers:');
      Object.entries(status.mcpStatus).forEach(([name, serverStatus]) => {
        const icon = serverStatus.status === 'connected' ? '✅' : '❌';
        console.log(`  ${icon} ${name}: ${serverStatus.status}`);
      });

      // Server Manager Status
      console.log('\n🖥️ Server Manager:');
      status.servers.forEach(server => {
        const icon = server.status === 'running' ? '✅' : 
                    server.status === 'error' ? '❌' : '⏳';
        const mode = server.config.mode === 'local' ? '🏠' : '🌐';
        console.log(`  ${icon} ${mode} ${server.id}: ${server.status}`);
        if (server.error) {
          console.log(`    ⚠️ Error: ${server.error}`);
        }
      });

      // Services
      console.log('\n🚀 Services:');
      if (status.services.length === 0) {
        console.log('  No services deployed');
      } else {
        status.services.forEach(service => {
          const icon = service.status === 'running' ? '✅' : 
                      service.status === 'error' ? '❌' : '⏳';
          const target = service.mcpServerId;
          console.log(`  ${icon} ${service.definition.name} → ${target}: ${service.status}`);
          if (service.error) {
            console.log(`    ⚠️ Error: ${service.error}`);
          }
        });
      }

      console.log('');
    }
  },

  {
    name: '/mcp-servers',
    description: 'List all MCP servers with detailed status',
    handler: async () => {
      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      const serverStatuses = mcpManager.getServerManagerStatus();
      
      console.log('\n🖥️ MCP Server Details');
      console.log('═══════════════════════');
      
      serverStatuses.forEach(server => {
        const icon = server.status === 'running' ? '✅' : 
                    server.status === 'error' ? '❌' : '⏳';
        const mode = server.config.mode === 'local' ? '🏠 Local' : '🌐 Remote';
        
        console.log(`\n${icon} ${server.id} (${mode})`);
        console.log(`   Status: ${server.status}`);
        
        if (server.config.mode === 'local' && server.config.serverConfig) {
          console.log(`   Port: ${server.config.serverConfig.port}`);
          console.log(`   Script: ${server.config.serverConfig.script}`);
        }
        
        if (server.config.httpUrl) {
          console.log(`   URL: ${server.config.httpUrl}`);
        }
        
        if (server.lastHealthCheck) {
          console.log(`   Last Check: ${server.lastHealthCheck.toLocaleTimeString()}`);
        }
        
        if (server.error) {
          console.log(`   ⚠️ Error: ${server.error}`);
        }
      });
      
      console.log('');
    }
  },

  {
    name: '/services',
    description: 'List all deployed services',
    handler: async () => {
      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      const services = mcpManager.getServicesStatus();
      
      console.log('\n🚀 Deployed Services');
      console.log('═══════════════════════');
      
      if (services.length === 0) {
        console.log('No services deployed');
        console.log('\nTo deploy services, use:');
        console.log('  /deploy <service-id>');
        console.log('  /deploy-profile <profile-name>');
        return;
      }

      services.forEach(service => {
        const icon = service.status === 'running' ? '✅' : 
                    service.status === 'error' ? '❌' : '⏳';
        
        console.log(`\n${icon} ${service.definition.name}`);
        console.log(`   Status: ${service.status}`);
        console.log(`   Type: ${service.definition.config.type}`);
        console.log(`   Target: ${service.mcpServerId}`);
        console.log(`   Last Updated: ${service.lastUpdated.toLocaleTimeString()}`);
        
        if (service.definition.config.command) {
          console.log(`   Command: ${service.definition.config.command} ${(service.definition.config.args || []).join(' ')}`);
        }
        
        if (service.definition.config.image) {
          console.log(`   Image: ${service.definition.config.image}`);
        }
        
        if (service.metadata?.ports) {
          console.log(`   Ports: ${Object.entries(service.metadata.ports).map(([host, container]) => `${host}:${container}`).join(', ')}`);
        }
        
        if (service.error) {
          console.log(`   ⚠️ Error: ${service.error}`);
        }
      });
      
      console.log('');
    }
  },

  {
    name: '/deploy',
    description: 'Deploy a specific service',
    handler: async (serviceId?: string) => {
      if (!serviceId) {
        console.log('❌ Please specify a service ID');
        console.log('Usage: /deploy <service-id>');
        return;
      }

      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      try {
        console.log(`🚀 Deploying service: ${serviceId}...`);
        await mcpManager.deployService(serviceId);
        console.log(`✅ Service deployed successfully: ${serviceId}`);
      } catch (error) {
        console.error(`❌ Failed to deploy service ${serviceId}:`, error);
      }
    }
  },

  {
    name: '/deploy-profile',
    description: 'Deploy services using a deployment profile',
    handler: async (profileName?: string) => {
      if (!profileName) {
        console.log('❌ Please specify a profile name');
        console.log('Usage: /deploy-profile <profile-name>');
        return;
      }

      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      try {
        console.log(`🚀 Deploying profile: ${profileName}...`);
        await mcpManager.deployServices(profileName);
        console.log(`✅ Profile deployed successfully: ${profileName}`);
      } catch (error) {
        console.error(`❌ Failed to deploy profile ${profileName}:`, error);
      }
    }
  },

  {
    name: '/restart-server',
    description: 'Restart a local MCP server',
    handler: async (serverId?: string) => {
      if (!serverId) {
        console.log('❌ Please specify a server ID');
        console.log('Usage: /restart-server <server-id>');
        return;
      }

      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      try {
        console.log(`🔄 Restarting server: ${serverId}...`);
        await mcpManager.restartServer(serverId);
        console.log(`✅ Server restarted successfully: ${serverId}`);
      } catch (error) {
        console.error(`❌ Failed to restart server ${serverId}:`, error);
      }
    }
  },

  {
    name: '/targets',
    description: 'List deployment targets',
    handler: async () => {
      const mcpManager = getMCPManager();
      if (!mcpManager) {
        console.log('❌ MCP Manager not initialized');
        return;
      }

      const targets = mcpManager.getDeploymentTargets();
      
      console.log('\n🎯 Deployment Targets');
      console.log('═══════════════════════');
      
      targets.forEach(target => {
        const icon = target.available ? '✅' : '❌';
        const env = target.environment === 'local' ? '🏠' : '🌐';
        
        console.log(`\n${icon} ${env} ${target.id}`);
        console.log(`   Available: ${target.available ? 'Yes' : 'No'}`);
        console.log(`   Environment: ${target.environment}`);
        if (target.region) {
          console.log(`   Region: ${target.region}`);
        }
        if (target.namespace) {
          console.log(`   Namespace: ${target.namespace}`);
        }
        console.log(`   Services: ${target.services.length}`);
      });
      
      console.log('');
    }
  },

  {
    name: '/mcp-help',
    description: 'Show enhanced MCP commands help',
    handler: async () => {
      console.log('\n📚 Enhanced MCP Commands');
      console.log('═══════════════════════');
      console.log('');
      
      enhancedMcpCommands.forEach(cmd => {
        console.log(`${cmd.name.padEnd(20)} - ${cmd.description}`);
      });
      
      console.log('\n🔧 Service Management:');
      console.log('  create_service     - Create a new service');
      console.log('  start_service      - Start a service');
      console.log('  stop_service       - Stop a service');
      console.log('  remove_service     - Remove a service');
      console.log('  get_service        - Get service details');
      console.log('  list_services      - List all services');
      console.log('  get_service_logs   - Get service logs');
      
      console.log('\n💡 Examples:');
      console.log('  /deploy local-api-server');
      console.log('  /deploy-profile full-local');
      console.log('  /restart-server local-development');
      console.log('  create_service { "name": "test", "type": "process", "command": "echo", "args": ["hello"] }');
      console.log('');
    }
  }
];