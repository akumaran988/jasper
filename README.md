# Jasper AI Assistant

An intelligent terminal AI assistant with tool calling capabilities, built with the Model Context Protocol (MCP).

## Cross-Platform Support

Jasper is designed to work seamlessly on **Linux**, **Windows**, and **macOS**.

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0

## Quick Start

### For All Platforms

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Jasper
   ```

2. **Set up the project**

   **On Windows:**
   ```cmd
   setup.bat
   ```

   **On Windows without admin access:**
   See [WINDOWS_SETUP.md](./WINDOWS_SETUP.md) for detailed instructions

   **On Linux/macOS:**
   ```bash
   ./setup.sh
   ```

   **Or use Node.js directly (all platforms):**
   ```bash
   npm run setup
   ```

3. **Start Jasper**
   ```bash
   npm run dev
   ```

## Manual Setup

If the automatic setup fails, you can set up manually:

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start development
npm run dev
```

## Available Commands

### Jasper UI Commands (Different MCP Server Configurations)
- `npm run jasper:basic` - Start with basic configuration
- `npm run jasper:builtin` - Start with builtin MCP servers only
- `npm run jasper:mixed` - **Start with builtin + remote MCP servers**
- `npm run jasper:with-remotes` - Same as mixed (builtin + remote servers)
- `npm run jasper:local-stack` - Start with local development stack
- `npm run jasper:production` - Start with production configuration

### Standalone MCP Server Commands
- `npm run service-manager:local` - Run service-manager as standalone MCP server (local mode, port 8081)
- `npm run service-manager:remote` - Run service-manager as standalone MCP server (remote mode, port 8080, auth required)
- `npm run service-manager:dev` - Run service-manager in development mode
- `npm run mcp-server:standalone` - Run universal MCP server launcher with service-manager
- `npm run mcp-server:remote` - Run universal MCP server launcher in remote mode with auth

### Development Commands
- `npm run dev` - Start Jasper UI with default configuration
- `npm run build` - Build all packages
- `npm run typecheck` - Run TypeScript type checking
- `npm run test` - Run tests

### Utility Commands
- `npm run clean` - Clean all build artifacts and node_modules
- `npm run setup` - Run cross-platform setup script

## Project Structure

```
Jasper/
├── apps/
│   ├── jasper-ui/          # Main Jasper terminal UI
│   └── mcp-server/         # Universal MCP server launcher
├── packages/
│   ├── mcp-client-lib/     # MCP client library
│   └── service-manager/    # Service management package
├── setup.js               # Cross-platform setup script
├── setup.bat              # Windows setup script
├── setup.sh               # Unix/Linux/macOS setup script
└── package.json           # Root workspace configuration
```

## Configuration

Jasper uses configuration files located in `.jasper/configs/`. These are automatically copied during development:

- `basic.json` - Basic configuration
- `development-builtin.json` - Development with builtin servers
- `local-dev-stack.json` - Local development stack
- `mixed-deployment.json` - **Mixed deployment (builtin + remote servers)**
- `hybrid-production.json` - Production hybrid setup
- `published-cli.json` - Published CLI configuration

### Mixed Deployment (Builtin + Remote MCP Servers)

The `mixed-deployment.json` configuration allows you to run both builtin and remote MCP servers simultaneously:

```bash
# Start Jasper with both builtin and remote MCP servers
npm run jasper:mixed
```

This configuration includes:
- **Local MCP servers** - Automatically started on ports 8081, 8082
- **Remote MCP servers** - Connected to staging/production environments
- **Service management** - Full control over local and remote services
- **Database management** - Both local Docker containers and remote databases

### Standalone Service Manager

You can run the service-manager as a standalone MCP server that other MCP clients can connect to:

```bash
# Run as local MCP server (no auth, port 8081)
npm run service-manager:local

# Run as remote MCP server (with auth, port 8080)
npm run service-manager:remote

# Run in development mode
npm run service-manager:dev
```

Then other MCP clients can connect to:
- Local: `http://localhost:8081/mcp/tools`
- Remote: `http://localhost:8080/mcp/tools` (requires API key)

## Cross-Platform Features

### File Operations
- All file copying operations use cross-platform utilities
- Path separators are handled automatically
- Temporary directories work across platforms

### Process Management
- Windows and Unix process handling
- Cross-platform service management
- Docker support where available

### Environment Variables
- Platform-specific environment variable handling
- Cross-platform cache directory management
- Node.js version compatibility

## Troubleshooting

### npm Permission Issues (macOS/Linux)

If you encounter permission errors with npm cache:

```bash
sudo chown -R $(whoami) ~/.npm
npm cache clean --force
```

### Windows-Specific Issues

1. **PowerShell Execution Policy**: If scripts won't run, enable script execution:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Path Issues**: Ensure Node.js and npm are in your PATH environment variable.

### TypeScript Compilation Errors

If you see TypeScript errors during build:

```bash
# Clean and rebuild
npm run clean
npm run setup
```

### Docker Issues

If Docker-based services fail:
- Ensure Docker is installed and running
- Check Docker daemon is accessible
- Verify user permissions for Docker

## Development

### Adding New Packages

1. Create package directory under `apps/` or `packages/`
2. Add package.json with workspace configuration
3. Update root package.json workspaces array if needed
4. Install dependencies: `npm install`

### Cross-Platform Considerations

When adding new scripts or commands:

1. **Use Node.js built-ins** instead of shell commands where possible
2. **Test on multiple platforms** before committing
3. **Use cross-platform packages** like `cpx2` for file operations
4. **Handle path separators** with `path.join()` or similar
5. **Consider environment differences** (case sensitivity, line endings)

## Contributing

1. Ensure cross-platform compatibility
2. Test on at least two different platforms
3. Update documentation for platform-specific features
4. Use the provided setup scripts for testing

## License

MIT