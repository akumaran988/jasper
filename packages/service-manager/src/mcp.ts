/**
 * MCP (Model Context Protocol) tools and definitions for service-manager
 * This file contains the MCP-specific logic that should be used by the generic MCP server launcher
 */

// Import real service manager with Docker support instead of simplified version
import { ServiceManager } from './services/ServiceManager';
import { DockerServiceProvider } from './services/DockerServiceProvider';
import { ProcessServiceProvider } from './services/ProcessServiceProvider';
import { LoggerService } from './services/LoggerService';
import { HealthCheckService } from './services/HealthCheckService';
import { InMemoryServiceRepository } from './services/InMemoryServiceRepository';
import { EnvironmentManager } from './services/EnvironmentManager';

/**
 * MCP Tool definitions for service-manager
 */
export const MCP_TOOLS = [
  {
    name: 'create_service',
    description: 'Create a new service (process or Docker container) AI_PROMPT: USE FOR EXPLICIT CREATE REQUESTS: "create redis", "create a postgres service", "make a new API server". This ONLY creates, does NOT start. For "start" requests, use deploy_service instead.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Service name' },
        type: { type: 'string', enum: ['process', 'docker'], description: 'Service type' },
        command: { type: 'string', description: 'Command to run (for process services)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        workingDir: { type: 'string', description: 'Working directory' },
        env: { type: 'object', description: 'Environment variables' },
        image: { type: 'string', description: 'Docker image (for docker services)' },
        ports: { type: 'object', description: 'Port mappings' },
        autoRestart: { type: 'boolean', description: 'Enable auto-restart' }
      },
      required: ['name', 'type']
    }
  },
  {
    name: 'start_service',
    description: 'Start a service',
    inputSchema: {
      type: 'object',
      properties: { serviceId: { type: 'string', description: 'Service ID' } },
      required: ['serviceId']
    }
  },
  {
    name: 'stop_service',
    description: 'Stop a service',
    inputSchema: {
      type: 'object',
      properties: { serviceId: { type: 'string', description: 'Service ID' } },
      required: ['serviceId']
    }
  },
  {
    name: 'restart_service',
    description: 'Restart a service',
    inputSchema: {
      type: 'object',
      properties: { serviceId: { type: 'string', description: 'Service ID' } },
      required: ['serviceId']
    }
  },
  {
    name: 'list_services',
    description: 'List currently RUNNING services (may be empty if no services are started yet). Use list_service_definitions to see what CAN be deployed.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_service',
    description: 'Get service details',
    inputSchema: {
      type: 'object',
      properties: { serviceId: { type: 'string', description: 'Service ID' } },
      required: ['serviceId']
    }
  },
  {
    name: 'remove_service',
    description: 'Remove a service',
    inputSchema: {
      type: 'object',
      properties: { serviceId: { type: 'string', description: 'Service ID' } },
      required: ['serviceId']
    }
  },
  {
    name: 'get_manager_stats',
    description: 'Get service manager statistics',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_environments',
    description: 'List available deployment environments and their capabilities (local, staging, production)',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_service_definitions',
    description: 'List AVAILABLE service templates that can be deployed (API server, databases, etc.) - USE THIS to show what services are available AI_PROMPT: WHEN TO USE: When user asks "what services can you manage?", "what can you deploy?", "what\'s available?" PRIORITY: Call this FIRST before creating services to check for existing templates. INTELLIGENCE: If user wants a service and template exists, mention it and offer to deploy with the template.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_full_status',
    description: 'Get comprehensive status of ALL services across ALL servers (local-development AND local-databases) - USE THIS for complete overview',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'deploy_service',
    description: 'Standard service deployment with default local config AI_PROMPT: USE THIS ONLY for simple local deployment like "start redis", "start postgres", "run database" without any cross-environment settings. For cross-environment requests like "Redis with staging config" or "postgres with production settings", use deploy_cross_environment instead.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', description: 'Service name or type (e.g., "redis", "postgres", "api")' },
        environment: { type: 'string', enum: ['local', 'staging', 'production'], description: 'Target environment', default: 'local' }
      },
      required: ['serviceName']
    }
  },
  {
    name: 'deploy_cross_environment',
    description: 'Deploy service in one environment using configuration from another environment AI_PROMPT: ALWAYS USE THIS for cross-environment requests like "start Redis locally with staging settings", "run API with production database", "deploy locally with staging config". This is THE PRIMARY TOOL for cross-environment deployment - it intelligently copies environment variables and deploys services.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', description: 'Service type (e.g., "redis", "postgres", "api", "mysql")' },
        userRequest: { type: 'string', description: 'User\'s original request for AI analysis (e.g., "start redis locally with staging settings")' },
        sourceEnvironment: { type: 'string', enum: ['local', 'staging', 'production'], description: 'Environment to copy variables FROM (optional if userRequest provided)' },
        targetEnvironment: { type: 'string', enum: ['local', 'staging', 'production'], description: 'Environment to deploy TO (optional if userRequest provided)', default: 'local' }
      },
      required: ['serviceName']
    }
  },
  {
    name: 'analyze_environment_request',
    description: 'Analyze user request for cross-environment deployment and provide recommendations AI_PROMPT: USE THIS when user mentions mixing environments like "local with staging database" or "production config locally"',
    inputSchema: {
      type: 'object',
      properties: {
        userRequest: { type: 'string', description: 'The user\'s natural language request about environment deployment' }
      },
      required: ['userRequest']
    }
  },
  {
    name: 'list_environment_variables',
    description: 'List available environment variables for different environments',
    inputSchema: {
      type: 'object',
      properties: {
        environment: { type: 'string', enum: ['local', 'staging', 'production'], description: 'Environment to list variables for' },
        category: { type: 'string', description: 'Filter by category (database, cache, auth, api)' }
      }
    }
  },
  {
    name: 'compare_environments',
    description: 'Compare environment variables between two environments to show differences',
    inputSchema: {
      type: 'object',
      properties: {
        sourceEnv: { type: 'string', enum: ['local', 'staging', 'production'], description: 'First environment to compare' },
        targetEnv: { type: 'string', enum: ['local', 'staging', 'production'], description: 'Second environment to compare' },
        category: { type: 'string', description: 'Filter comparison by category (database, cache, auth, api)' }
      },
      required: ['sourceEnv', 'targetEnv']
    }
  }
];

