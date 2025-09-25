import { globalToolRegistry } from '../core/tools.js';
import { bashTool } from './bash.js';
import { fileOpsTool } from './fileops.js';
import { todoTool } from './todo.js';

// Register core tools
export function registerCoreTools(): void {
  // Register core tools
  globalToolRegistry.register(bashTool);
  globalToolRegistry.register(fileOpsTool);
  globalToolRegistry.register(todoTool);
}

// Export tools for individual use
export { bashTool, fileOpsTool, todoTool };
export { globalToolRegistry } from '../core/tools.js';