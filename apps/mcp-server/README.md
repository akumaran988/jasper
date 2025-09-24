# 🚀 Jasper MCP Server

Universal MCP server launcher that can start any Jasper MCP server package.

## Usage

### Install dependencies
```bash
npm install
```

### Start service manager (local mode)
```bash
npm run start:service-manager
# or
npm run dev -- --server=service-manager --mode=local --port=8081
```

### Start service manager (remote mode with auth)
```bash
npm run start:service-manager:remote
# or  
npm run dev -- --server=service-manager --mode=remote --port=8080 --auth=required --api-key=your-secret
```

### Production deployment
```bash
npm run start:service-manager:prod
# or
npm run dev -- --server=service-manager --mode=remote --port=8443 --auth=required --api-key=prod-key --env=production
```

## Command Line Options

```bash
jasper-mcp-server [options]

Options:
  -s, --server <server>      Server to start (required)
  -m, --mode <mode>          Server mode: local|remote (default: local)
  -p, --port <port>          Port to listen on (default: 8081)
  -a, --auth <auth>          Authentication: none|required (default: none)
  -k, --api-key <key>        API key for authentication
  -h, --allowed-hosts <hosts> Allowed hosts (comma-separated)
  -e, --env <env>            Environment: local|uat|production
```

## Available Servers

- **service-manager**: Manage processes and Docker containers

## Testing

```bash
# Health check
curl http://localhost:8081/health

# MCP initialize
curl -X POST http://localhost:8081/mcp/tools \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# List tools
curl -X POST http://localhost:8081/mcp/tools \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Architecture

This launcher:
1. Dynamically imports MCP server packages
2. Creates standardized MCP JSON-RPC endpoints  
3. Handles authentication and security
4. Provides health checking and monitoring
5. Supports both local and remote deployment modes

## Adding New Servers

To add a new MCP server package:
1. Add it to `AVAILABLE_SERVERS` in `src/index.ts`
2. Implement the MCP tools mapping
3. Add tool definitions
4. Update README