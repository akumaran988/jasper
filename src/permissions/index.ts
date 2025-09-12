// Main permission system exports
export { permissionRegistry } from './registry.js';
export * from './types.js';

// Handler exports for extending the system
export { FileOpsPermissionHandler } from './handlers/fileOpsHandler.js';
export { WebFetchPermissionHandler } from './handlers/webFetchHandler.js';
export { DefaultPermissionHandler } from './handlers/defaultHandler.js';