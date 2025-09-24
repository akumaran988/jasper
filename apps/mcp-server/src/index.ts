#!/usr/bin/env node

/**
 * Universal MCP Server Launcher
 * 
 * This is the proper way to start standalone MCP servers.
 * It can launch any MCP server package with proper arguments.
 * 
 * Usage:
 *   jasper-mcp-server --server=service-manager --mode=local --port=8081
 *   jasper-mcp-server --server=service-manager --mode=remote --port=8080 --auth=required --api-key=secret
 */

import { Command } from 'commander';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

interface ServerConfig {
  server: string;
  mode: 'local' | 'remote';
  port: number;
  auth: 'none' | 'required';
  apiKey?: string;
  allowedHosts?: string[];
  env?: string;
}

/**
 * Available MCP server packages
 */
const AVAILABLE_SERVERS = {
  'service-manager': {
    name: 'Service Manager',
    description: 'Manage processes and Docker containers',
    packageName: '@jasper/service-manager',
    defaultPort: 8081
  }
  // Future servers can be added here:
  // 'github-integration': { ... },
  // 'file-operations': { ... }
};

/**
 * Load and initialize MCP server package
 */
async function loadMCPServerPackage(serverName: string) {
  const serverInfo = AVAILABLE_SERVERS[serverName as keyof typeof AVAILABLE_SERVERS];
  if (!serverInfo) {
    throw new Error(`Unknown server: ${serverName}. Available: ${Object.keys(AVAILABLE_SERVERS).join(', ')}`);
  }

  console.log(`📦 Loading MCP server package: ${serverInfo.packageName}`);
  
  try {
    // Dynamic import of the server package
    const serverModule = await import(serverInfo.packageName);
    return { serverModule, serverInfo };
  } catch (error) {
    throw new Error(`Failed to load server package ${serverInfo.packageName}: ${error}`);
  }
}

/**
 * Create MCP tools from server package
 */
function createMCPTools(serverModule: any, serverName: string) {
  console.log(`🔧 Creating MCP tools for: ${serverName}`);
  
  // Check if the server module exports MCP tool handlers
  if (typeof serverModule.createMCPToolHandlers === 'function') {
    return serverModule.createMCPToolHandlers();
  }
  
  throw new Error(`Server package ${serverName} does not export createMCPToolHandlers function`);
}

/**
 * Get tool definitions for MCP protocol
 */
function getToolDefinitions(serverModule: any, serverName: string) {
  // Check if the server module exports MCP tool definitions
  if (Array.isArray(serverModule.MCP_TOOLS)) {
    return serverModule.MCP_TOOLS;
  }
  
  throw new Error(`Server package ${serverName} does not export MCP_TOOLS array`);
}

/**
 * Start MCP server with Express
 */
