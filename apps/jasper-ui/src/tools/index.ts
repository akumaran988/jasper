import { globalToolRegistry } from '../core/tools.js';
import { bashTool } from './bash.js';
import { fileOpsTool } from './fileops.js';

// Register core tools
export function registerCoreTools(): void {
  // Register core tools
  globalToolRegistry.register(bashTool);
  globalToolRegistry.register(fileOpsTool);
}

// Export tools for individual use
export { bashTool, fileOpsTool };
export { globalToolRegistry } from '../core/tools.js';