# Modular Tool Display System

This system provides a plugin-based approach to handle tool-specific output formatting and rendering. Each tool can define its own display logic, content formatting, and visual presentation.

## Architecture

- **`types.ts`** - Core interfaces and types for display handlers
- **`registry.ts`** - Central display registry and manager
- **`handlers/`** - Tool-specific display handlers
- **`index.ts`** - Main exports for easy importing

## Built-in Display Handlers

### FileOpsDisplayHandler
Handles `file_ops` tool output with operation-specific formatting:

**Read Operations:**
```
📄 File: src/index.ts (150 lines)
   1 import React from 'react';
   2 import { App } from './App';
   3 // ... content with line numbers
```

**List Directory:**
```
📁 Directory listing:
├── 📄 package.json
├── 📁 src/
├── 📄 README.md
└── 📁 node_modules/
```

**Update Operations:**
```
📝 Updated lines 45-50 in: src/config.ts

📋 Changes:
- const oldValue = 'legacy';
+ const newValue = 'updated';
  // Context lines shown
```

**Create/Delete:**
```
📄 File created: src/newFile.ts
📊 Size: 1.2KB
📝 Lines: 45
```

### BashDisplayHandler
Handles command execution with enhanced formatting:

**Successful Commands:**
```
💻 Command: ls -la src/
⏱️ Duration: 45ms
📋 Exit code: 0

📤 Output:
total 24
drwxr-xr-x  8 user  staff   256 Jan 10 10:30 .
-rw-r--r--  1 user  staff  1234 Jan 10 10:29 index.ts
```

**Failed Commands:**
```
💻 Command: invalid-command
❌ Failed with exit code: 127

🔴 Error output:
command not found: invalid-command
```

**Special Command Detection:**
- `ls`, `find` → Enhanced file listing format
- `ps`, `top` → Process information formatting
- Automatic truncation for long outputs

### WebFetchDisplayHandler  
Handles HTTP requests with content-type specific formatting:

**JSON Responses:**
```
🌐 Fetched: https://api.github.com/users/octocat
✅ Status: 200
📄 Content-Type: application/json
📊 Size: 2.4KB
⏱️ Response time: 250ms

📋 JSON Response:
{
  "login": "octocat",
  "id": 1,
  "name": "The Octocat"
}
```

**HTML Responses:**
```
🌐 Fetched: https://example.com
✅ Status: 200
📖 Title: Example Domain
📝 Description: This domain is for examples

📄 Content preview:
Example Domain This domain is for use in examples...
```

**Error Responses:**
```
🌐 Failed to fetch: https://invalid.com
❌ Status: 404
🚨 Error: Not Found
```

### DefaultDisplayHandler
Fallback handler for tools without specific formatters:

```
✅ my_custom_tool operation completed successfully

Tool output:
{result content formatted as JSON or text}
```

## Adding a New Tool Display Handler

### 1. Create Handler Class

```typescript
import { ToolDisplayHandler, DisplayContext, DisplayResult } from '../types.js';

export class DatabaseDisplayHandler implements ToolDisplayHandler {
  toolName = 'database_query';
  
  canHandle(context: DisplayContext): boolean {
    return context.toolName === 'database_query' && context.result.success;
  }
  
  formatResult(context: DisplayContext): DisplayResult {
    const { operation, result, parameters } = context;
    
    switch (operation) {
      case 'select':
        return this.formatSelectResult(context);
      case 'insert':
        return this.formatInsertResult(context);
      case 'update':
        return this.formatUpdateResult(context);
      default:
        return this.formatGenericResult(context);
    }
  }
  
  private formatSelectResult(context: DisplayContext): DisplayResult {
    const rows = context.result.result?.rows || [];
    const columns = context.result.result?.columns || [];
    
    let content = `🗃️ Query: ${context.parameters.query}\n`;
    content += `📊 Results: ${rows.length} row(s)\n\n`;
    
    if (rows.length > 0) {
      // Format as table
      content += this.formatTable(columns, rows);
    }
    
    return {
      content,
      isFileContent: false,
      shouldCollapse: rows.length > 10
    };
  }
  
  getSummary(context: DisplayContext): string {
    const { operation, result, parameters } = context;
    const rowCount = result.result?.rows?.length || 0;
    
    if (operation === 'select') {
      return `🗃️ SELECT returned ${rowCount} rows`;
    }
    
    return `✅ ${operation?.toUpperCase()} completed`;
  }
  
  shouldCollapse(context: DisplayContext): boolean {
    const rows = context.result.result?.rows || [];
    return rows.length > 15;
  }
}
```

