# Jasper 🚀

A Claude Code-like terminal AI assistant with tool calling capabilities. Jasper provides a conversational, multi-step, multi-agent development experience right in your terminal.

## Features

✨ **Claude Code-like Interface**: Familiar terminal UI with rich message rendering  
🔧 **Tool Calling**: Extensible tool system with built-in bash execution  
🧠 **Google Gemini Powered**: Fast and reliable AI conversations with custom API support  
🔄 **Multi-step Conversations**: Intelligent iteration control with configurable limits  
⚡ **Developer-focused**: Built specifically for development workflows  
🎯 **Easy Tool Addition**: Simple API for adding custom tools  

## Quick Start

### Installation

```bash
# Clone and install
git clone <repo-url> jasper
cd jasper
npm install

# Build the project
npm run build
```

### Setup

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Add your API key:**
   ```bash
   # For Google Gemini (Primary)
   echo "GEMINI_API_KEY=your_key_here" >> .env
   ```

3. **Optional: Create config file:**
   ```bash
   cp jasper.config.json.example jasper.config.json
   # Edit with your preferences
   ```

### Usage

```bash
# Run with npm
npm run dev

# Or use the built binary
npm start

# With CLI options
npx jasper --provider openai --max-iterations 15
npx jasper --provider gemini --model gemini-pro
npx jasper --provider custom --endpoint https://your-api.com/v1/chat
```

## Configuration

### Environment Variables

```bash
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key  
API_KEY=generic_api_key
CUSTOM_ENDPOINT=https://your-endpoint.com/v1
```

### Config File (jasper.config.json)

```json
{
  "llmProvider": "openai",
  "model": "gpt-4-turbo-preview", 
  "maxIterations": 10,
  "apiKey": "optional-override",
  "customEndpoint": "https://custom-api.com/v1/chat"
}
```

### CLI Options

```
Usage: jasper [options]

Options:
  -p, --provider <provider>     LLM provider (openai, gemini, custom)
  -m, --model <model>          Model to use
  -k, --api-key <key>          API key for the LLM provider  
  -e, --endpoint <url>         Custom endpoint URL
  -i, --max-iterations <num>   Maximum iterations per conversation
  -c, --config <path>          Path to config file
  -h, --help                   Show help
```

## Built-in Tools

### Bash Tool
Execute shell commands with safety checks and timeout protection.

```typescript
// Example tool call
{
  "name": "bash",
  "parameters": {
    "command": "ls -la",
    "timeout": 30000,
    "workingDirectory": "/path/to/dir",
    "background": false
  }
}
```

## Adding Custom Tools

Create a new tool by implementing the `Tool` interface:

```typescript
import { Tool } from './src/types';
import { globalToolRegistry } from './src/tools';

class MyTool implements Tool {
  name = 'my_tool';
  description = 'Description of what this tool does';
  parameters = {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'Input parameter' }
    },
    required: ['input']
  };

  async execute(params: any): Promise<any> {
    // Your tool logic here
    return { result: `Processed: ${params.input}` };
  }
}

// Register the tool
globalToolRegistry.register(new MyTool());
```

## Architecture

```
src/
├── core/
│   ├── agent.ts      # Main conversation agent  
│   ├── llm.ts        # LLM provider implementations
│   └── tools.ts      # Tool management system
├── ui/
│   ├── terminal.tsx  # Main terminal interface
│   ├── renderer.tsx  # Message rendering
│   └── input.tsx     # Input handling
├── tools/
│   ├── bash.ts       # Bash execution tool
│   └── index.ts      # Tool registry
└── types/
    └── index.ts      # TypeScript definitions
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production  
npm run build

# Type checking
npm run typecheck
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your tool or feature
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this in your projects!

---

Built with ❤️ for developers who want a powerful AI assistant in their terminal.