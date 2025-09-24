import type { ServerConfig } from '../types.js';

export function parseArguments(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    mode: 'local',
    port: 8081,
    auth: 'none',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--mode':
        config.mode = args[++i] as 'local' | 'remote';
        break;
      case '--port':
        config.port = parseInt(args[++i], 10);
        break;
      case '--auth':
        config.auth = args[++i] as 'none' | 'required';
        break;
      case '--api-key':
        config.apiKey = args[++i];
        break;
      case '--allowed-hosts':
        config.allowedHosts = args[++i].split(',');
        break;
      case '--max-services':
        config.maxServices = parseInt(args[++i], 10);
        break;
      case '--log-retention':
        config.logRetention = parseInt(args[++i], 10);
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
    }
  }

  // Load from environment variables if not set
  if (!config.apiKey && process.env.SERVICE_MANAGER_API_KEY) {
    config.apiKey = process.env.SERVICE_MANAGER_API_KEY;
  }

  if (!config.allowedHosts && process.env.SERVICE_MANAGER_ALLOWED_HOSTS) {
    config.allowedHosts = process.env.SERVICE_MANAGER_ALLOWED_HOSTS.split(',');
  }

  return config;
}

export function validateConfig(config: ServerConfig): void {
  if (!['local', 'remote'].includes(config.mode)) {
    throw new Error('Mode must be either "local" or "remote"');
  }

  if (config.port < 1 || config.port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }

  if (!['none', 'required'].includes(config.auth)) {
    throw new Error('Auth must be either "none" or "required"');
  }

  if (config.mode === 'remote' && config.auth === 'required' && !config.apiKey) {
    throw new Error('API key is required when auth is set to "required" in remote mode');
  }

  if (config.maxServices && config.maxServices < 1) {
    throw new Error('Max services must be at least 1');
  }

  if (config.logRetention && config.logRetention < 1) {
    throw new Error('Log retention must be at least 1 day');
  }
}

function printHelp(): void {
  console.log(`
Service Management MCP Server

Usage: 
  # Local mode (subprocess with stdio)
  node dist/index.js --stdio
  
  # Local mode (HTTP server without auth)
  node dist/index.js --mode=local --port=8081
  
  # Remote mode (HTTP server with auth)
  node dist/index.js --mode=remote --port=8080 --auth=required --api-key=your-key

Options:
  --mode <local|remote>     Server mode (default: local)
  --port <number>           HTTP server port (default: 8081)
  --auth <none|required>    Authentication mode (default: none)
  --api-key <string>        API key for authentication
  --allowed-hosts <list>    Comma-separated list of allowed origins
  --max-services <number>   Maximum number of services
  --log-retention <days>    Log retention period in days
  --stdio                   Use stdio transport (local mode only)
  --help                    Show this help message

Environment Variables:
  SERVICE_MANAGER_API_KEY      API key for authentication
  SERVICE_MANAGER_ALLOWED_HOSTS Allowed origins (comma-separated)

Examples:
  # Start in local mode for Jasper subprocess
  npm run start:local
  
  # Start in remote mode for separate machine
  npm run start:remote
  
  # Development mode
  npm run dev:local
  `);
}