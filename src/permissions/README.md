# Modular Permission System

This system provides a plugin-based approach to handle tool-specific permission logic. Each tool can define its own permission matching rules, scope definitions, and session approval behavior.

## Architecture

- **`types.ts`** - Core interfaces and types
- **`registry.ts`** - Central permission registry and manager
- **`handlers/`** - Tool-specific permission handlers
- **`examples/`** - Example implementations for new tools

## Built-in Handlers

### FileOpsPermissionHandler
Handles `file_ops` tool permissions:
- **Folder-based permissions**: Approving a file grants access to entire folder and subfolders
- **Path hierarchy checking**: `/src/core/agent.ts` is covered by `/src` approval
- **Smart scope detection**: Automatically determines folder scope from file paths

### WebFetchPermissionHandler  
Handles `web_fetch` tool permissions:
- **Domain-based permissions**: Approving a URL grants access to entire domain
- **Subdomain support**: Optional subdomain matching (e.g., `api.example.com` under `example.com`)
- **URL parsing**: Robust handling of malformed URLs

### DefaultPermissionHandler
Fallback for any tool without a specific handler:
- **Tool-wide permissions**: Simple approve/deny for entire tool
- **Auto-registration**: Automatically created for unknown tools

## Adding a New Tool Handler

### 1. Create Handler Class

```typescript
import { ToolPermissionHandler, ToolCall, PermissionContext, PermissionCheckResult, ScopeInfo } from '../types.js';

export class MyToolPermissionHandler implements ToolPermissionHandler {
  toolName = 'my_tool';
  
  generatePermissionKey(toolCall: ToolCall): string {
    // Define how permission keys are generated
    // Example: my_tool:database:prod, my_tool:table:users, etc.
    if (toolCall.parameters?.database) {
      return \`\${toolCall.name}:database:\${toolCall.parameters.database}\`;
    }
    return \`\${toolCall.name}:tool\`;
  }
  
  checkPermission(context: PermissionContext): PermissionCheckResult {
    // Define custom permission matching logic
    const { toolCall, existingApprovals } = context;
    
    // Check exact matches, hierarchical permissions, etc.
    // Return { allowed: true/false, reason?, matchedRule? }
  }
  
  getScopeInfo(toolCall: ToolCall): ScopeInfo {
    // Define what "session approval" means for this tool
    return {
      scope: 'database', // or 'domain', 'folder', 'custom', 'tool'
      scopeValue: toolCall.parameters?.database,
      description: \`all queries on \${toolCall.parameters?.database}\`
    };
  }
  
  getSessionDescription(toolCall: ToolCall): string {
    // Human-readable description for the permission UI
    const scopeInfo = this.getScopeInfo(toolCall);
    return \`Yes for this session (\${scopeInfo.description})\`;
  }
}
```

### 2. Register Handler

```typescript
import { permissionRegistry } from '../registry.js';
import { MyToolPermissionHandler } from './myToolHandler.js';

// Register during app initialization
permissionRegistry.registerHandler(new MyToolPermissionHandler());
```

### 3. Custom Permission Logic Examples

**Database Tool - Multiple Scope Types:**
```typescript
generatePermissionKey(toolCall: ToolCall): string {
  // Priority: database > queryType > table > tool
  if (toolCall.parameters?.database) {
    return \`database_query:database:\${toolCall.parameters.database}\`;
  }
  if (toolCall.parameters?.queryType) {
    return \`database_query:queryType:\${toolCall.parameters.queryType}\`;
  }
  return \`database_query:tool\`;
}

checkPermission(context: PermissionContext): PermissionCheckResult {
  // Database-wide permission covers all operations
  // SELECT permission allows read-only operations (DESCRIBE, SHOW)
  // Custom hierarchy and inheritance logic
}
```

**API Tool - Endpoint-based:**
```typescript
generatePermissionKey(toolCall: ToolCall): string {
  if (toolCall.parameters?.endpoint) {
    // Group by API service: api_call:service:github, api_call:service:slack
    const url = new URL(toolCall.parameters.endpoint);
    const service = this.extractServiceName(url.hostname);
    return \`api_call:service:\${service}\`;
  }
  return \`api_call:tool\`;
}
```

**SSH Tool - Host-based:**
```typescript
generatePermissionKey(toolCall: ToolCall): string {
  if (toolCall.parameters?.host) {
    return \`ssh:host:\${toolCall.parameters.host}\`;
  }
  return \`ssh:tool\`;
}

checkPermission(context: PermissionContext): PermissionCheckResult {
  // Check host-specific permissions
  // Handle IP vs hostname matching
  // Support host groups/patterns
}
```

## Registry API

```typescript
import { permissionRegistry } from './permissions/index.js';

// Check if a tool call is permitted
const result = permissionRegistry.checkPermission(toolCall, existingApprovals);
if (result.allowed) {
  console.log(result.reason); // Why it was allowed
}

// Generate permission key
const key = permissionRegistry.generatePermissionKey(toolCall);

// Get session description for UI
const description = permissionRegistry.getSessionDescription(toolCall);

// Create permission rule
const rule = permissionRegistry.createPermissionRule(toolCall);

// Register new handler
permissionRegistry.registerHandler(new CustomHandler());
```

## Benefits

- **🔧 Modular**: Each tool manages its own permission logic
- **🎯 Specific**: Rich, tool-appropriate permission scopes  
- **🔌 Extensible**: Easy to add new tools without core changes
- **🧠 Smart**: Hierarchical permissions (folders, domains, etc.)
- **🏷️ Typed**: Full TypeScript support with interfaces
- **📋 Logged**: Automatic permission grant/deny logging

## Integration

The system integrates seamlessly with the existing permission UI and session management. The permission selector automatically uses the handler's `getSessionDescription()` to show contextual options like "Yes for this session (all files in /src)".