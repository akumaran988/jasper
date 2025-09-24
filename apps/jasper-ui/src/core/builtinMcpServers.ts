import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuiltinMCPServer {
  id: string;
  name: string;
  description: string;
  version: string;
  scriptPath: string;
  defaultPort: number;
  capabilities: string[];
  configTemplate: any;
}

/**
 * Registry of built-in MCP servers that ship with Jasper
 */
export const BUILTIN_MCP_SERVERS: Record<string, BuiltinMCPServer> = {
  'service-manager': {
    id: 'service-manager',
    name: 'Service Manager',
    description: 'Comprehensive service management - start/stop/monitor processes and Docker containers',
    version: '1.0.0',
    scriptPath: path.join(__dirname, '../../../../packages/service-manager/dist/cli.js'),
    defaultPort: 8081,
    capabilities: [
      'create_service',
      'start_service', 
      'stop_service',
      'restart_service',
      'list_services',
      'get_service',
      'remove_service',
      'get_service_logs',
      'get_service_stats',
      'get_manager_stats'
    ],
    configTemplate: {
      mode: 'local',
      autoStart: true,
      trust: true,
      timeout: 30000,
      serverConfig: {
        mode: 'local',
        env: {
          NODE_ENV: 'development',
          LOG_LEVEL: 'info'
        }
      }
    }
  }
};

/**
 * Get the absolute path to a built-in MCP server
 */
export function getBuiltinServerPath(serverId: string): string | null {
  const server = BUILTIN_MCP_SERVERS[serverId];
  if (!server) {
    return null;
  }

  // Check if the built-in server exists
  if (fs.existsSync(server.scriptPath)) {
    return server.scriptPath;
  }

  // Fallback: try to find in node_modules (if installed as dependency)
  const nodeModulesPath = path.join(__dirname, '../../../node_modules/@jasper/mcp-servers', serverId, 'dist/index.js');
  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }

  return null;
}

/**
 * Check if a server ID refers to a built-in server
 */
export function isBuiltinServer(serverId: string): boolean {
  return serverId in BUILTIN_MCP_SERVERS;
}

/**
 * Get configuration template for a built-in server
 */
export function getBuiltinServerConfig(serverId: string, port?: number): any {
  const server = BUILTIN_MCP_SERVERS[serverId];
  if (!server) {
    throw new Error(`Built-in server not found: ${serverId}`);
  }

  const actualPort = port || server.defaultPort;
  const scriptPath = getBuiltinServerPath(serverId);
  
  if (!scriptPath) {
    throw new Error(`Built-in server script not found: ${serverId}`);
  }

  return {
    ...server.configTemplate,
    httpUrl: `http://localhost:${actualPort}/mcp/tools`,
    description: server.description,
    serverConfig: {
      ...server.configTemplate.serverConfig,
      script: scriptPath,
      port: actualPort
    }
  };
}

/**
 * List all available built-in servers
 */
export function listBuiltinServers(): BuiltinMCPServer[] {
  return Object.values(BUILTIN_MCP_SERVERS);
}

/**
 * Resolve MCP server configuration, handling built-in servers
 */
export function resolveMCPServerConfig(serverId: string, userConfig: any): any {
  // If it's a built-in server, use the built-in configuration as base
  if (isBuiltinServer(serverId)) {
    const builtinConfig = getBuiltinServerConfig(serverId, userConfig.serverConfig?.port);
    
    // Merge user config with built-in config
    return {
      ...builtinConfig,
      ...userConfig,
      serverConfig: {
        ...builtinConfig.serverConfig,
        ...userConfig.serverConfig
      }
    };
  }

  // For non-built-in servers, return user config as-is
  return userConfig;
}