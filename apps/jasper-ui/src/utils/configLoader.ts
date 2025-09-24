import fs from 'fs';
import path from 'path';
import type { JasperConfig } from '../types/index.js';

// Default configuration
const DEFAULT_CONFIG: JasperConfig = {
  llmProvider: 'google-ai',
  maxIterations: 10,
  model: 'gemini-2.5-flash-lite',
  tokenLimit: 10000,
  apiThrottleMs: 3000,
};

export interface ConfigLoadResult {
  config: JasperConfig;
  source: 'explicit' | 'jasper-folder' | 'project-root' | 'default';
  path?: string;
}

/**
 * Load Jasper configuration with the following priority:
 * 1. Explicitly provided config file path
 * 2. .jasper/settings.json in current working directory
 * 3. jasper.config.json in current working directory
 * 4. Default configuration
 */
export function loadConfig(explicitConfigPath?: string): ConfigLoadResult {
  // 1. Try explicit config path
  if (explicitConfigPath) {
    const result = loadConfigFromPath(explicitConfigPath);
    if (result) {
      return {
        config: result,
        source: 'explicit',
        path: explicitConfigPath,
      };
    } else {
      throw new Error(`Explicit config file not found or invalid: ${explicitConfigPath}`);
    }
  }

  // 2. Try .jasper/settings.json in current working directory
  const jasperConfigPath = path.join(process.cwd(), '.jasper', 'settings.json');
  if (fs.existsSync(jasperConfigPath)) {
    const result = loadConfigFromPath(jasperConfigPath);
    if (result) {
      console.log(`📁 Using config from .jasper folder: ${jasperConfigPath}`);
      return {
        config: result,
        source: 'jasper-folder',
        path: jasperConfigPath,
      };
    }
  }

  // 3. Try jasper.config.json in current working directory  
  const projectConfigPath = path.join(process.cwd(), 'jasper.config.json');
  if (fs.existsSync(projectConfigPath)) {
    const result = loadConfigFromPath(projectConfigPath);
    if (result) {
      console.log(`📁 Using config from project root: ${projectConfigPath}`);
      return {
        config: result,
        source: 'project-root',
        path: projectConfigPath,
      };
    }
  }

  // 4. Use default configuration
  console.log('⚠️  No config file found, using default configuration');
  console.log('💡 Create .jasper/settings.json for custom configuration');
  
  return {
    config: DEFAULT_CONFIG,
    source: 'default',
  };
}

/**
 * Load and validate configuration from a specific file path
 */
function loadConfigFromPath(configPath: string): JasperConfig | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(configContent);
    
    // Merge with defaults
    const config = { ...DEFAULT_CONFIG, ...userConfig };
    
    // Validate configuration
    validateConfig(config);
    
    return config;
  } catch (error) {
    console.error(`❌ Error loading config from ${configPath}:`, error);
    return null;
  }
}

/**
 * Validate configuration object
 */
function validateConfig(config: JasperConfig): void {
  if (!config.llmProvider || !['google-ai', 'custom'].includes(config.llmProvider)) {
    throw new Error('Invalid llmProvider. Must be "google-ai" or "custom"');
  }

  if (config.maxIterations && (config.maxIterations < 1 || config.maxIterations > 100)) {
    throw new Error('maxIterations must be between 1 and 100');
  }

  if (config.tokenLimit && config.tokenLimit < 1000) {
    throw new Error('tokenLimit must be at least 1000');
  }

  if (config.apiThrottleMs && config.apiThrottleMs < 0) {
    throw new Error('apiThrottleMs must be non-negative');
  }

  // Validate MCP servers if present
  if (config.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      validateMCPServerConfig(serverName, serverConfig);
    }
  }
}

/**
 * Validate MCP server configuration
 */
function validateMCPServerConfig(name: string, config: any): void {
  if (!config.command && !config.url && !config.httpUrl) {
    throw new Error(`MCP server '${name}' must specify either command, url, or httpUrl`);
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
    throw new Error(`MCP server '${name}' timeout must be between 1000ms and 300000ms`);
  }

  if (config.command && config.args && !Array.isArray(config.args)) {
    throw new Error(`MCP server '${name}' args must be an array`);
  }

  // Validate enhanced configuration for local servers
  if (config.mode === 'local') {
    if (!config.serverConfig) {
      throw new Error(`Local MCP server '${name}' must have serverConfig`);
    }
    
    // Allow built-in servers with httpUrl to skip script validation
    if (!config.serverConfig.script && !config.httpUrl) {
      throw new Error(`Local MCP server '${name}' must specify serverConfig.script or httpUrl for built-in servers`);
    }
    
    if (!config.serverConfig.port || config.serverConfig.port < 1 || config.serverConfig.port > 65535) {
      throw new Error(`Local MCP server '${name}' must specify valid serverConfig.port`);
    }
  }

  // Validate remote server configuration
  if (config.mode === 'remote') {
    if (config.retryAttempts && (config.retryAttempts < 1 || config.retryAttempts > 10)) {
      throw new Error(`Remote MCP server '${name}' retryAttempts must be between 1 and 10`);
    }
  }
}

