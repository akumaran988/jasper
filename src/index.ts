#!/usr/bin/env node

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Text } from 'ink';
import { Command } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import Terminal from './ui/terminal.js';
import { ConversationAgent } from './core/agent.js';
import { GoogleAIProvider, CustomProvider } from './core/llm.js';
import { registerCoreTools } from './tools/index.js';
import { JasperConfig, ConversationContext, PermissionContext, PermissionResponse, PermissionRule, Message } from './types/index.js';
import { initializeLogger, closeLogger, getLogger } from './utils/logger.js';
import { shouldCompactConversation, createConversationSummary, countConversationTokens } from './utils/tokenCounter.js';
import { permissionRegistry } from './permissions/registry.js';

// Load environment variables
dotenv.config();

// Default configuration
const DEFAULT_CONFIG: JasperConfig = {
  llmProvider: 'google-ai',
  maxIterations: 10,
  model: 'gemini-2.5-flash-lite',
  tokenLimit: 10000
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
    process.env.GOOGLE_AI_API_KEY || 
    process.env.API_KEY;

  if (!apiKey && config.llmProvider !== 'custom') {
    throw new Error(`API key required for ${config.llmProvider}. Set GOOGLE_AI_API_KEY or API_KEY environment variable.`);
  }

  switch (config.llmProvider) {
    case 'google-ai':
      return new GoogleAIProvider(apiKey!, config.model);
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
    allMessages: [],
    lastCompactionIndex: 0,
    tools: [],
    maxIterations: config.maxIterations,
    currentIteration: 0,
    tokenCount: 0
  });
  
  const handleClearConversation = useCallback(() => {
    setContext(prev => ({
      ...prev,
      messages: [],
      allMessages: [],
      lastCompactionIndex: 0,
      currentIteration: 0,
      tokenCount: 0,
      compactedSummary: undefined
    }));
    // Also clear session approvals
    sessionApprovalsRef.current.clear();
    setSessionApprovals(new Map());
  }, []);
  
  const handleCompactConversation = useCallback(async () => {
    setIsCompacting(true);
    
    try {
      let summary: string;
      try {
        // Get the current LLM provider for summary generation
        const currentConfig = config;
        const llmProvider = createLLMProvider(currentConfig);
        
        // Create AI summary of messages to be compacted (all but last 10)
        const messagesToSummarize = context.messages.slice(0, -10);
        summary = await createConversationSummary(messagesToSummarize, llmProvider);
      } catch (error) {
        console.warn('Failed to initialize LLM for summary, using basic fallback');
        summary = await createConversationSummary(context.messages.slice(0, -10));
      }
      
      setContext(prev => {
        // Keep only recent messages (last 10) plus the summary
        const recentMessages = prev.messages.slice(-10);
        
        // Create summary message
        const summaryMessage: Message = {
          role: 'system',
          content: summary,
          timestamp: new Date()
        };
        
        return {
          ...prev,
          messages: [summaryMessage, ...recentMessages],
          currentIteration: 0
        };
      });
    } finally {
      setIsCompacting(false);
    }
  }, [config, context.messages]);
  
  // Auto-compact when token limit is reached - DISABLED to preserve all messages
  const checkAndAutoCompact = useCallback(async () => {
    // DISABLED: Auto-compaction removes messages, preventing access to full history
    // Users can manually compact with /compact command if needed
    // const tokenLimit = config.tokenLimit || 10000;
    // 
    // if (shouldCompactConversation(context.messages, tokenLimit)) {
    //   console.log(`🤏 Auto-compacting conversation (${countConversationTokens(context.messages)} > ${tokenLimit} tokens)`);
    //   await handleCompactConversation();
    // }
  }, [context.messages, config.tokenLimit, handleCompactConversation]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompacting, setIsCompacting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<PermissionContext | null>(null);
  const [sessionApprovals, setSessionApprovals] = useState<Map<string, PermissionRule>>(new Map());
  const sessionApprovalsRef = useRef<Map<string, PermissionRule>>(new Map());

  // Helper function to generate permission key using the registry
  const getPermissionKey = (toolCall: any): string => {
    return permissionRegistry.generatePermissionKey(toolCall);
  };

  const requestPermission = async (toolCall: any): Promise<boolean> => {
    // Debug: Log current session approvals and tool call
    const logger = getLogger();
    const currentApprovals = sessionApprovalsRef.current;
    logger.debug('Permission check details', {
      toolCall,
      sessionApprovals: Array.from(currentApprovals.entries()),
      sessionApprovalsSize: currentApprovals.size,
      generatedKey: permissionRegistry.generatePermissionKey(toolCall)
    });
    
    // Use the permission registry to check if permission is granted
    const permissionResult = permissionRegistry.checkPermission(toolCall, currentApprovals);
    
    logger.debug('Permission check result', { permissionResult });
    
    if (permissionResult.allowed) {
      // Don't log permission messages to console - they'll be shown in the UI
      return true;
    }
    
    return new Promise((resolve) => {
      const permissionContext: PermissionContext = {
        toolCall,
        resolve: (response: PermissionResponse) => {
          switch (response) {
            case 'yes':
              resolve(true);
              break;
            case 'session':
              // Create permission rule for session using registry
              const rule = permissionRegistry.createPermissionRule(toolCall);
              const permissionKey = getPermissionKey(toolCall);
              logger.debug('Saving session approval', {
                permissionKey,
                rule,
                toolCall
              });
              
              // Update both ref (for immediate access) and state (for UI updates)
              sessionApprovalsRef.current.set(permissionKey, rule);
              setSessionApprovals(prev => {
                const newMap = new Map(prev).set(permissionKey, rule);
                logger.debug('Session approvals after save', {
                  approvals: Array.from(newMap.entries()),
                  refSize: sessionApprovalsRef.current.size
                });
                return newMap;
              });
              resolve(true);
              break;
            case 'no':
            default:
              resolve(false);
              break;
          }
        },
        sessionApprovals: currentApprovals
      };
      setPendingPermission(permissionContext);
    });
  };

  const handlePermissionResponse = (response: PermissionResponse) => {
    if (pendingPermission) {
      pendingPermission.resolve(response);
      setPendingPermission(null);
    }
  };

  useEffect(() => {
    try {
      // Register core tools
      registerCoreTools();
      
      // Create LLM provider
      const llmProvider = createLLMProvider(config);
      
      // Create conversation agent with permission callback, throttling, and real-time UI updates
      const conversationAgent = new ConversationAgent(
        llmProvider, 
        config.maxIterations,
        requestPermission,
        config.apiThrottleMs || 3000,
        // Real-time context update callback
        (updatedContext) => {
          setContext(updatedContext);
        }
      );
      setAgent(conversationAgent);
      setContext(conversationAgent.getContext());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    }
  }, [config]);

  const handleMessage = async (message: string) => {
    if (!agent || isProcessing || isCompacting) return;

    setIsProcessing(true);
    setError(null);

    try {
      await agent.processMessage(message);
      // Context is already updated via real-time callback (line 243)
      // No need for additional setContext call to avoid duplicates
      
      // Auto-compact disabled to preserve all messages for scrolling
      // setTimeout(checkAndAutoCompact, 100); // Small delay to ensure context is updated
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
    isCompacting,
    pendingPermission,
    onPermissionResponse: handlePermissionResponse,
    sessionApprovals,
    onClearConversation: handleClearConversation,
    onCompactConversation: handleCompactConversation
  });
};

