import { test, describe } from 'node:test';
import { IntelligentCompactionStrategy, DEFAULT_COMPACTION_CONFIG } from '../../src/utils/compactionStrategy.js';
import { TestConversationBuilder, MockLLMProvider } from '../fixtures/testConversationBuilder.js';
import { TestAssertions } from '../fixtures/testAssertions.js';

describe('Massive Real-World Conversations', () => {
  const strategy = new IntelligentCompactionStrategy();
  const mockLLM = new MockLLMProvider([
    'Extended development session with comprehensive project analysis and implementation across multiple components.',
    'Large-scale refactoring and optimization work with extensive file operations, testing, and documentation updates.',
    'Complex debugging session involving multiple modules, configuration files, and dependency management tasks.',
    'Full-stack development workflow including frontend components, backend services, database operations, and deployment tasks.'
  ]);

  describe('extensive development workflow', () => {
    test('should handle 200+ message conversation with comprehensive tool usage', async () => {
      // Arrange - Create massive realistic development session
      const builder = new TestConversationBuilder();
      
      // Initial project setup phase
      builder
        .addUserMessage('Help me build a complete task management application with React, Node.js, and MongoDB')
        .addAssistantMessage('I\'ll help you build a comprehensive task management application. Let\'s start by examining the project structure.');
      
      // Project structure analysis
      builder.addDirectoryListTool('/', ['src/', 'server/', 'package.json', 'README.md', '.gitignore']);
      builder.addFileReadTool('/package.json', '{"name": "task-manager", "scripts": {"dev": "vite", "build": "vite build"}}');
      builder.addDirectoryListTool('/src', ['components/', 'pages/', 'hooks/', 'utils/', 'styles/', 'App.tsx']);
      builder.addDirectoryListTool('/server', ['routes/', 'models/', 'middleware/', 'config/', 'app.js']);
      
      // Frontend development phase - Components
      builder.addAssistantMessage('Let\'s start with the frontend components. I\'ll examine the existing structure.');
      for (let i = 1; i <= 12; i++) {
        builder
          .addUserMessage(`Create TaskCard component for displaying individual tasks`)
          .addAssistantMessage(`I'll create the TaskCard component. Let me check existing components first.`)
          .addDirectoryListTool(`/src/components`, [`TaskList.tsx`, `TaskForm.tsx`, `Header.tsx`, `Sidebar.tsx`])
          .addFileReadTool(`/src/components/TaskCard.tsx`, `import React from 'react';\n\ninterface TaskCardProps {\n  id: string;\n  title: string;\n  completed: boolean;\n}\n\nexport const TaskCard: React.FC<TaskCardProps> = ({ id, title, completed }) => {\n  return (\n    <div className="task-card">\n      <h3>{title}</h3>\n      <span>{completed ? 'Done' : 'Pending'}</span>\n    </div>\n  );\n};`)
          .addAssistantMessage(`TaskCard component looks good. Let me check for any optimization opportunities.`)
          .addBashTool('npm run lint', `ESLint checking...\nAll files passed linting checks.`)
          .addBashTool('npm run type-check', `TypeScript compilation...\nNo type errors found.`);
      }
      
      // Backend development phase - API routes
      builder.addAssistantMessage('Now let\'s work on the backend API. I\'ll examine the server structure.');
      for (let i = 1; i <= 15; i++) {
        builder
          .addUserMessage(`Implement CRUD operations for tasks in the backend`)
          .addAssistantMessage(`I'll implement the task CRUD operations. Let me check the existing routes.`)
          .addDirectoryListTool(`/server/routes`, [`tasks.js`, `users.js`, `auth.js`])
          .addFileReadTool(`/server/routes/tasks.js`, `const express = require('express');\nconst Task = require('../models/Task');\nconst router = express.Router();\n\nrouter.get('/', async (req, res) => {\n  try {\n    const tasks = await Task.find();\n    res.json(tasks);\n  } catch (error) {\n    res.status(500).json({ error: error.message });\n  }\n});\n\nmodule.exports = router;`)
          .addFileReadTool(`/server/models/Task.js`, `const mongoose = require('mongoose');\n\nconst taskSchema = new mongoose.Schema({\n  title: { type: String, required: true },\n  description: String,\n  completed: { type: Boolean, default: false },\n  createdAt: { type: Date, default: Date.now }\n});\n\nmodule.exports = mongoose.model('Task', taskSchema);`)
          .addAssistantMessage(`The task model and routes look well structured. Let me run some tests.`)
          .addBashTool('npm test', `Running API tests...\n✓ GET /api/tasks\n✓ POST /api/tasks\n✓ PUT /api/tasks/:id\n✓ DELETE /api/tasks/:id\nAll tests passed.`)
          .addBashTool('npm run test:coverage', `Test coverage report:\nStatements: 92%\nBranches: 88%\nFunctions: 95%\nLines: 91%`);
      }
      
      // Database operations and configuration
      for (let i = 1; i <= 8; i++) {
        builder
          .addUserMessage(`Set up MongoDB connection and database configuration`)
          .addAssistantMessage(`I'll configure the MongoDB connection. Let me check the config files.`)
          .addDirectoryListTool(`/server/config`, [`database.js`, `env.js`, `middleware.js`])
          .addFileReadTool(`/server/config/database.js`, `const mongoose = require('mongoose');\n\nconst connectDB = async () => {\n  try {\n    await mongoose.connect(process.env.MONGODB_URI);\n    console.log('MongoDB connected successfully');\n  } catch (error) {\n    console.error('MongoDB connection error:', error);\n    process.exit(1);\n  }\n};\n\nmodule.exports = connectDB;`)
          .addFileReadTool(`/server/.env.example`, `MONGODB_URI=mongodb://localhost:27017/taskmanager\nJWT_SECRET=your_jwt_secret_here\nPORT=5000`)
          .addBashTool('npm run db:migrate', `Running database migrations...\nMigration completed successfully.`)
          .addBashTool('npm run db:seed', `Seeding database...\nAdded 50 sample tasks\nDatabase seeding completed.`);
      }
      
      // Frontend-Backend integration
      for (let i = 1; i <= 10; i++) {
        builder
          .addUserMessage(`Connect frontend to backend API`)
          .addAssistantMessage(`I'll set up the API integration. Let me check the frontend API layer.`)
          .addDirectoryListTool(`/src/utils`, [`api.ts`, `constants.ts`, `helpers.ts`])
          .addFileReadTool(`/src/utils/api.ts`, `const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';\n\nclass ApiService {\n  async getTasks() {\n    const response = await fetch(API_BASE_URL + '/tasks');\n    return response.json();\n  }\n\n  async createTask(task: any) {\n    const response = await fetch(API_BASE_URL + '/tasks', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify(task)\n    });\n    return response.json();\n  }\n}\n\nexport default new ApiService();`)
          .addFileReadTool(`/src/hooks/useTasks.ts`, `import { useState, useEffect } from 'react';\nimport ApiService from '../utils/api';\n\nexport const useTasks = () => {\n  const [tasks, setTasks] = useState([]);\n  const [loading, setLoading] = useState(true);\n\n  useEffect(() => {\n    const fetchTasks = async () => {\n      try {\n        const data = await ApiService.getTasks();\n        setTasks(data);\n      } catch (error) {\n        console.error('Error fetching tasks:', error);\n      } finally {\n        setLoading(false);\n      }\n    };\n\n    fetchTasks();\n  }, []);\n\n  return { tasks, loading };\n};`)
          .addBashTool('npm run build', `Building production bundle...\nBundle size: 245KB (optimized)\nBuild completed successfully.`);
      }
      
      // Testing and debugging phase
      for (let i = 1; i <= 12; i++) {
        builder
          .addUserMessage(`Run comprehensive tests and fix any issues`)
          .addAssistantMessage(`I'll run the test suite and analyze any issues.`)
          .addBashTool('npm run test:unit', `Running unit tests...\n✓ TaskCard component renders correctly\n✓ useTasks hook fetches data\n✓ API service handles errors\n23 tests passed, 0 failed`)
          .addBashTool('npm run test:integration', `Running integration tests...\n✓ Task creation flow\n✓ Task update workflow\n✓ Task deletion process\n15 integration tests passed`)
          .addBashTool('npm run test:e2e', `Running end-to-end tests...\n✓ User can create tasks\n✓ User can mark tasks as complete\n✓ User can delete tasks\n8 e2e tests passed`)
          .addFileReadTool(`/server/logs/app.log`, `2024-01-15 10:30:22 INFO: Server started on port 5000\n2024-01-15 10:30:25 INFO: MongoDB connected successfully\n2024-01-15 10:31:15 ERROR: Task validation failed\n2024-01-15 10:31:20 INFO: Task created successfully`)
          .addAssistantMessage(`Found a validation error in the logs. Let me investigate.`)
          .addFileReadTool(`/server/middleware/validation.js`, `const { body, validationResult } = require('express-validator');\n\nconst validateTask = [\n  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),\n  body('description').optional().isLength({ max: 500 }),\n  (req, res, next) => {\n    const errors = validationResult(req);\n    if (!errors.isEmpty()) {\n      return res.status(400).json({ errors: errors.array() });\n    }\n    next();\n  }\n];\n\nmodule.exports = { validateTask };`)
          .addBashTool('npm run fix:lint', `Running auto-fix for linting issues...\nFixed 3 formatting issues\nLinting completed successfully.`);
      }
      
      // Performance optimization phase  
      for (let i = 1; i <= 8; i++) {
        builder
          .addUserMessage(`Optimize application performance`)
          .addAssistantMessage(`I'll analyze and optimize performance. Let me check current metrics.`)
          .addBashTool('npm run analyze', `Bundle analyzer results:\nLargest chunks:\n- main.js: 180KB\n- vendor.js: 65KB\n- React: 45KB\nTotal bundle size: 290KB`)
          .addFileReadTool(`/webpack.config.js`, `const path = require('path');\n\nmodule.exports = {\n  optimization: {\n    splitChunks: {\n      chunks: 'all',\n      cacheGroups: {\n        vendor: {\n          test: /[\\\\/]node_modules[\\\\/]/,\n          name: 'vendors',\n          chunks: 'all',\n        }\n      }\n    }\n  }\n};`)
          .addBashTool('npm run lighthouse', `Performance audit:\nPerformance Score: 92/100\nAccessibility: 98/100\nBest Practices: 95/100\nSEO: 100/100`)
          .addBashTool('npm run monitor', `Performance monitoring:\nAvg Response Time: 120ms\nMemory Usage: 45MB\nCPU Usage: 12%\nActive Connections: 23`);
      }
      
      // Deployment and final verification
      for (let i = 1; i <= 6; i++) {
        builder
          .addUserMessage(`Deploy application and verify everything works`)
          .addAssistantMessage(`I'll handle the deployment process. Let me check deployment configs.`)
          .addDirectoryListTool(`/deployment`, [`docker-compose.yml`, `Dockerfile`, `nginx.conf`])
          .addFileReadTool(`/Dockerfile`, `FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 5000\nCMD ["npm", "start"]`)
          .addFileReadTool(`/docker-compose.yml`, `version: '3.8'\nservices:\n  app:\n    build: .\n    ports:\n      - "5000:5000"\n    environment:\n      - MONGODB_URI=mongodb://mongo:27017/taskmanager\n  mongo:\n    image: mongo:5\n    ports:\n      - "27017:27017"`)
          .addBashTool('docker-compose up -d', `Building and starting services...\nService 'app' started successfully\nService 'mongo' started successfully\nApplication available at http://localhost:5000`)
          .addBashTool('curl -f http://localhost:5000/health', `{"status":"healthy","uptime":125,"timestamp":"2024-01-15T10:45:30.123Z"}`)
          .addAssistantMessage(`Deployment successful! Application is running and all health checks pass.`);
      }
      
      // Final wrap-up
      builder.addUserMessage('Thank you for building this comprehensive task management application!')
        .addAssistantMessage('You\'re welcome! We\'ve successfully built a full-stack task management application with React frontend, Node.js backend, MongoDB database, comprehensive testing, performance optimization, and containerized deployment. The application is production-ready and follows best practices.');

      const messages = builder.build();
      console.log(`Created conversation with ${messages.length} messages`);

      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 5000,
        maxMessageAge: 150,
        minMessagesBeforeCompaction: 20,
        conversationCompactionEnabled: true,
        toolResultDeduplicationEnabled: true
      };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Massive conversation compaction');
      TestAssertions.assertLessThan(executionTime, 15000, 'Should complete massive compaction within 15 seconds');
      TestAssertions.assertTrue(messages.length >= 200, 'Should have created 200+ messages');
      
      // Verify comprehensive compaction
      TestAssertions.assertCompressionRatio(result, 0.5, 0.99, 'Massive conversation should achieve 50-99% compression');
      TestAssertions.assertTrue(
        result.toolSummaries.length >= 30,
        'Should capture at least 30 tool operations from massive conversation'
      );
      
      // Verify different types of tool operations are captured
      const fileOperations = result.toolSummaries.filter(t => t.summary.includes('Read'));
      const directoryOperations = result.toolSummaries.filter(t => t.summary.includes('Listed'));
      const commandOperations = result.toolSummaries.filter(t => t.summary.includes('Ran'));
      
      TestAssertions.assertTrue(fileOperations.length >= 5, 'Should capture multiple file operations');
      TestAssertions.assertTrue(directoryOperations.length >= 2, 'Should capture multiple directory operations');
      TestAssertions.assertTrue(commandOperations.length >= 5, 'Should capture multiple command operations');
      
      // Verify conversation summary captures the essence
      TestAssertions.assertTrue(
        result.summary.length >= 50,
        'Should generate comprehensive summary for massive conversation'
      );
      TestAssertions.assertStringContains(
        result.summary.toLowerCase(),
        'development',
        'Summary should mention development work'
      );
      
      // Verify significant compaction occurred
      TestAssertions.assertTrue(
        result.messagesCompacted >= 100,
        'Should have compacted at least 100 messages from massive conversation'
      );
      
      console.log(`Compaction results:
        - Original messages: ${messages.length}
        - Messages compacted: ${result.messagesCompacted}
        - Tool summaries: ${result.toolSummaries.length}
        - Original tokens: ${result.originalTokens}
        - Compacted tokens: ${result.compactedTokens}
        - Compression ratio: ${((1 - result.compactedTokens / result.originalTokens) * 100).toFixed(1)}%
        - Execution time: ${executionTime}ms`);
    });

    test('should handle extreme conversation with 300+ messages and handle deduplication', async () => {
      // Arrange - Create extreme conversation with lots of duplicates
      const builder = new TestConversationBuilder();
      
      builder
        .addUserMessage('Help me analyze and refactor a large legacy codebase')
        .addAssistantMessage('I\'ll help you analyze and refactor the legacy codebase systematically.');

      // Create 300+ messages with intentional duplicates for deduplication testing
      for (let phase = 0; phase < 5; phase++) {
        for (let i = 0; i < 60; i++) {
          builder
            .addUserMessage(`Please examine module ${i + 1} in phase ${phase + 1}`)
            .addAssistantMessage(`I'll examine module ${i + 1}. Let me check the code structure.`);
          
          // Intentionally read the same files multiple times to test deduplication
          if (i % 10 === 0) {
            builder.addFileReadTool('/src/config.js', 'module.exports = { apiUrl: "http://localhost:3000" };');
          }
          if (i % 8 === 0) {
            builder.addFileReadTool('/src/utils.js', 'function helper() { return "utility function"; }');
          }
          if (i % 5 === 0) {
            builder.addDirectoryListTool('/src', ['components/', 'utils/', 'config/', 'tests/']);
          }
          
          builder.addFileReadTool(`/src/module${i + 1}.js`, `// Module ${i + 1}\nfunction module${i + 1}() {\n  return "Module ${i + 1} functionality";\n}\nmodule.exports = module${i + 1};`);
          
          if (i % 7 === 0) {
            builder.addBashTool('npm run lint', `ESLint found ${Math.floor(Math.random() * 5)} issues in module ${i + 1}`);
          }
          if (i % 12 === 0) {
            builder.addBashTool('npm test', `Running tests for module ${i + 1}...\nTests passed: ${Math.floor(Math.random() * 10) + 5}`);
          }
        }
      }
      
      builder.addAssistantMessage('Completed comprehensive analysis and refactoring of the legacy codebase. All modules have been examined and optimized.');

      const messages = builder.build();
      console.log(`Created extreme conversation with ${messages.length} messages`);

      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 8000,
        maxMessageAge: 200,
        minMessagesBeforeCompaction: 50,
        conversationCompactionEnabled: true,
        toolResultDeduplicationEnabled: true
      };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Extreme conversation compaction');
      TestAssertions.assertLessThan(executionTime, 20000, 'Should complete extreme compaction within 20 seconds');
      TestAssertions.assertTrue(messages.length >= 300, 'Should have created 300+ messages');
      
      // Verify extreme compaction efficiency
      TestAssertions.assertCompressionRatio(result, 0.7, 0.98, 'Extreme conversation should achieve 70-98% compression due to deduplication');
      TestAssertions.assertTrue(
        result.toolSummaries.length >= 20,
        'Should capture significant tool operations despite deduplication'
      );
      
      // Verify deduplication worked effectively
      const uniqueFileReads = new Set(result.toolSummaries.filter(t => t.summary.includes('Read')).map(t => t.summary));
      const uniqueDirLists = new Set(result.toolSummaries.filter(t => t.summary.includes('Listed')).map(t => t.summary));
      
      TestAssertions.assertTrue(
        uniqueFileReads.size >= 5,
        'Should have unique file reads despite duplicates'
      );
      TestAssertions.assertTrue(
        uniqueDirLists.size >= 1,
        'Should have unique directory listings despite duplicates'
      );
      
      // Verify massive compaction occurred
      TestAssertions.assertTrue(
        result.messagesCompacted >= 100,
        'Should have compacted at least 100 messages from extreme conversation'
      );
      
      console.log(`Extreme compaction results:
        - Original messages: ${messages.length}
        - Messages compacted: ${result.messagesCompacted}
        - Tool summaries: ${result.toolSummaries.length}
        - Original tokens: ${result.originalTokens}
        - Compacted tokens: ${result.compactedTokens}
        - Compression ratio: ${((1 - result.compactedTokens / result.originalTokens) * 100).toFixed(1)}%
        - Execution time: ${executionTime}ms`);
    });
  });
});