/**
 * Create MCP tool handlers for service-manager
 * This function returns the actual tool implementations
 */
export function createMCPToolHandlers() {
  // Initialize real service manager with Docker support
  const repository = new InMemoryServiceRepository();
  const logger = new LoggerService();
  const healthChecker = new HealthCheckService(logger);
  const dockerProvider = new DockerServiceProvider(logger);
  const processProvider = new ProcessServiceProvider(logger);

  const serviceManager = new ServiceManager(
    repository,
    logger,
    healthChecker,
    [dockerProvider, processProvider]
  );

  // Initialize environment manager
  const environmentManager = new EnvironmentManager();

  // Debug: Check what providers are registered
  console.log('🔍 DEBUG: Available providers:', {
    docker: dockerProvider.type,
    process: processProvider.type
  });

  return {
    'create_service': async (params: any) => {
      return await serviceManager.createService(params);
    },
    'start_service': async (params: any) => {
      console.log('🔍 DEBUG: Starting service:', params.serviceId);
      const service = await serviceManager.getService(params.serviceId);
      console.log('🔍 DEBUG: Service config:', service?.config);

      await serviceManager.startService(params.serviceId);

      const updatedService = await serviceManager.getService(params.serviceId);
      console.log('🔍 DEBUG: Service after start:', {
        status: updatedService?.status,
        pid: updatedService?.pid,
        containerId: updatedService?.containerId
      });

      return { success: true, message: `Started service ${params.serviceId}` };
    },
    'stop_service': async (params: any) => {
      await serviceManager.stopService(params.serviceId);
      return { success: true, message: `Stopped service ${params.serviceId}` };
    },
    'restart_service': async (params: any) => {
      await serviceManager.stopService(params.serviceId);
      await serviceManager.startService(params.serviceId);
      return { success: true, message: `Restarted service ${params.serviceId}` };
    },
    'list_services': async () => {
      return await serviceManager.getAllServices();
    },
    'get_service': async (params: any) => {
      return await serviceManager.getService(params.serviceId);
    },
    'remove_service': async (params: any) => {
      await serviceManager.removeService(params.serviceId);
      return { success: true, message: `Removed service ${params.serviceId}` };
    },
    'get_manager_stats': async () => {
      return await serviceManager.getManagerStats();
    },
    'list_environments': async () => {
      return {
        summary: "I can manage services across 3 environments: LOCAL (ready), STAGING (needs API key), PRODUCTION (needs API key)",
        environments: [
          {
            name: 'local',
            description: 'Local development environment - FULLY AVAILABLE',
            capabilities: ['docker', 'process'],
            available: true,
            status: 'Connected and ready',
            servers: [
              'local-development (port 8081) - for API servers and processes',
              'local-databases (port 8082) - for databases and caches'
            ],
            notes: 'Both servers are running and can deploy services immediately'
          },
          {
            name: 'staging',
            description: 'Staging environment - REQUIRES API KEY',
            capabilities: ['docker', 'kubernetes'],
            available: false,
            status: 'Not connected - missing STAGING_MCP_API_KEY',
            servers: ['staging-environment (remote)'],
            notes: 'Set STAGING_MCP_API_KEY environment variable to connect'
          },
          {
            name: 'production',
            description: 'Production environment - REQUIRES API KEY',
            capabilities: ['docker', 'kubernetes', 'managed-services'],
            available: false,
            status: 'Not connected - missing PROD_MCP_API_KEY',
            servers: ['production-services (remote)'],
            notes: 'Set PROD_MCP_API_KEY environment variable to connect'
          }
        ]
      };
    },
    'list_service_definitions': async () => {
      return {
        summary: "I can deploy 5 predefined service templates across local, staging, and production environments",
        available_now: [
          "✅ local-api-server (Node.js API)",
          "✅ local-postgres (PostgreSQL database)", 
          "✅ local-redis (Redis cache)"
        ],
        requires_api_keys: [
          "🔑 staging-api (needs STAGING_MCP_API_KEY)",
          "🔑 production-api (needs PROD_MCP_API_KEY)"
        ],
        serviceDefinitions: [
          {
            name: 'local-api-server',
            description: 'Node.js API server for local development - READY TO DEPLOY',
            environment: 'local',
            type: 'process',
            ports: ['3000'],
            status: 'Available immediately',
            command: 'npm run dev',
            workingDir: './backend/api'
          },
          {
            name: 'local-postgres', 
            description: 'PostgreSQL database for local development - READY TO DEPLOY',
            environment: 'local',
            type: 'docker',
            ports: ['5432'],
            status: 'Available immediately',
            image: 'postgres:15-alpine',
            database: 'dev'
          },
          {
            name: 'local-redis',
            description: 'Redis cache for local development - READY TO DEPLOY', 
            environment: 'local',
            type: 'docker',
            ports: ['6379'],
            status: 'Available immediately',
            image: 'redis:7-alpine'
          },
          {
            name: 'staging-api',
            description: 'API server in staging environment - REQUIRES API KEY',
            environment: 'staging',
            type: 'docker',
            ports: ['8000'],
            status: 'Requires STAGING_MCP_API_KEY to deploy',
            image: 'my-app:staging'
          },
          {
            name: 'production-api',
            description: 'Production API server with load balancing - REQUIRES API KEY',
            environment: 'production', 
            type: 'kubernetes',
            ports: ['443', '80'],
            status: 'Requires PROD_MCP_API_KEY to deploy',
            deployment: 'Kubernetes with load balancer'
          }
        ]
      };
    },
    'get_full_status': async () => {
      // Get services from current manager
      const currentServices = await serviceManager.getAllServices();
      
      return {
        summary: "COMPREHENSIVE SERVICE STATUS ACROSS ALL ENVIRONMENTS",
        servers: {
          "local-development (port 8081)": {
            status: "Connected",
            purpose: "API servers and processes",
            services: currentServices.length > 0 ? currentServices : "No services running"
          },
          "local-databases (port 8082)": {
            status: "Should be connected",
            purpose: "Databases and caches", 
            services: "Check this server separately for database services"
          },
          "staging-environment": {
            status: "Disconnected",
            purpose: "Staging deployments",
            reason: "Missing STAGING_MCP_API_KEY"
          },
          "production-services": {
            status: "Disconnected", 
            purpose: "Production deployments",
            reason: "Missing PROD_MCP_API_KEY"
          }
        },
        current_services: currentServices,
        available_actions: [
          "🚀 Deploy local-api-server (Node.js process)",
          "🐘 Deploy local-postgres (PostgreSQL Docker)",
          "🔴 Deploy local-redis (Redis Docker)",
          "⚙️  Create custom service",
          "📊 Check other servers for more services"
        ],
        next_steps: "To see ALL services across servers, jasper-ui should connect to BOTH local-development (8081) AND local-databases (8082)"
      };
    },
    'deploy_service': async (params: any) => {
      const { serviceName } = params;
      
      // Step 1: Check if service already exists
      const existingServices = await serviceManager.getAllServices();
      const existingService = existingServices.find(s => 
        s.config.name.toLowerCase().includes(serviceName.toLowerCase()) ||
        serviceName.toLowerCase().includes(s.config.name.toLowerCase())
      );
      
      if (existingService) {
        // Service exists, just start it
        try {
          await serviceManager.startService(existingService.id);
          return {
            action: 'started_existing',
            serviceId: existingService.id,
            serviceName: existingService.config.name,
            message: `Found existing service '${existingService.config.name}' and started it`,
            status: 'running'
          };
        } catch (error) {
          return {
            action: 'start_failed',
            serviceId: existingService.id,
            serviceName: existingService.config.name,
            message: `Found service '${existingService.config.name}' but failed to start: ${error}`,
            status: 'error'
          };
        }
      }
      
      // Step 2: Service doesn't exist, create from template
      let serviceConfig;
      const lowerServiceName = serviceName.toLowerCase();
      
      if (lowerServiceName.includes('redis')) {
        serviceConfig = {
          name: 'redis-cache',
          type: 'docker' as const,
          image: 'redis:7-alpine',
          ports: { '6379': '6379' },
          volumes: { './data/redis': '/data' },
          args: ['redis-server', '--appendonly', 'yes']
        };
      } else if (lowerServiceName.includes('postgres')) {
        serviceConfig = {
          name: 'postgres-db',
          type: 'docker' as const,
          image: 'postgres:15-alpine',
          ports: { '5432': '5432' },
          env: {
            'POSTGRES_DB': 'dev',
            'POSTGRES_USER': 'developer',
            'POSTGRES_PASSWORD': 'devpass'
          }
        };
      } else if (lowerServiceName.includes('mysql')) {
        serviceConfig = {
          name: 'mysql-db',
          type: 'docker' as const,
          image: 'mysql:8.0',
          ports: { '3306': '3306' },
          env: {
            'MYSQL_ROOT_PASSWORD': 'root',
            'MYSQL_DATABASE': 'dev'
          }
        };
      } else if (lowerServiceName.includes('api')) {
        serviceConfig = {
          name: 'api-server',
          type: 'process' as const,
          command: 'npm',
          args: ['run', 'dev'],
          workingDir: './',
          env: {
            'NODE_ENV': 'development',
            'PORT': '3000'
          }
        };
      } else {
        return {
          action: 'template_not_found',
          serviceName,
          message: `No template found for '${serviceName}'. Available: redis, postgres, mysql, api. Use create_service for custom services.`,
          available_templates: ['redis', 'postgres', 'mysql', 'api']
        };
      }
      
      try {
        // Create the service
        const serviceId = await serviceManager.createService(serviceConfig);
        
        // Start the service
        await serviceManager.startService(serviceId);
        
        return {
          action: 'created_and_started',
          serviceId,
          serviceName: serviceConfig.name,
          message: `Created and started new '${serviceConfig.name}' service from template`,
          status: 'running',
          config: serviceConfig
        };
      } catch (error) {
        return {
          action: 'deploy_failed',
          serviceName,
          message: `Failed to deploy service: ${error}`,
          status: 'error'
        };
      }
    },
    'deploy_cross_environment': async (params: any) => {
      const { serviceName, userRequest, sourceEnvironment, targetEnvironment } = params;

      // Initialize environment manager
      const envManager = new EnvironmentManager();

      try {
        // If userRequest is provided, analyze it to understand intent
        let analysis;
        if (userRequest) {
          analysis = envManager.analyzeEnvironmentRequest(userRequest);

          // Create deployment recommendation based on analysis
          const recommendation = envManager.createDeploymentRecommendation(userRequest);

          // Use recommendation details if sourceEnvironment/targetEnvironment not explicitly provided
          const sourceEnv = sourceEnvironment || recommendation.sourceEnv;
          const targetEnv = targetEnvironment || recommendation.targetEnv;

          // Find matching service definition from user's existing services or use generic template
          let serviceConfig;
          const existingServices = await serviceManager.getAllServices();
          const matchingService = existingServices.find(s =>
            s.config.name.toLowerCase().includes(serviceName.toLowerCase()) ||
            serviceName.toLowerCase().includes(s.config.name.toLowerCase())
          );

          if (matchingService) {
            // Use existing service as template
            serviceConfig = {
              ...matchingService.config,
              name: `${matchingService.config.name}-${sourceEnv}-config`,
              env: matchingService.config.env || {}
            };
          } else {
            // Fallback to generic templates
            const lowerServiceName = serviceName.toLowerCase();
            if (lowerServiceName.includes('redis')) {
              serviceConfig = {
                name: `redis-${sourceEnv}-config`,
                type: 'docker' as const,
                image: 'redis:7-alpine',
                ports: { '6379': '6379' },
                volumes: { './data/redis': '/data' },
                args: ['redis-server', '--appendonly', 'yes'],
                env: {}
              };
            } else if (lowerServiceName.includes('postgres')) {
              serviceConfig = {
                name: `postgres-${sourceEnv}-config`,
                type: 'docker' as const,
                image: 'postgres:15-alpine',
                ports: { '5432': '5432' },
                env: {
                  'POSTGRES_DB': 'dev',
                  'POSTGRES_USER': 'developer',
                  'POSTGRES_PASSWORD': 'devpass'
                }
              };
            } else {
              return {
                action: 'unsupported_service',
                serviceName,
                message: `No existing service found matching '${serviceName}' and no generic template available. Please create the service first or use a supported service type.`,
                recommendation: recommendation.recommendation,
                warnings: recommendation.warnings
              };
            }
          }

          // Extract relevant environment variables from source environment
          const relevantEnvVars = envManager.extractRelevantEnvVars(sourceEnv, serviceConfig, analysis.categories);

          // Merge environment variables with the service config
          const mergedConfig = envManager.mergeEnvironmentVars(serviceConfig, relevantEnvVars, { strategy: 'merge' });

          // Create the service with merged config
          const serviceId = await serviceManager.createService(mergedConfig);

          // Start the service
          await serviceManager.startService(serviceId);

          return {
            action: 'cross_environment_deployed',
            serviceId,
            serviceName: mergedConfig.name,
            sourceEnvironment: sourceEnv,
            targetEnvironment: targetEnv,
            message: `Successfully deployed '${mergedConfig.name}' locally using ${sourceEnv} environment configuration`,
            recommendation: recommendation.recommendation,
            appliedEnvVars: relevantEnvVars,
            warnings: recommendation.warnings,
            status: 'running',
            config: mergedConfig
          };
        } else {
          // Direct environment variable copying without AI analysis
          const sourceEnv = sourceEnvironment || 'staging';
          const targetEnv = targetEnvironment || 'local';

          // Find existing service or use generic fallback
          let serviceConfig;
          const existingServices = await serviceManager.getAllServices();
          const matchingService = existingServices.find(s =>
            s.config.name.toLowerCase().includes(serviceName.toLowerCase()) ||
            serviceName.toLowerCase().includes(s.config.name.toLowerCase())
          );

          if (matchingService) {
            // Use existing service as template
            serviceConfig = {
              ...matchingService.config,
              name: `${matchingService.config.name}-${sourceEnv}-direct`,
              env: matchingService.config.env || {}
            };
          } else {
            return {
              action: 'service_not_found',
              serviceName,
              message: `No service found matching '${serviceName}'. Available services: ${existingServices.map(s => s.config.name).join(', ') || 'none'}. Please create the service first or use deploy_service for templates.`
            };
          }

          // Extract environment variables
          const relevantEnvVars = envManager.extractRelevantEnvVars(sourceEnv, serviceConfig);

          // Merge and deploy
          const mergedConfig = envManager.mergeEnvironmentVars(serviceConfig, relevantEnvVars, { strategy: 'merge' });
          const serviceId = await serviceManager.createService(mergedConfig);
          await serviceManager.startService(serviceId);

          return {
            action: 'cross_environment_deployed',
            serviceId,
            serviceName: mergedConfig.name,
            sourceEnvironment: sourceEnv,
            targetEnvironment: targetEnv,
            message: `Deployed '${serviceName}' with ${sourceEnv} environment configuration`,
            appliedEnvVars: relevantEnvVars,
            status: 'running'
          };
        }
      } catch (error) {
        return {
          action: 'cross_environment_deploy_failed',
          serviceName,
          message: `Failed to deploy cross-environment service: ${error}`,
          status: 'error'
        };
      }
    },
    'analyze_environment_request': async (params: any) => {
      const { userRequest } = params;
      const envManager = new EnvironmentManager();

      try {
        const analysis = envManager.analyzeEnvironmentRequest(userRequest);
        const recommendation = envManager.createDeploymentRecommendation(userRequest);

        return {
          analysis,
          recommendation: recommendation.recommendation,
          sourceEnvironment: recommendation.sourceEnv,
          targetEnvironment: recommendation.targetEnv,
          suggestedEnvVars: recommendation.envVars,
          warnings: recommendation.warnings,
          confidence: analysis.confidence
        };
      } catch (error) {
        return {
          error: `Failed to analyze request: ${error}`,
          fallback: 'Please specify source and target environments explicitly'
        };
      }
    },
    'list_environment_variables': async (params: any) => {
      const { environmentName } = params;
      const envManager = new EnvironmentManager();

      try {
        if (environmentName) {
          const env = envManager.getEnvironment(environmentName);
          if (!env) {
            return {
              error: `Environment '${environmentName}' not found`,
              availableEnvironments: envManager.getEnvironments().map(e => e.name)
            };
          }
          return {
            environment: env.name,
            description: env.description,
            variables: env.variables
          };
        } else {
          // List all environments
          const environments = envManager.getEnvironments();
          return {
            availableEnvironments: environments.map(env => ({
              name: env.name,
              description: env.description,
              variableCount: Object.keys(env.variables).length
            }))
          };
        }
      } catch (error) {
        return {
          error: `Failed to list environment variables: ${error}`
        };
      }
    },
    'compare_environments': async (params: any) => {
      const { sourceEnv, targetEnv } = params;
      const envManager = new EnvironmentManager();

      try {
        const source = envManager.getEnvironment(sourceEnv);
        const target = envManager.getEnvironment(targetEnv);

        if (!source || !target) {
          return {
            error: `Environment not found: ${!source ? sourceEnv : targetEnv}`,
            availableEnvironments: envManager.getEnvironments().map(e => e.name)
          };
        }

        const sourceVars = Object.keys(source.variables);
        const targetVars = Object.keys(target.variables);

        const common = sourceVars.filter(key => targetVars.includes(key));
        const sourceOnly = sourceVars.filter(key => !targetVars.includes(key));
        const targetOnly = targetVars.filter(key => !sourceVars.includes(key));

        const differences = common.filter(key => source.variables[key] !== target.variables[key]);

        return {
          sourceEnvironment: sourceEnv,
          targetEnvironment: targetEnv,
          comparison: {
            commonVariables: common.length,
            sourceOnlyVariables: sourceOnly.length,
            targetOnlyVariables: targetOnly.length,
            differentValues: differences.length
          },
          details: {
            common,
            sourceOnly,
            targetOnly,
            differences: differences.map(key => ({
              key,
              sourceValue: source.variables[key],
              targetValue: target.variables[key]
            }))
          }
        };
      } catch (error) {
        return {
          error: `Failed to compare environments: ${error}`
        };
      }
    }
  };
}

/**
 * MCP Server Info for service-manager
 */
export const MCP_SERVER_INFO = {
  name: 'Service Manager',
  description: 'Manage processes and Docker containers',
  version: '1.0.0'
};