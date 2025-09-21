import { Message, ToolResult, LLMProvider } from '../../src/types/index.js';

export class TestConversationBuilder {
  private messages: Message[] = [];
  private currentTimestamp = new Date('2025-01-01T10:00:00Z');

  addUserMessage(content: string): this {
    this.messages.push({
      role: 'user',
      content,
      timestamp: new Date(this.currentTimestamp)
    });
    this.incrementTime(1000); // 1 second
    return this;
  }

  addAssistantMessage(content: string): this {
    this.messages.push({
      role: 'assistant',
      content,
      timestamp: new Date(this.currentTimestamp)
    });
    this.incrementTime(2000); // 2 seconds
    return this;
  }

  addSystemMessage(content: string): this {
    this.messages.push({
      role: 'system',
      content,
      timestamp: new Date(this.currentTimestamp)
    });
    this.incrementTime(500); // 0.5 seconds
    return this;
  }

  addToolResultMessage(toolResults: ToolResult[]): this {
    this.messages.push({
      role: 'system',
      content: `Tool execution results: ${toolResults.length} results`,
      toolResults,
      timestamp: new Date(this.currentTimestamp)
    });
    this.incrementTime(3000); // 3 seconds
    return this;
  }

  addFileReadTool(filePath: string, content: string, success: boolean = true): this {
    const toolResult: ToolResult = {
      id: `file_ops_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      success,
      result: success ? {
        operation: 'read',
        file_path: filePath,
        content,
        total_lines: content.split('\n').length
      } : null,
      error: success ? undefined : 'File not found',
      executionTime: 150
    };
    return this.addToolResultMessage([toolResult]);
  }

  addDirectoryListTool(directory: string, items: string[], success: boolean = true): this {
    const toolResult: ToolResult = {
      id: `file_ops_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      success,
      result: success ? {
        operation: 'list_dir',
        directory,
        items,
        total_items: items.length
      } : null,
      error: success ? undefined : 'Directory not accessible',
      executionTime: 100
    };
    return this.addToolResultMessage([toolResult]);
  }

  addBashTool(command: string, output: string, success: boolean = true): this {
    const toolResult: ToolResult = {
      id: `bash_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      success,
      result: success ? {
        command,
        output,
        exitCode: 0
      } : null,
      error: success ? undefined : 'Command execution failed',
      executionTime: 500
    };
    return this.addToolResultMessage([toolResult]);
  }

  addWebFetchTool(url: string, content: string, success: boolean = true): this {
    const toolResult: ToolResult = {
      id: `web_fetch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      success,
      result: success ? {
        url,
        content,
        status: 200,
        contentType: 'text/html'
      } : null,
      error: success ? undefined : 'Network error',
      executionTime: 1200
    };
    return this.addToolResultMessage([toolResult]);
  }

  // Create duplicate tool result for testing deduplication
  addDuplicateFileRead(filePath: string, content: string): this {
    return this.addFileReadTool(filePath, content, true);
  }

  // Add multiple messages quickly
  addConversationChain(userPrompt: string, assistantResponse: string, toolCount: number = 1): this {
    this.addUserMessage(userPrompt);
    this.addAssistantMessage(assistantResponse);
    
    // Add some tool executions
    for (let i = 0; i < toolCount; i++) {
      this.addFileReadTool(
        `/tmp/file_${i}.txt`,
        `Content of file ${i}\nLine 2\nLine 3`,
        true
      );
    }
    
    return this;
  }

  build(): Message[] {
    return [...this.messages];
  }

  clear(): this {
    this.messages = [];
    this.currentTimestamp = new Date('2025-01-01T10:00:00Z');
    return this;
  }

  private incrementTime(milliseconds: number): void {
    this.currentTimestamp = new Date(this.currentTimestamp.getTime() + milliseconds);
  }
}

export class MockLLMProvider implements LLMProvider {
  name = 'mock-llm-provider';
  private responses: string[] = [];
  private currentResponseIndex = 0;

  constructor(responses: string[] = []) {
    this.responses = responses.length > 0 ? responses : [
      'User requested file analysis and code review. I examined the project structure and provided suggestions.',
      'User asked for help with debugging. I analyzed the error logs and identified the root cause.',
      'User wanted to refactor code. I reviewed the existing implementation and proposed improvements.',
      'User needed documentation updates. I reviewed the current docs and suggested enhancements.',
      'User requested performance optimization. I analyzed the bottlenecks and recommended solutions.'
    ];
  }

