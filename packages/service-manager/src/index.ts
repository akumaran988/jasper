// Export the simplified service manager for direct use in jasper-ui
export { SimpleServiceManager } from './SimpleServiceManager';
export type { ServiceConfig, ServiceInstance } from './SimpleServiceManager';

// Also export the full service manager for MCP server usage
export { ServiceManager } from './services/ServiceManager';
export { MCPToolHandler } from './handlers/MCPToolHandler';

// Export interfaces for advanced usage
export type { IServiceProvider } from './interfaces/IServiceProvider';
export type { ILogger } from './interfaces/ILogger';

import { SimpleServiceManager } from './SimpleServiceManager';

/**
 * Create a simple service manager instance
 * This is the main entry point for using service manager as a library
 */
export function createServiceManager(): SimpleServiceManager {
  return new SimpleServiceManager();
}

// Export MCP-specific tools and definitions
export { MCP_TOOLS, createMCPToolHandlers, MCP_SERVER_INFO } from './mcp';