// CLI setup
const program = new Command();

program
  .name('jasper')
  .description('Jasper - An intelligent AI development assistant')
  .version('1.0.0')
  .option('-p, --provider <provider>', 'LLM provider (google-ai, custom)', 'google-ai')
  .option('-m, --model <model>', 'Model to use')
  .option('-k, --api-key <key>', 'API key for the LLM provider')
  .option('-e, --endpoint <url>', 'Custom endpoint URL (for custom provider)')
  .option('-i, --max-iterations <number>', 'Maximum iterations per conversation', '10')
  .option('-t, --token-limit <number>', 'Token limit before auto-compacting', '10000')
  .option('-c, --config <path>', 'Path to config file')
  .option('-l, --log-file [path]', 'Enable logging to file (optional path)', false)
  .option('-d, --debug', 'Enable debug logging')
  .action((options) => {
    let config = loadConfig();

    // Set default log file path in logs folder of repo
    const defaultLogFilePath = path.join(process.cwd(), 'logs', 'jasper.log');

    // Initialize logger
    const logConfig = {
      logToFile: options.logFile !== false,
      logFilePath: typeof options.logFile === 'string'
        ? options.logFile
        : defaultLogFilePath,
      logLevel: options.debug ? 'DEBUG' as const : 'INFO' as const,
      enableConsole: false // Don't log to console in terminal app
    };
    
    // Show log info before starting UI
    if (logConfig.logToFile) {
      console.log(`📋 Logging ${logConfig.logLevel} messages to: ${logConfig.logFilePath}`);
      console.log('');
    }
    
    initializeLogger(logConfig);

    // Override config with CLI options
    if (options.provider) config.llmProvider = options.provider;
    if (options.model) config.model = options.model;
    if (options.apiKey) config.apiKey = options.apiKey;
    if (options.endpoint) config.customEndpoint = options.endpoint;
    if (options.maxIterations) config.maxIterations = parseInt(options.maxIterations);
    if (options.tokenLimit) config.tokenLimit = parseInt(options.tokenLimit);

    // Log startup info before rendering
    if (logConfig.logToFile) {
      const logger = getLogger();
      logger.info('Jasper starting up', {
        logFilePath: logConfig.logFilePath,
        logLevel: logConfig.logLevel,
        maxIterations: config.maxIterations,
        provider: config.llmProvider
      });
    }
    
    // Render the app
    render(React.createElement(App, { config }));
    
    // Log after render to confirm startup
    if (logConfig.logToFile) {
      const logger = getLogger();
      logger.info('Jasper UI rendered successfully');
    }
  });

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  closeLogger();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  closeLogger();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  closeLogger();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeLogger();
  process.exit(0);
});

// Start the program
program.parse();