### 2. Register Handler

```typescript
import { displayRegistry } from '../registry.js';
import { DatabaseDisplayHandler } from './databaseHandler.js';

// Register during app initialization  
displayRegistry.registerHandler(new DatabaseDisplayHandler());
```

### 3. Advanced Display Features

**Custom React Components:**
```typescript
formatResult(context: DisplayContext): DisplayResult {
  // For complex visualizations, return a React component
  return {
    content: '', // Fallback text
    customComponent: <ChartComponent data={context.result.data} />
  };
}
```

**Operation-Specific Logic:**
```typescript
formatResult(context: DisplayContext): DisplayResult {
  const { operation } = context;
  
  // Different formatting based on operation
  switch (operation) {
    case 'analyze':
      return this.formatAnalysisResult(context);
    case 'benchmark':
      return this.formatBenchmarkResult(context);
    case 'export':
      return this.formatExportResult(context);
  }
}
```

**Content Detection:**
```typescript
canHandle(context: DisplayContext): boolean {
  // Advanced detection logic
  return context.toolName === 'my_tool' && 
         context.result.success &&
         context.result.result?.type === 'data_analysis';
}
```

## Registry API

```typescript
import { displayRegistry } from './display/index.js';

// Format a tool result
const displayResult = displayRegistry.formatToolResult({
  toolName: 'file_ops',
  operation: 'read',
  parameters: { file_path: '/src/index.ts' },
  result: toolResult,
  isExpanded: false,
  isFocused: false
});

// Get summary for collapsed view
const summary = displayRegistry.getSummary(context);

// Check if content should be collapsed
const shouldCollapse = displayRegistry.shouldCollapse(context);

// Register new handler
displayRegistry.registerHandler(new MyCustomHandler());

// Check registration
const hasHandler = displayRegistry.hasHandler('my_tool');
```

## Integration with Renderer

The display system integrates with the existing message renderer:

```typescript
// In renderer.tsx
import { displayRegistry } from '../display/registry.js';

// Extract tool information from result
const toolInfo = extractToolInfo(result);

if (toolInfo) {
  const displayContext = {
    toolName: toolInfo.toolName,
    operation: toolInfo.operation,
    parameters: toolInfo.parameters,
    result: parsed,
    isExpanded,
    isFocused,
    displayNumber
  };
  
  const displayResult = displayRegistry.formatToolResult(displayContext);
  // Render using displayResult.content
}
```

## Benefits

- **🎨 Tool-Specific**: Each tool controls its own visual presentation
- **🔧 Operation-Aware**: Different operations can have different formatting
- **📊 Rich Display**: Support for tables, charts, diffs, trees, etc.
- **🔌 Extensible**: Easy to add new tools without core changes
- **⚡ Performance**: Efficient content detection and processing
- **🎯 Contextual**: Summaries and collapse logic per tool type
- **🏷️ Typed**: Full TypeScript support with interfaces

## Content Types Supported

- **File Content**: Syntax highlighting, line numbers, diffs
- **Directory Trees**: Hierarchical folder structures with icons
- **Command Output**: Enhanced shell command formatting
- **HTTP Responses**: Content-type aware formatting
- **Database Results**: Tabular data presentation
- **JSON/XML**: Pretty-printed structured data
- **Binary Data**: Safe binary content handling
- **Error Messages**: Enhanced error formatting with context

The modular display system makes tool output more readable, contextual, and visually appealing while maintaining consistency across the application.