async function startMCPServer(config: ServerConfig) {
  console.log(`🚀 Starting MCP server: ${config.server}`);
  console.log(`📡 Mode: ${config.mode}, Port: ${config.port}, Auth: ${config.auth}`);
  
  // Load the server package
  const { serverModule } = await loadMCPServerPackage(config.server);
  
  // Create MCP tools
  const mcpTools = createMCPTools(serverModule, config.server);
  const toolDefinitions = getToolDefinitions(serverModule, config.server);
  
  // Create Express app
  const app = express();
  
  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: config.allowedHosts || ['http://localhost:3000'],
    credentials: true
  }));
  app.use(express.json({ limit: '10mb' }));
  
  // Authentication middleware for remote mode
  if (config.auth === 'required') {
    app.use((req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
      if (!apiKey || apiKey !== config.apiKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });
  }
  
  // Health check endpoint
  app.get('/health', (_, res) => {
    res.json({
      status: 'healthy',
      server: config.server,
      mode: config.mode,
      timestamp: new Date().toISOString()
    });
  });
  
  // MCP JSON-RPC endpoint
  app.post('/mcp/tools', async (req, res) => {
    try {
      const { jsonrpc, id, method, params } = req.body;
      
      // Validate JSON-RPC format
      if (jsonrpc !== "2.0") {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: id || null,
          error: { code: -32600, message: "Invalid Request - jsonrpc must be '2.0'" }
        });
      }
      
      // Handle MCP methods
      if (method === "initialize") {
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: `jasper-${config.server}`,
              version: "1.0.0"
            }
          }
        });
      } else if (method === "notifications/initialized") {
        res.status(204).end();
      } else if (method === "tools/list") {
        res.json({
          jsonrpc: "2.0",
          id,
          result: { tools: toolDefinitions }
        });
      } else if (method === "tools/call") {
        const { name: toolName, arguments: args } = params;
        if (mcpTools && typeof mcpTools[toolName] === 'function') {
          const toolResult = await mcpTools[toolName](args);
          
          // Format result according to MCP CallToolResult schema
          const result = {
            content: [
              {
                type: "text",
                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
              }
            ]
          };
          
          res.json({ jsonrpc: "2.0", id, result });
        } else {
          res.status(400).json({
            jsonrpc: "2.0", id, error: { code: -32601, message: `Tool not found: ${toolName}` }
          });
        }
      } else {
        res.status(400).json({
          jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: { code: -32603, message: errorMessage }
      });
    }
  });
  
  // Start server
  const server = app.listen(config.port, () => {
    console.log(`✅ MCP server started successfully!`);
    console.log(`🔗 MCP Endpoint: http://localhost:${config.port}/mcp/tools`);
    console.log(`❤️  Health Check: http://localhost:${config.port}/health`);
    console.log(`📋 Available Tools: ${Object.keys(mcpTools).length} tools`);
  });
  
  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down MCP server gracefully...');
    server.close(() => {
      console.log('✅ Server closed successfully');
      process.exit(0);
    });
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

/**
 * Main CLI program
 */
async function main() {
  const program = new Command();
  
  program
    .name('jasper-mcp-server')
    .description('Universal MCP server launcher for Jasper')
    .version('1.0.0');
  
  program
    .command('start')
    .description('Start an MCP server')
    .requiredOption('-s, --server <server>', `Server to start. Available: ${Object.keys(AVAILABLE_SERVERS).join(', ')}`)
    .option('-m, --mode <mode>', 'Server mode', 'local')
    .option('-p, --port <port>', 'Port to listen on', '8081')
    .option('-a, --auth <auth>', 'Authentication mode', 'none')
    .option('-k, --api-key <key>', 'API key for authentication')
    .option('-h, --allowed-hosts <hosts>', 'Allowed hosts (comma-separated)')
    .option('-e, --env <env>', 'Environment (local, uat, production)')
    .action(async (options) => {
      try {
        const config: ServerConfig = {
          server: options.server,
          mode: options.mode as 'local' | 'remote',
          port: parseInt(options.port),
          auth: options.auth as 'none' | 'required',
          apiKey: options.apiKey,
          allowedHosts: options.allowedHosts?.split(','),
          env: options.env
        };
        
        // Validate
        if (!AVAILABLE_SERVERS[config.server as keyof typeof AVAILABLE_SERVERS]) {
          console.error(`❌ Unknown server: ${config.server}`);
          console.log(`Available servers: ${Object.keys(AVAILABLE_SERVERS).join(', ')}`);
          process.exit(1);
        }
        
        if (config.auth === 'required' && !config.apiKey) {
          console.error('❌ API key is required when auth is set to "required"');
          process.exit(1);
        }
        
        await startMCPServer(config);
      } catch (error) {
        console.error('❌ Failed to start MCP server:', error);
        process.exit(1);
      }
    });
  
  // Help command
  program
    .command('list')
    .description('List available MCP servers')
    .action(() => {
      console.log('📋 Available MCP Servers:');
      Object.entries(AVAILABLE_SERVERS).forEach(([key, server]) => {
        console.log(`  ${key}: ${server.name} - ${server.description}`);
      });
    });
  
  await program.parseAsync(process.argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}