  async generateResponse(_messages: Message[], _tools: any[]): Promise<any> {
    const response = this.responses[this.currentResponseIndex % this.responses.length];
    this.currentResponseIndex++;

    return {
      content: response,
      should_continue: false,
      reasoning: 'Mock response for testing'
    };
  }

  addResponse(response: string): void {
    this.responses.push(response);
  }

  reset(): void {
    this.currentResponseIndex = 0;
  }
}

export const TestFixtures = {
  // Simple conversation for basic testing
  createSimpleConversation(): Message[] {
    return new TestConversationBuilder()
      .addUserMessage('Please read the README.md file')
      .addAssistantMessage('I\'ll read the README.md file for you.')
      .addFileReadTool('/project/README.md', '# Project\n\nThis is a sample project.\n\n## Installation\n\nnpm install')
      .addAssistantMessage('I\'ve read the README file. It contains project information and installation instructions.')
      .build();
  },

  // Conversation with duplicate tool results
  createConversationWithDuplicates(): Message[] {
    return new TestConversationBuilder()
      .addUserMessage('Read the config file')
      .addAssistantMessage('Reading the configuration file.')
      .addFileReadTool('/app/config.json', '{"apiKey": "test", "timeout": 5000}')
      .addUserMessage('Can you read that config file again?')
      .addAssistantMessage('Reading the configuration file again.')
      .addDuplicateFileRead('/app/config.json', '{"apiKey": "test", "timeout": 5000}')
      .addUserMessage('Show me the package.json too')
      .addAssistantMessage('Reading package.json file.')
      .addFileReadTool('/app/package.json', '{"name": "test-app", "version": "1.0.0"}')
      .build();
  },

  // Large conversation for performance testing
  createLargeConversation(): Message[] {
    const builder = new TestConversationBuilder();
    
    // Simulate a long development session
    builder
      .addUserMessage('Help me analyze this React project structure')
      .addAssistantMessage('I\'ll help you analyze the React project. Let me start by examining the directory structure.')
      .addDirectoryListTool('/src', ['components/', 'hooks/', 'utils/', 'pages/', 'App.tsx', 'index.tsx'])
      .addAssistantMessage('I can see this is a well-organized React project. Let me examine the main components.');

    // Add many file operations
    const files = [
      { path: '/src/App.tsx', content: 'import React from "react";\n\nfunction App() {\n  return <div>Hello World</div>;\n}\n\nexport default App;' },
      { path: '/src/components/Header.tsx', content: 'import React from "react";\n\nexport const Header = () => {\n  return <header>My App</header>;\n};' },
      { path: '/src/components/Footer.tsx', content: 'import React from "react";\n\nexport const Footer = () => {\n  return <footer>© 2025</footer>;\n};' },
      { path: '/src/hooks/useApi.ts', content: 'import { useState, useEffect } from "react";\n\nexport const useApi = (url: string) => {\n  const [data, setData] = useState(null);\n  // ... hook logic\n  return data;\n};' },
      { path: '/src/utils/helpers.ts', content: 'export const formatDate = (date: Date) => {\n  return date.toLocaleDateString();\n};\n\nexport const capitalize = (str: string) => {\n  return str.charAt(0).toUpperCase() + str.slice(1);\n};' }
    ];

    files.forEach((file, index) => {
      builder
        .addUserMessage(`Examine ${file.path}`)
        .addAssistantMessage(`Analyzing ${file.path}...`)
        .addFileReadTool(file.path, file.content)
        .addAssistantMessage(`The ${file.path} file looks good. ${index < files.length - 1 ? 'Moving to the next file.' : 'Analysis complete.'}`);
    });

    // Add some command executions
    builder
      .addUserMessage('Run the test suite')
      .addAssistantMessage('Running the test suite for you.')
      .addBashTool('npm test', 'PASS src/App.test.tsx\n✓ renders learn react link (23ms)\n\nTest Suites: 1 passed, 1 total\nTests: 1 passed, 1 total')
      .addUserMessage('Check the build status')
      .addAssistantMessage('Checking the build status.')
      .addBashTool('npm run build', 'Creating an optimized production build...\nCompiled successfully.\n\nFile sizes after gzip:\n  41.2 KB  build/static/js/main.js')
      .addUserMessage('What\'s the project dependency status?')
      .addAssistantMessage('Checking dependencies.')
      .addBashTool('npm audit', 'found 0 vulnerabilities');

    // Add some web research
    builder
      .addUserMessage('Look up React best practices')
      .addAssistantMessage('I\'ll search for React best practices.')
      .addWebFetchTool('https://react.dev/learn', '<html><head><title>React Documentation</title></head><body><h1>Learn React</h1><p>React best practices...</p></body></html>');

    // Add many more interactions to reach token threshold
    for (let i = 0; i < 10; i++) {
      builder.addConversationChain(
        `Please review the implementation of feature ${i + 1}`,
        `I've reviewed feature ${i + 1}. The implementation looks solid with good error handling.`,
        2
      );
    }

    return builder.build();
  },

  // Conversation that simulates real Jasper usage
  createRealisticJasperConversation(): Message[] {
    return new TestConversationBuilder()
      .addUserMessage('I need help debugging a TypeScript compilation error in my React app')
      .addAssistantMessage('I\'ll help you debug the TypeScript compilation error. Let me start by examining your project structure and then look at the specific error.')
      .addDirectoryListTool('/Users/dev/my-app/src', ['components/', 'hooks/', 'types/', 'utils/', 'App.tsx', 'index.tsx'])
      .addAssistantMessage('I can see your project structure. Let me check the TypeScript configuration and examine the files that might be causing the error.')
      .addFileReadTool('/Users/dev/my-app/tsconfig.json', '{\n  "compilerOptions": {\n    "target": "es5",\n    "lib": ["dom", "dom.iterable", "es6"],\n    "allowJs": true,\n    "skipLibCheck": true,\n    "esModuleInterop": true,\n    "allowSyntheticDefaultImports": true,\n    "strict": true,\n    "forceConsistentCasingInFileNames": true,\n    "moduleResolution": "node",\n    "resolveJsonModule": true,\n    "isolatedModules": true,\n    "noEmit": true,\n    "jsx": "react-jsx"\n  },\n  "include": ["src"]\n}')
      .addUserMessage('The error is in my UserProfile component - it says "Property \'email\' does not exist on type \'User\'"')
      .addAssistantMessage('Let me examine your UserProfile component and the User type definition to identify the issue.')
      .addFileReadTool('/Users/dev/my-app/src/components/UserProfile.tsx', 'import React from "react";\nimport { User } from "../types/User";\n\ninterface Props {\n  user: User;\n}\n\nexport const UserProfile: React.FC<Props> = ({ user }) => {\n  return (\n    <div>\n      <h2>{user.name}</h2>\n      <p>{user.email}</p> {/* Error here */}\n      <p>{user.phone}</p>\n    </div>\n  );\n};')
      .addFileReadTool('/Users/dev/my-app/src/types/User.ts', 'export interface User {\n  id: number;\n  name: string;\n  phone?: string;\n  // email property is missing!\n}')
      .addAssistantMessage('I found the issue! The `User` interface in `/src/types/User.ts` is missing the `email` property, but your `UserProfile` component is trying to access `user.email`. Let me fix this by adding the email property to the User interface.')
      .addUserMessage('Yes, please fix that. The email should be required')
      .addAssistantMessage('I\'ll add the email property as a required field to the User interface.')
      .addFileReadTool('/Users/dev/my-app/src/types/User.ts', 'export interface User {\n  id: number;\n  name: string;\n  email: string; // Added email property\n  phone?: string;\n}')
      .addAssistantMessage('Perfect! I\'ve added the `email: string` property to the User interface. Now let\'s verify that the TypeScript compilation error is resolved.')
      .addBashTool('npx tsc --noEmit', 'No compilation errors found.')
      .addAssistantMessage('Great! The TypeScript compilation error has been resolved. The User interface now includes the email property, and your UserProfile component should work correctly.')
      .addUserMessage('Thanks! Can you also help me add error handling for missing user data?')
      .addAssistantMessage('Absolutely! I\'ll help you add proper error handling for cases where user data might be missing or invalid. Let me update the UserProfile component with defensive programming practices.')
      .addFileReadTool('/Users/dev/my-app/src/components/UserProfile.tsx', 'import React from "react";\nimport { User } from "../types/User";\n\ninterface Props {\n  user: User | null;\n}\n\nexport const UserProfile: React.FC<Props> = ({ user }) => {\n  if (!user) {\n    return <div>User data not available</div>;\n  }\n\n  return (\n    <div>\n      <h2>{user.name || "Unknown User"}</h2>\n      <p>{user.email || "No email provided"}</p>\n      <p>{user.phone || "No phone provided"}</p>\n    </div>\n  );\n};')
      .addAssistantMessage('I\'ve updated the UserProfile component with proper error handling:\n\n1. Changed the user prop type to `User | null` to handle cases where user data might not be available\n2. Added a null check that displays a fallback message when user is null\n3. Added fallback values for each property in case they\'re empty or undefined\n\nThis makes your component much more robust against missing or incomplete data.')
      .build();
  }
};