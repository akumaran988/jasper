import { mcpServerRegistry } from '../core/mcpServerRegistry.js';
import { listBuiltinServers, BUILTIN_MCP_SERVERS } from '../core/builtinMcpServers.js';

export interface SlashCommand {
  name: string;
  description: string;
  handler: (...args: string[]) => Promise<void>;
}

export const mcpServerCommands: SlashCommand[] = [
  {
    name: '/mcp-install',
    description: 'Install an MCP server from npm or git',
    handler: async (source?: string, name?: string, serverName?: string) => {
      if (!source) {
        console.log('❌ Please specify a package to install');
        console.log('Usage:');
        console.log('  /mcp-install npm @company/mcp-server');
        console.log('  /mcp-install git https://github.com/user/mcp-server.git server-name');
        return;
      }

      try {
        if (source === 'npm') {
          if (!name) {
            console.log('❌ Please specify npm package name');
            console.log('Usage: /mcp-install npm @company/mcp-server');
            return;
          }
          
          console.log(`📦 Installing MCP server from npm: ${name}`);
          const installation = await mcpServerRegistry.installFromNpm(name);
          console.log(`✅ Successfully installed ${installation.package.name}`);
          console.log(`   Version: ${installation.package.version}`);
          console.log(`   Script: ${installation.package.scriptPath}`);
          
        } else if (source === 'git') {
          if (!name) {
            console.log('❌ Please specify git URL and server name');
            console.log('Usage: /mcp-install git https://github.com/user/repo.git server-name');
            return;
          }
          
          const gitUrl = name;
          if (!serverName) {
            console.log('❌ Please specify server name for git installation');
            return;
          }
          
          console.log(`🔗 Installing MCP server from git: ${gitUrl}`);
          const installation = await mcpServerRegistry.installFromGit(gitUrl, serverName);
          console.log(`✅ Successfully installed ${installation.package.name}`);
          
        } else {
          // Assume it's a direct npm package name
          console.log(`📦 Installing MCP server from npm: ${source}`);
          const installation = await mcpServerRegistry.installFromNpm(source);
          console.log(`✅ Successfully installed ${installation.package.name}`);
          console.log(`   Version: ${installation.package.version}`);
          console.log(`   Script: ${installation.package.scriptPath}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to install MCP server: ${error}`);
      }
    }
  },

  {
    name: '/mcp-list',
    description: 'List available and installed MCP servers',
    handler: async (type?: string) => {
      if (type === 'builtin') {
        // List built-in servers
        const builtinServers = listBuiltinServers();
        console.log('\n📦 Built-in MCP Servers');
        console.log('═══════════════════════');
        
        builtinServers.forEach(server => {
          console.log(`\n✅ ${server.name} (${server.id})`);
          console.log(`   Description: ${server.description}`);
          console.log(`   Version: ${server.version}`);
          console.log(`   Default Port: ${server.defaultPort}`);
          console.log(`   Capabilities: ${server.capabilities.join(', ')}`);
        });
        
      } else {
        // List installed servers
        const installed = mcpServerRegistry.listInstalled();
        console.log('\n📥 Installed MCP Servers');
        console.log('═══════════════════════');
        
        if (installed.length === 0) {
          console.log('No MCP servers installed');
          console.log('\nTo install a server:');
          console.log('  /mcp-install @company/mcp-server');
          console.log('  /mcp-install git https://github.com/user/repo.git server-name');
        } else {
          installed.forEach(installation => {
            const pkg = installation.package;
            console.log(`\n📦 ${pkg.name} (${pkg.id})`);
            console.log(`   Description: ${pkg.description}`);
            console.log(`   Version: ${pkg.version}`);
            console.log(`   Install Method: ${pkg.installMethod}`);
            console.log(`   Installed: ${installation.installedAt.toLocaleDateString()}`);
            console.log(`   Script: ${pkg.scriptPath}`);
            if (pkg.capabilities.length > 0) {
              console.log(`   Capabilities: ${pkg.capabilities.join(', ')}`);
            }
          });
        }
        
        // Also show built-in servers
        const builtinServers = listBuiltinServers();
        console.log('\n📦 Available Built-in Servers');
        console.log('═════════════════════════════');
        builtinServers.forEach(server => {
          console.log(`  • ${server.name} (${server.id}) - ${server.description}`);
        });
      }
      
      console.log('');
    }
  },

  {
    name: '/mcp-uninstall',
    description: 'Uninstall an MCP server',
    handler: async (serverId?: string) => {
      if (!serverId) {
        console.log('❌ Please specify server ID to uninstall');
        console.log('Usage: /mcp-uninstall server-id');
        console.log('\nUse /mcp-list to see installed servers');
        return;
      }

      try {
        await mcpServerRegistry.uninstall(serverId);
        console.log(`✅ Successfully uninstalled ${serverId}`);
      } catch (error) {
        console.error(`❌ Failed to uninstall ${serverId}: ${error}`);
      }
    }
  },

  {
    name: '/mcp-update',
    description: 'Update an installed MCP server',
    handler: async (serverId?: string) => {
      if (!serverId) {
        console.log('❌ Please specify server ID to update');
        console.log('Usage: /mcp-update server-id');
        return;
      }

      try {
        console.log(`🔄 Updating MCP server: ${serverId}...`);
        const installation = await mcpServerRegistry.update(serverId);
        console.log(`✅ Successfully updated ${serverId} to version ${installation.package.version}`);
      } catch (error) {
        console.error(`❌ Failed to update ${serverId}: ${error}`);
      }
    }
  },

  {
    name: '/mcp-info',
    description: 'Show detailed information about an MCP server',
    handler: async (serverId?: string) => {
      if (!serverId) {
        console.log('❌ Please specify server ID');
        console.log('Usage: /mcp-info server-id');
        return;
      }

      // Check built-in servers first
      const builtinServer = BUILTIN_MCP_SERVERS[serverId];
      if (builtinServer) {
        console.log(`\n📦 Built-in MCP Server: ${builtinServer.name}`);
        console.log('═══════════════════════════════════');
        console.log(`ID: ${builtinServer.id}`);
        console.log(`Description: ${builtinServer.description}`);
        console.log(`Version: ${builtinServer.version}`);
        console.log(`Default Port: ${builtinServer.defaultPort}`);
        console.log(`Script Path: ${builtinServer.scriptPath}`);
        console.log(`Capabilities: ${builtinServer.capabilities.join(', ')}`);
        console.log('');
        return;
      }

      // Check installed servers
      const installation = mcpServerRegistry.getInstalled(serverId);
      if (installation) {
        const pkg = installation.package;
        console.log(`\n📥 Installed MCP Server: ${pkg.name}`);
        console.log('═══════════════════════════════════');
        console.log(`ID: ${pkg.id}`);
        console.log(`Description: ${pkg.description}`);
        console.log(`Version: ${pkg.version}`);
        console.log(`Author: ${pkg.author}`);
        console.log(`Install Method: ${pkg.installMethod}`);
        if (pkg.repository) {
          console.log(`Repository: ${pkg.repository}`);
        }
        console.log(`Installed: ${installation.installedAt.toLocaleDateString()}`);
        console.log(`Install Path: ${installation.installedPath}`);
        console.log(`Script Path: ${pkg.scriptPath}`);
        console.log(`Default Port: ${pkg.defaultPort}`);
        if (pkg.capabilities.length > 0) {
          console.log(`Capabilities: ${pkg.capabilities.join(', ')}`);
        }
        if (pkg.keywords.length > 0) {
          console.log(`Keywords: ${pkg.keywords.join(', ')}`);
        }
        if (pkg.requirements) {
          console.log('Requirements:');
          if (pkg.requirements.node) {
            console.log(`  Node.js: ${pkg.requirements.node}`);
          }
          if (pkg.requirements.docker) {
            console.log(`  Docker: Required`);
          }
          if (pkg.requirements.os) {
            console.log(`  OS: ${pkg.requirements.os.join(', ')}`);
          }
        }
        console.log('');
        return;
      }

      console.log(`❌ MCP server not found: ${serverId}`);
      console.log('Use /mcp-list to see available servers');
    }
  },

  {
    name: '/mcp-marketplace',
    description: 'Browse available MCP servers',
    handler: async () => {
      console.log('\n🏪 MCP Server Marketplace');
      console.log('═══════════════════════════');
      console.log('');
      console.log('📦 Popular MCP Servers:');
      console.log('');
      
      // List of popular/example MCP servers
      const marketplace = [
        {
          name: '@jasper/service-management',
          description: 'Manage processes and Docker containers',
          author: 'Jasper Team'
        },
        {
          name: '@jasper/file-management',
          description: 'File system operations and monitoring',
          author: 'Jasper Team'
        },
        {
          name: '@jasper/git-integration',
          description: 'Git repository management',
          author: 'Jasper Team'
        },
        {
          name: 'mcp-github',
          description: 'GitHub API integration',
          author: 'Community'
        },
        {
          name: 'mcp-docker',
          description: 'Docker container management',
          author: 'Community'
        },
        {
          name: 'mcp-kubernetes',
          description: 'Kubernetes cluster management',
          author: 'Community'
        },
        {
          name: 'mcp-aws',
          description: 'AWS services integration',
          author: 'Community'
        }
      ];

      marketplace.forEach((server, index) => {
        console.log(`${index + 1}. ${server.name}`);
        console.log(`   ${server.description}`);
        console.log(`   By: ${server.author}`);
        console.log('');
      });

      console.log('💡 To install a server:');
      console.log('   /mcp-install @jasper/service-management');
      console.log('   /mcp-install git https://github.com/user/mcp-server.git my-server');
      console.log('');
      console.log('📖 Learn more: https://docs.jasper.dev/mcp-servers');
      console.log('');
    }
  }
];