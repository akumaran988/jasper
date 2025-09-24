/**
 * EXAMPLE: How jasper-ui now uses service management directly
 * NO MCP server subprocess needed!
 */

import { DirectServiceManager } from './directServiceManager.js';

export async function demonstrateDirectServiceManagement() {
  console.log('\n🎯 JASPER-UI: Direct Service Management (No MCP!)');
  
  // Create direct service manager - NO subprocess!
  const serviceManager = new DirectServiceManager();
  
  // Listen for service events
  serviceManager.on('serviceDeployed', (service) => {
    console.log(`📡 Event: Service deployed - ${service.definition.name}`);
  });
  
  serviceManager.on('serviceStatusChanged', (service) => {
    console.log(`📡 Event: Service status changed - ${service.definition.name}: ${service.status}`);
  });
  
  try {
    // Deploy services directly (no MCP calls!)
    console.log('\n📦 Deploying services directly...');
    
    const apiServiceId = await serviceManager.deployService({
      name: 'api-server',
      config: {
        name: 'api-server',
        type: 'process',
        command: 'npm',
        args: ['run', 'dev'],
        workingDir: './my-api',
        env: {
          NODE_ENV: 'development',
          PORT: '3000'
        },
        autoRestart: true
      }
    });
    
    const dbServiceId = await serviceManager.deployService({
      name: 'postgres-db',
      config: {
        name: 'postgres-db', 
        type: 'docker',
        image: 'postgres:15',
        ports: { '5432': '5432' },
        env: {
          POSTGRES_DB: 'devdb',
          POSTGRES_USER: 'dev',
          POSTGRES_PASSWORD: 'devpass'
        },
        autoRestart: true
      }
    });
    
    // Start services directly (no MCP calls!)
    console.log('\n▶️ Starting services directly...');
    await serviceManager.startService(dbServiceId);
    await serviceManager.startService(apiServiceId);
    
    // Get status directly (no MCP calls!)
    console.log('\n📊 Service Status:');
    const services = serviceManager.listServices();
    services.forEach(service => {
      console.log(`  ${service.definition.name}: ${service.status}`);
    });
    
    const stats = await serviceManager.getManagerStats();
    console.log('\n📈 Manager Stats:', stats);
    
    console.log('\n🎉 SUCCESS: All services running directly!');
    console.log('✅ No MCP server subprocess');
    console.log('✅ Direct function calls');
    console.log('✅ Zero overhead');
    console.log('✅ Same functionality');
    
    return { serviceManager, serviceIds: [apiServiceId, dbServiceId] };
    
  } catch (error) {
    console.error('❌ Error in direct service management:', error);
    throw error;
  }
}

// For demonstration - would be called from main jasper-ui app
export async function runExample() {
  try {
    await demonstrateDirectServiceManagement();
  } catch (error) {
    console.error('Demo failed:', error);
  }
}