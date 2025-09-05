import { globalToolRegistry } from '../core/tools.js';
import { bashTool } from './bash.js';
import { permissionsTool } from './permissions.js';

// Register core tools
export function registerCoreTools(): void {
  // Register core tools
  globalToolRegistry.register(bashTool);
  globalToolRegistry.register(permissionsTool);
}

// Export tools for individual use
export { bashTool, permissionsTool };
export { globalToolRegistry } from '../core/tools.js';