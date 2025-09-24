#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { ServiceManager } from './services/ServiceManager.js';
import { ProcessServiceProvider } from './services/ProcessServiceProvider.js';
import { DockerServiceProvider } from './services/DockerServiceProvider.js';
import { LoggerService } from './services/LoggerService.js';
import { HealthCheckService } from './services/HealthCheckService.js';
import { InMemoryServiceRepository } from './services/InMemoryServiceRepository.js';
import { MCPToolHandler } from './handlers/MCPToolHandler.js';
import { parseArguments, validateConfig } from './utils/config.js';
import type { ServerConfig } from './types.js';

// Parse command line arguments
const config = parseArguments();
validateConfig(config);

// Initialize services
const logger = new LoggerService();
const healthChecker = new HealthCheckService(logger);
const repository = new InMemoryServiceRepository();

const providers = [
  new ProcessServiceProvider(logger),
  new DockerServiceProvider(logger),
];

const serviceManager = new ServiceManager(repository, logger, healthChecker, providers);
const toolHandler = new MCPToolHandler(serviceManager, logger);

// Available MCP tools
const tools: Tool[] = [
  {
    name: 'create_service',
    description: 'Create a new service (process or Docker container)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Service name' },
        type: { type: 'string', enum: ['process', 'docker'], description: 'Service type' },
        command: { type: 'string', description: 'Command to run (for process services)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        workingDir: { type: 'string', description: 'Working directory for the process' },
        env: { type: 'object', description: 'Environment variables' },
        image: { type: 'string', description: 'Docker image (for docker services)' },
        containerName: { type: 'string', description: 'Custom container name' },
        ports: { type: 'object', description: 'Port mappings (host:container)' },
        volumes: { type: 'object', description: 'Volume mappings (host:container)' },
        dockerArgs: { type: 'array', items: { type: 'string' }, description: 'Additional Docker arguments' },
        healthCheck: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Health check URL' },
            command: { type: 'string', description: 'Health check command' },
            interval: { type: 'number', description: 'Check interval in seconds' },
            timeout: { type: 'number', description: 'Check timeout in seconds' },
          },
        },
        autoRestart: { type: 'boolean', description: 'Enable auto-restart' },
        restartDelay: { type: 'number', description: 'Restart delay in seconds' },
        maxRestarts: { type: 'number', description: 'Maximum restart attempts' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'start_service',
    description: 'Start a service',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'stop_service',
    description: 'Stop a service',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'restart_service',
    description: 'Restart a service',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'remove_service',
    description: 'Remove a service',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'get_service',
    description: 'Get service details',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'list_services',
    description: 'List all services',
    inputSchema: {
      type: 'object',
      properties: {
        status: { 
          type: 'string', 
          enum: ['stopped', 'starting', 'running', 'stopping', 'error', 'unhealthy'],
          description: 'Filter by status' 
        },
      },
    },
  },
  {
    name: 'get_service_stats',
    description: 'Get service performance statistics',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'get_service_logs',
    description: 'Get service logs',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
        limit: { type: 'number', description: 'Number of recent log entries' },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'get_manager_stats',
    description: 'Get service manager statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

async function startStdioMode(): Promise<void> {
  const server = new Server(
    {
      name: 'jasper-service-management',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return await toolHandler.handleToolCall(name, args as any);
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('Service Management MCP Server running on stdio');
}

async function startHttpMode(config: ServerConfig): Promise<void> {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: config.allowedHosts || ['http://localhost:3000'],
    credentials: true,
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
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // MCP endpoint - single endpoint for all JSON-RPC requests
  app.post('/mcp/tools', async (req, res) => {
    try {
      const { jsonrpc, id, method, params } = req.body;
      
      // Validate JSON-RPC format
      if (jsonrpc !== "2.0") {
        return res.status(400).json({
          jsonrpc: "2.0",
          id: id || null,
          error: {
            code: -32600,
            message: "Invalid Request - jsonrpc must be '2.0'"
          }
        });
      }

      // Handle different MCP methods
      if (method === "initialize") {
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: "jasper-service-manager",
              version: "1.0.0"
            }
          }
        });
      } else if (method === "notifications/initialized") {
        // Notification methods don't require a response
        res.status(204).end();
      } else if (method === "tools/list") {
        res.json({
          jsonrpc: "2.0",
          id,
          result: { tools }
        });
      } else if (method === "tools/call") {
        const { name: toolName, arguments: args } = params;
        const result = await toolHandler.handleToolCall(toolName, args);
        res.json({
          jsonrpc: "2.0",
          id,
          result
        });
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          id: id || null,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: errorMessage
        }
      });
    }
  });

  // Service management endpoints (REST API)
  app.get('/api/services', async (req, res) => {
    try {
      const { status } = req.query;
      const services = status 
        ? await serviceManager.getServicesByStatus(status as any)
        : await serviceManager.getAllServices();
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/services/:id', async (req, res) => {
    try {
      const service = await serviceManager.getService(req.params.id);
      if (!service) {
        return res.status(404).json({ error: 'Service not found' });
      }
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await serviceManager.getManagerStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Start HTTP server
  const server = app.listen(config.port, () => {
    console.error(`Service Management MCP Server running on HTTP port ${config.port}`);
    console.error(`Mode: ${config.mode}, Auth: ${config.auth}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.error('Received SIGTERM, shutting down gracefully');
    server.close(() => {
      serviceManager.shutdown().then(() => {
        process.exit(0);
      });
    });
  });
}

async function main(): Promise<void> {
  try {
    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      console.error('Received SIGINT, shutting down...');
      await serviceManager.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('Received SIGTERM, shutting down...');
      await serviceManager.shutdown();
      process.exit(0);
    });

    // Start in appropriate mode
    if (config.mode === 'local') {
      if (process.argv.includes('--stdio')) {
        await startStdioMode();
      } else {
        await startHttpMode(config);
      }
    } else {
      await startHttpMode(config);
    }

  } catch (error) {
    console.error('Failed to start server:', error);
    await serviceManager.shutdown();
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('Fatal error:', error);
  await serviceManager.shutdown();
  process.exit(1);
});