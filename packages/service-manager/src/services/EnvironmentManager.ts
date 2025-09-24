/**
 * Environment Variable Management for Cross-Environment Deployments
 *
 * This module handles dynamic environment variable copying and merging
 * for scenarios like "run local service with staging database config"
 */

import type { ServiceConfig } from '../types.js';

export interface EnvironmentProfile {
  name: string;
  description: string;
  variables: Record<string, string>;
  services?: Record<string, ServiceConfig>;
}

export interface EnvMergeStrategy {
  strategy: 'replace' | 'merge' | 'prefer_source' | 'prefer_target';
  conflictResolution?: 'source' | 'target' | 'prompt';
}

export class EnvironmentManager {
  private environments: Map<string, EnvironmentProfile> = new Map();

  constructor() {
    this.initializeDefaultEnvironments();
  }

  /**
   * Initialize with predefined environments from service definitions
   */
  private initializeDefaultEnvironments(): void {
    // Local environment
    this.environments.set('local', {
      name: 'local',
      description: 'Local development environment',
      variables: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DATABASE_URL: 'postgresql://localhost:5432/dev',
        REDIS_URL: 'redis://localhost:6379',
        API_PORT: '3000',
      }
    });

    // Staging environment
    this.environments.set('staging', {
      name: 'staging',
      description: 'Staging environment',
      variables: {
        NODE_ENV: 'staging',
        LOG_LEVEL: 'info',
        DATABASE_URL: '${STAGING_DATABASE_URL}',
        REDIS_URL: '${STAGING_REDIS_URL}',
        API_PORT: '8000',
        API_KEY: '${STAGING_API_KEY}',
      }
    });

