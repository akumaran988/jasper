// Main display system exports
export { displayRegistry } from './registry.js';
export * from './types.js';

// Handler exports for extending the system
export { FileOpsDisplayHandler } from './handlers/fileOpsHandler.js';
export { BashDisplayHandler } from './handlers/bashHandler.js';
export { WebFetchDisplayHandler } from './handlers/webFetchHandler.js';
export { DefaultDisplayHandler } from './handlers/defaultHandler.js';