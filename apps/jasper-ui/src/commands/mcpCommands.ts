import { SlashCommand } from '../types/index.js';
import { getMCPManager } from '../core/mcpManager.js';

export const mcpCommands: SlashCommand[] = [
  {
    name: '/mcp',
    description: 'Manage MCP servers and tools',
    arguments: '<subcommand> [args...]',
    handler: async (...args: string[]) => {
      if (args.length === 0) {
        console.log(`
Available MCP commands:
  /mcp status          - Show status of all MCP servers
  /mcp list            - List all configured MCP servers
  /mcp tools           - Show all discovered MCP tools
  /mcp server <name>   - Show details for a specific server
  /mcp help            - Show this help message
        `);
        return;
      }

      const subcommand = args[0].toLowerCase();
      const mcpManager = getMCPManager();

      if (!mcpManager) {
        console.log('❌ MCP is not initialized. Configure MCP servers in jasper.config.json');
        return;
      }

      switch (subcommand) {
        case 'status':
          await handleStatusCommand(mcpManager);
          break;
        case 'list':
          await handleListCommand(mcpManager);
          break;
        case 'tools':
          await handleToolsCommand(mcpManager);
          break;
        case 'server':
          await handleServerCommand(mcpManager, args.slice(1));
          break;
        case 'help':
        default:
          console.log(`
Available MCP commands:
  /mcp status          - Show status of all MCP servers
  /mcp list            - List all configured MCP servers  
  /mcp tools           - Show all discovered MCP tools
  /mcp server <name>   - Show details for a specific server
  /mcp help            - Show this help message
          `);
          break;
      }
    }
  }
];

async function handleStatusCommand(mcpManager: any) {
  const statuses = mcpManager.getAllServerStatuses();
  const discoveryState = mcpManager.getDiscoveryState();
  
  console.log(`
🔗 MCP Server Status (Discovery: ${discoveryState})
${'-'.repeat(50)}`);

  if (Object.keys(statuses).length === 0) {
    console.log('No MCP servers configured');
    return;
  }

  for (const [serverName, status] of Object.entries(statuses)) {
    const statusIcon = getStatusIcon(status as any);
    console.log(`${statusIcon} ${serverName}: ${status}`);
  }
}

async function handleListCommand(mcpManager: any) {
  const serverNames = mcpManager.getServerNames();
  
  console.log(`
📋 Configured MCP Servers
${'-'.repeat(30)}`);

  if (serverNames.length === 0) {
    console.log('No MCP servers configured');
    return;
  }

  for (const serverName of serverNames) {
    const status = mcpManager.getServerStatus(serverName);
    const statusIcon = getStatusIcon(status);
    console.log(`${statusIcon} ${serverName}`);
  }
}

async function handleToolsCommand(mcpManager: any) {
  const tools = mcpManager.getDiscoveredTools();
  
  console.log(`
🛠️  Discovered MCP Tools (${tools.length} total)
${'-'.repeat(40)}`);

  if (tools.length === 0) {
    console.log('No MCP tools discovered');
    return;
  }

  // Group tools by server
  const toolsByServer: Record<string, any[]> = {};
  for (const tool of tools) {
    if (!toolsByServer[tool.serverName]) {
      toolsByServer[tool.serverName] = [];
    }
    toolsByServer[tool.serverName].push(tool);
  }

  for (const [serverName, serverTools] of Object.entries(toolsByServer)) {
    console.log(`\n📦 ${serverName} (${serverTools.length} tools):`);
    for (const tool of serverTools) {
      console.log(`  • ${tool.name}: ${tool.description}`);
    }
  }
}

async function handleServerCommand(mcpManager: any, args: string[]) {
  if (args.length === 0) {
    console.log('❌ Server name required. Usage: /mcp server <name>');
    return;
  }

  const serverName = args[0];
  const serverNames = mcpManager.getServerNames();
  
  if (!serverNames.includes(serverName)) {
    console.log(`❌ Server '${serverName}' not found. Available servers: ${serverNames.join(', ')}`);
    return;
  }

  const status = mcpManager.getServerStatus(serverName);
  const tools = mcpManager.getDiscoveredTools().filter((tool: any) => tool.serverName === serverName);
  const statusIcon = getStatusIcon(status);

  console.log(`
🔍 MCP Server Details: ${serverName}
${'-'.repeat(40)}
Status: ${statusIcon} ${status}
Tools: ${tools.length} discovered

📋 Available Tools:`);

  if (tools.length === 0) {
    console.log('  No tools discovered');
  } else {
    for (const tool of tools) {
      console.log(`  • ${tool.name}: ${tool.description}`);
    }
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'connected':
      return '🟢';
    case 'connecting':
      return '🟡';
    case 'disconnected':
      return '🔴';
    case 'error':
      return '❌';
    default:
      return '⚪';
  }
}