    // Production environment
    this.environments.set('production', {
      name: 'production',
      description: 'Production environment',
      variables: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'error',
        DATABASE_URL: '${PROD_DATABASE_URL}',
        REDIS_URL: '${PROD_REDIS_URL}',
        API_PORT: '443',
        API_KEY: '${PROD_API_KEY}',
      }
    });
  }

  /**
   * Register a new environment profile
   */
  addEnvironment(profile: EnvironmentProfile): void {
    this.environments.set(profile.name, profile);
  }

  /**
   * Get all available environments
   */
  getEnvironments(): EnvironmentProfile[] {
    return Array.from(this.environments.values());
  }

  /**
   * Get a specific environment profile
   */
  getEnvironment(name: string): EnvironmentProfile | undefined {
    return this.environments.get(name);
  }

  /**
   * Extract relevant environment variables from a source environment
   * based on service type and AI analysis
   */
  extractRelevantEnvVars(
    sourceEnv: string,
    targetService: ServiceConfig,
    categories?: string[]
  ): Record<string, string> {
    const source = this.environments.get(sourceEnv);
    if (!source) {
      throw new Error(`Source environment '${sourceEnv}' not found`);
    }

    const extracted: Record<string, string> = {};
    const serviceType = this.inferServiceType(targetService);

    // Default categories if not specified
    if (!categories) {
      categories = this.getRelevantCategories(serviceType);
    }

    // Extract variables by category
    for (const [key, value] of Object.entries(source.variables)) {
      if (this.matchesCategories(key, categories)) {
        extracted[key] = value;
      }
    }

    return extracted;
  }

  /**
   * Merge environment variables from source into target service config
   */
  mergeEnvironmentVars(
    targetService: ServiceConfig,
    sourceEnvVars: Record<string, string>,
    strategy: EnvMergeStrategy = { strategy: 'merge' }
  ): ServiceConfig {
    const mergedConfig = { ...targetService };

    switch (strategy.strategy) {
      case 'replace':
        mergedConfig.env = { ...sourceEnvVars };
        break;

      case 'merge':
        mergedConfig.env = {
          ...targetService.env,
          ...sourceEnvVars
        };
        break;

      case 'prefer_source':
        mergedConfig.env = {
          ...sourceEnvVars,
          ...targetService.env
        };
        break;

      case 'prefer_target':
        mergedConfig.env = {
          ...targetService.env,
          ...sourceEnvVars
        };
        break;
    }

    return mergedConfig;
  }

  /**
   * Smart environment variable analysis for AI prompts
   */
  analyzeEnvironmentRequest(userRequest: string): {
    sourceEnv?: string;
    targetEnv?: string;
    serviceType?: string;
    categories: string[];
    confidence: number;
  } {
    const request = userRequest.toLowerCase();
    const analysis = {
      sourceEnv: undefined as string | undefined,
      targetEnv: undefined as string | undefined,
      serviceType: undefined as string | undefined,
      categories: [] as string[],
      confidence: 0
    };

    // Detect source environment
    if (request.includes('staging')) {
      analysis.sourceEnv = 'staging';
      analysis.confidence += 0.3;
    } else if (request.includes('production') || request.includes('prod')) {
      analysis.sourceEnv = 'production';
      analysis.confidence += 0.3;
    }

    // Detect target environment
    if (request.includes('local')) {
      analysis.targetEnv = 'local';
      analysis.confidence += 0.2;
    }

    // Detect service type
    if (request.includes('database') || request.includes('postgres') || request.includes('mysql')) {
      analysis.serviceType = 'database';
      analysis.categories.push('database');
      analysis.confidence += 0.2;
    }

    if (request.includes('redis') || request.includes('cache')) {
      analysis.serviceType = 'cache';
      analysis.categories.push('cache');
      analysis.confidence += 0.2;
    }

    if (request.includes('api') || request.includes('server')) {
      analysis.serviceType = 'api';
      analysis.categories.push('api', 'auth');
      analysis.confidence += 0.2;
    }

    // Add authentication if mentioned
    if (request.includes('auth') || request.includes('key') || request.includes('token')) {
      analysis.categories.push('auth');
      analysis.confidence += 0.1;
    }

    return analysis;
  }

  /**
   * Create a deployment recommendation based on user intent
   */
  createDeploymentRecommendation(userRequest: string): {
    recommendation: string;
    sourceEnv: string;
    targetEnv: string;
    envVars: Record<string, string>;
    warnings: string[];
  } {
    const analysis = this.analyzeEnvironmentRequest(userRequest);
    const warnings: string[] = [];

    if (!analysis.sourceEnv) {
      throw new Error('Could not determine source environment from request');
    }

    const sourceEnv = analysis.sourceEnv;
    const targetEnv = analysis.targetEnv || 'local';

    // Extract relevant environment variables
    const dummyService: ServiceConfig = {
      name: 'temp',
      type: 'docker',
      env: {}
    };

    const envVars = this.extractRelevantEnvVars(
      sourceEnv,
      dummyService,
      analysis.categories
    );

    // Check for variables that need secrets
    for (const [key, value] of Object.entries(envVars)) {
      if (value.includes('${') && value.includes('}')) {
        warnings.push(`Variable ${key} requires secret: ${value}`);
      }
    }

    const recommendation = `Run service locally using ${sourceEnv} environment configuration. ` +
      `This will use ${sourceEnv} database connections and API keys.`;

    return {
      recommendation,
      sourceEnv,
      targetEnv,
      envVars,
      warnings
    };
  }

  /**
   * Infer service type from configuration
   */
  private inferServiceType(service: ServiceConfig): string {
    if (service.image) {
      const image = service.image.toLowerCase();
      if (image.includes('postgres') || image.includes('mysql')) return 'database';
      if (image.includes('redis')) return 'cache';
      if (image.includes('nginx')) return 'proxy';
    }

    if (service.command) {
      const command = service.command.toLowerCase();
      if (command.includes('npm') || command.includes('node')) return 'api';
    }

    return 'generic';
  }

  /**
   * Get relevant environment variable categories for a service type
   */
  private getRelevantCategories(serviceType: string): string[] {
    const categoryMap: Record<string, string[]> = {
      'database': ['database', 'auth'],
      'cache': ['cache', 'redis'],
      'api': ['api', 'database', 'cache', 'auth'],
      'proxy': ['proxy', 'ssl'],
      'generic': ['database', 'cache', 'auth']
    };

    return categoryMap[serviceType] || categoryMap['generic'];
  }

  /**
   * Check if an environment variable key matches any of the given categories
   */
  private matchesCategories(key: string, categories: string[]): boolean {
    const keyLower = key.toLowerCase();

    const patterns: Record<string, RegExp[]> = {
      database: [/database/i, /db_/i, /postgres/i, /mysql/i, /_url.*db/i],
      cache: [/redis/i, /cache/i],
      auth: [/api_key/i, /token/i, /auth/i, /secret/i, /jwt/i],
      api: [/api_/i, /port/i, /host/i, /base_url/i],
      proxy: [/proxy/i, /nginx/i],
      ssl: [/ssl/i, /cert/i, /tls/i]
    };

    for (const category of categories) {
      const categoryPatterns = patterns[category] || [];
      for (const pattern of categoryPatterns) {
        if (pattern.test(keyLower)) {
          return true;
        }
      }
    }

    return false;
  }
}