/**
 * Create a default .jasper/settings.json file
 */
export function createDefaultJasperConfig(targetDir: string = process.cwd()): string {
  const jasperDir = path.join(targetDir, '.jasper');
  const configPath = path.join(jasperDir, 'settings.json');

  // Create .jasper directory if it doesn't exist
  if (!fs.existsSync(jasperDir)) {
    fs.mkdirSync(jasperDir, { recursive: true });
  }

  // Don't overwrite existing config
  if (fs.existsSync(configPath)) {
    throw new Error(`Configuration already exists at: ${configPath}`);
  }

  const defaultConfig: JasperConfig = {
    llmProvider: 'google-ai',
    model: 'gemini-2.5-flash-lite',
    maxIterations: 10,
    tokenLimit: 10000,
    apiThrottleMs: 3000,
    mcpServers: {
      'local-development': {
        mode: 'local',
        autoStart: true,
        httpUrl: 'http://localhost:8081/mcp/tools',
        description: 'Local development services',
        trust: true,
        timeout: 30000,
        serverConfig: {
          script: '../../../mcp-servers/service-management/src/index.ts',
          port: 8081,
          env: {
            NODE_ENV: 'development',
            LOG_LEVEL: 'info'
          }
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    },
    serviceDefinitions: {
      'example-service': {
        mcpServer: 'local-development',
        config: {
          name: 'example-service',
          type: 'process',
          command: 'echo',
          args: ['Hello from Jasper service management!'],
          healthCheck: {
            command: 'echo "healthy"',
            interval: 30
          },
          autoRestart: false
        },
        deployment: {
          environment: 'local'
        }
      }
    },
    deploymentProfiles: {
      'basic-dev': {
        description: 'Basic development setup',
        services: ['example-service'],
        parallel: false,
        autoStart: false
      }
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  return configPath;
}

/**
 * Get list of available configuration files
 */
export function getAvailableConfigs(targetDir: string = process.cwd()): Array<{
  name: string;
  path: string;
  type: 'jasper-folder' | 'project-root';
}> {
  const configs: Array<{ name: string; path: string; type: 'jasper-folder' | 'project-root' }> = [];

  // Check for .jasper/settings.json
  const jasperConfigPath = path.join(targetDir, '.jasper', 'settings.json');
  if (fs.existsSync(jasperConfigPath)) {
    configs.push({
      name: 'settings.json',
      path: jasperConfigPath,
      type: 'jasper-folder',
    });
  }

  // Check for jasper.config.json in project root
  const projectConfigPath = path.join(targetDir, 'jasper.config.json');
  if (fs.existsSync(projectConfigPath)) {
    configs.push({
      name: 'jasper.config.json',
      path: projectConfigPath,
      type: 'project-root',
    });
  }

  return configs;
}

/**
 * Parse command line arguments for config file
 */
export function parseConfigFromArgs(args: string[]): string | undefined {
  const configIndex = args.findIndex(arg => arg === '--config' || arg === '-c');
  
  if (configIndex !== -1 && configIndex + 1 < args.length) {
    return args[configIndex + 1];
  }

  // Also check for --config=path format
  const configArg = args.find(arg => arg.startsWith('--config='));
  if (configArg) {
    return configArg.split('=')[1];
  }

  return undefined;
}

/**
 * Display configuration information
 */
export function displayConfigInfo(result: ConfigLoadResult): void {
  console.log('\n📋 Configuration Information:');
  console.log(`   Source: ${result.source}`);
  if (result.path) {
    console.log(`   Path: ${result.path}`);
  }
  console.log(`   LLM Provider: ${result.config.llmProvider}`);
  console.log(`   Model: ${result.config.model || 'default'}`);
  console.log(`   Max Iterations: ${result.config.maxIterations}`);
  console.log(`   Token Limit: ${result.config.tokenLimit}`);
  
  if (result.config.mcpServers) {
    const serverCount = Object.keys(result.config.mcpServers).length;
    console.log(`   MCP Servers: ${serverCount} configured`);
    
    for (const [name, config] of Object.entries(result.config.mcpServers)) {
      const transport = config.httpUrl ? 'HTTP' : config.url ? 'SSE' : 'Stdio';
      console.log(`     - ${name} (${transport})`);
    }
  } else {
    console.log('   MCP Servers: None configured');
  }
  console.log('');
}