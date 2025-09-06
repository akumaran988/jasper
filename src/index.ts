#!/usr/bin/env node

import React, { useState, useEffect } from 'react';
import { render, Text } from 'ink';
import { Command } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import Terminal from './ui/terminal.js';
import { ConversationAgent } from './core/agent.js';
import { GeminiProvider, CustomProvider } from './core/llm.js';
import { registerCoreTools } from './tools/index.js';
import { JasperConfig, ConversationContext } from './types/index.js';

// Load environment variables
dotenv.config();

// Default configuration
const DEFAULT_CONFIG: JasperConfig = {
  llmProvider: 'gemini',
  maxIterations: 10,
  model: 'gemini-2.5-flash-lite'
};

function loadConfig(): JasperConfig {
  const configPath = path.join(process.cwd(), 'jasper.config.json');
  
  try {
    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(configFile);
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch (error) {
    console.warn('⚠️  Error loading config file, using defaults');
  }
  
  return DEFAULT_CONFIG;
}

function createLLMProvider(config: JasperConfig) {
  const apiKey = config.apiKey || 
    process.env.GEMINI_API_KEY || 
    process.env.API_KEY;

  if (!apiKey && config.llmProvider !== 'custom') {
    throw new Error(`API key required for ${config.llmProvider}. Set GEMINI_API_KEY or API_KEY environment variable.`);
  }

  switch (config.llmProvider) {
    case 'gemini':
      return new GeminiProvider(apiKey!, config.model);
    case 'custom':
      if (!config.customEndpoint) {
        throw new Error('Custom endpoint required for custom provider');
      }
      return new CustomProvider(config.customEndpoint, apiKey);
    default:
      throw new Error(`Unknown LLM provider: ${config.llmProvider}`);
  }
}

interface AppProps {
  config: JasperConfig;
}

const App: React.FC<AppProps> = ({ config }) => {
  const [agent, setAgent] = useState<ConversationAgent | null>(null);
  const [context, setContext] = useState<ConversationContext>({
    messages: [],
    tools: [],
    maxIterations: config.maxIterations,
    currentIteration: 0
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<{
    toolCall: any;
    resolve: (approved: boolean) => void;
  } | null>(null);

  const requestPermission = async (toolCall: any): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingPermission({ toolCall, resolve });
    });
  };

  const handlePermissionResponse = (approved: boolean) => {
    if (pendingPermission) {
      pendingPermission.resolve(approved);
      setPendingPermission(null);
    }
  };

  useEffect(() => {
    try {
      // Register core tools
      registerCoreTools();
      
      // Create LLM provider
      const llmProvider = createLLMProvider(config);
      
      // Create conversation agent with permission callback and throttling
      const conversationAgent = new ConversationAgent(
        llmProvider, 
        config.maxIterations,
        requestPermission,
        config.apiThrottleMs || 3000
      );
      setAgent(conversationAgent);
      setContext(conversationAgent.getContext());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    }
  }, [config]);

  const handleMessage = async (message: string) => {
    if (!agent || isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      const updatedContext = await agent.processMessage(message);
      setContext(updatedContext);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  if (error) {
    return React.createElement(Text, { color: 'red' }, `❌ Error: ${error}`);
  }

  if (!agent) {
    return React.createElement(Text, { color: 'yellow' }, '⏳ Initializing Jasper...');
  }

  return React.createElement(Terminal, {
    context,
    onMessage: handleMessage,
    isProcessing,
    pendingPermission,
    onPermissionResponse: handlePermissionResponse
  });
};

// CLI setup
const program = new Command();

program
  .name('jasper')
  .description('Jasper - A Claude Code-like AI development assistant')
  .version('1.0.0')
  .option('-p, --provider <provider>', 'LLM provider (gemini, custom)', 'gemini')
  .option('-m, --model <model>', 'Model to use')
  .option('-k, --api-key <key>', 'API key for the LLM provider')
  .option('-e, --endpoint <url>', 'Custom endpoint URL (for custom provider)')
  .option('-i, --max-iterations <number>', 'Maximum iterations per conversation', '10')
  .option('-c, --config <path>', 'Path to config file')
  .action((options) => {
    let config = loadConfig();
    
    // Override config with CLI options
    if (options.provider) config.llmProvider = options.provider;
    if (options.model) config.model = options.model;
    if (options.apiKey) config.apiKey = options.apiKey;
    if (options.endpoint) config.customEndpoint = options.endpoint;
    if (options.maxIterations) config.maxIterations = parseInt(options.maxIterations);

    // Render the app
    render(React.createElement(App, { config }));
  });

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the program
program.parse();