import { test, describe } from 'node:test';
import { IntelligentCompactionStrategy, DEFAULT_COMPACTION_CONFIG } from '../../src/utils/compactionStrategy.js';
import { TestConversationBuilder, MockLLMProvider, TestFixtures } from '../fixtures/testConversationBuilder.js';
import { TestAssertions } from '../fixtures/testAssertions.js';

describe('Realistic Jasper Conversations', () => {
  const strategy = new IntelligentCompactionStrategy();
  const mockLLM = new MockLLMProvider([
    'User needed help debugging TypeScript errors. I examined the project files, identified missing type definitions, and fixed the compilation issues.',
    'User requested code review for React components. I analyzed the component structure, suggested improvements for performance and maintainability.',
    'User wanted to implement new features. I reviewed the requirements, examined existing code, and provided step-by-step implementation guidance.'
  ]);

  describe('debugging workflow', () => {
    test('should handle TypeScript debugging session', async () => {
      // Arrange - Simulate realistic debugging conversation
      const conversation = TestFixtures.createRealisticJasperConversation();
      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 1000,
        minMessagesBeforeCompaction: 5,
        conversationCompactionEnabled: true
      };

      // Act
      const result = await strategy.compactMessages(conversation, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'TypeScript debugging session');
      TestAssertions.assertCompactionEffective(result, 'Debugging session should compact effectively');
      
      // Verify debugging context is preserved
      TestAssertions.assertStringContains(
        result.summary.toLowerCase(),
        'user',
        'Summary should mention user interaction'
      );

      // Verify tool operations are captured
      const fileOperations = result.toolSummaries.filter(t => 
        t.summary.includes('Read') || t.summary.includes('Listed')
      );
      TestAssertions.assertTrue(
        fileOperations.length > 0,
        'Should capture file operations from debugging workflow'
      );
    });
  });

  describe('code review workflow', () => {
    test('should handle comprehensive code review session', async () => {
      // Arrange - Create realistic code review conversation
      const codeReviewConversation = new TestConversationBuilder()
        .addUserMessage('Please review my new React component for performance issues')
        .addAssistantMessage('I\'ll review your React component. Let me examine the structure.')
        .addDirectoryListTool('/src/components', ['UserList.tsx', 'UserCard.tsx', 'utils.ts'])
        .addFileReadTool('/src/components/UserList.tsx', 
          'import React, { useState, useEffect } from "react";\n' +
          'const UserList = () => {\n' +
          '  const [users, setUsers] = useState([]);\n' +
          '  return <div>{users.map(user => <div key={user.id}>{user.name}</div>)}</div>;\n' +
          '};'
        )
        .addAssistantMessage('I can see some performance optimization opportunities. Let me check the UserCard component.')
        .addFileReadTool('/src/components/UserCard.tsx',
          'import React from "react";\n' +
          'const UserCard = ({ user, onClick }) => {\n' +
          '  return <div onClick={onClick}>{user.name}</div>;\n' +
          '};'
        )
        .addAssistantMessage('Found several optimization opportunities: 1) Add React.memo, 2) Use useCallback for handlers, 3) Add proper TypeScript types.')
        .addUserMessage('Please help me implement these optimizations')
        .addAssistantMessage('I\'ll help optimize the components with memoization and proper typing.')
        .build();

      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 500,
        minMessagesBeforeCompaction: 4,
        conversationCompactionEnabled: true
      };

      // Act
      const result = await strategy.compactMessages(codeReviewConversation, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Code review workflow');
      TestAssertions.assertCompactionEffective(result, 'Code review should compact effectively');

      // Verify multiple file reads are captured
      const fileReads = result.toolSummaries.filter(t => t.summary.includes('Read'));
      TestAssertions.assertTrue(
        fileReads.length >= 2,
        'Should capture multiple file reads from code review'
      );

      // Verify compression is meaningful for realistic content
      TestAssertions.assertCompressionRatio(result, 0.1, 0.9, 'Code review should achieve 10-90% compression');
    });
  });

  describe('project analysis workflow', () => {
    test('should handle comprehensive project analysis', async () => {
      // Arrange - Simulate thorough project examination
      const analysisConversation = new TestConversationBuilder()
        .addUserMessage('Analyze my React project structure and provide recommendations')
        .addAssistantMessage('I\'ll analyze your project comprehensively. Starting with the overall structure.')
        .addDirectoryListTool('/', ['src/', 'public/', 'package.json', 'tsconfig.json'])
        .addDirectoryListTool('/src', ['components/', 'hooks/', 'utils/', 'App.tsx', 'index.tsx'])
        .addFileReadTool('/package.json', '{"name": "my-app", "dependencies": {"react": "^18.2.0"}}')
        .addFileReadTool('/tsconfig.json', '{"compilerOptions": {"strict": true, "target": "es5"}}')
        .addBashTool('npm run build', 'Build completed successfully. Bundle size: 42KB')
        .addBashTool('npm audit', 'found 0 vulnerabilities')
        .addAssistantMessage('Good project structure! Let me examine your components and architecture.')
        .addDirectoryListTool('/src/components', ['Header/', 'Footer/', 'UserManagement/'])
        .addFileReadTool('/src/App.tsx', 'import React from "react";\nfunction App() { return <div>Hello</div>; }')
        .addAssistantMessage('Excellent! Your project has: ✅ Clean structure ✅ No vulnerabilities ✅ Reasonable bundle size')
        .build();

      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 800,
        minMessagesBeforeCompaction: 6,
        conversationCompactionEnabled: true
      };

      // Act
      const result = await strategy.compactMessages(analysisConversation, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Project analysis workflow');
      TestAssertions.assertCompactionEffective(result, 'Analysis should compact effectively');

      // Verify comprehensive analysis is captured
      const directoryOps = result.toolSummaries.filter(t => t.summary.includes('Listed'));
      const fileOps = result.toolSummaries.filter(t => t.summary.includes('Read'));
      const commandOps = result.toolSummaries.filter(t => t.summary.includes('Ran'));

      TestAssertions.assertTrue(directoryOps.length > 0, 'Should capture directory listings');
      TestAssertions.assertTrue(fileOps.length > 0, 'Should capture file reads');
      TestAssertions.assertTrue(commandOps.length > 0, 'Should capture command executions');

      // Verify all operation types are properly summarized
      TestAssertions.assertArrayLength(
        result.toolSummaries,
        directoryOps.length + fileOps.length + commandOps.length,
        'Should account for all tool operations'
      );
    });
  });

  describe('multi-session workflow', () => {
    test('should handle large development session with many tool calls', async () => {
      // Arrange - Create an extensive development session
      const largeSession = TestFixtures.createLargeConversation();
      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 2000,
        maxMessageAge: 50,
        minMessagesBeforeCompaction: 10,
        conversationCompactionEnabled: true
      };

      // Act
      const result = await strategy.compactMessages(largeSession, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Large development session');
      TestAssertions.assertCompactionEffective(result, 'Large session should compact significantly');

      // Verify significant compression for large sessions
      TestAssertions.assertCompressionRatio(result, 0.3, 0.95, 'Large sessions should achieve 30-95% compression');

      // Verify tool summaries are comprehensive
      TestAssertions.assertTrue(
        result.toolSummaries.length > 5,
        'Large session should have multiple tool operations'
      );

      // Verify message age filtering worked
      TestAssertions.assertTrue(
        result.messagesCompacted > 0,
        'Should have compacted some messages from large session'
      );
    });
  });

  describe('performance requirements', () => {
    test('should handle realistic conversation sizes within performance limits', async () => {
      // Arrange - Create medium-sized realistic conversation
      const mediumConversation = new TestConversationBuilder();
      
      // Simulate 30-message development session
      for (let i = 0; i < 10; i++) {
        mediumConversation
          .addUserMessage(`Help me implement feature ${i + 1}`)
          .addAssistantMessage(`I'll help implement feature ${i + 1}. Let me examine the code.`)
          .addFileReadTool(`/src/feature${i + 1}.ts`, `// Feature ${i + 1} implementation\nexport const feature${i + 1} = () => { return "result"; };`);
      }

      const messages = mediumConversation.build();
      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 1000,
        minMessagesBeforeCompaction: 5,
        conversationCompactionEnabled: true
      };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Medium conversation performance');
      TestAssertions.assertLessThan(executionTime, 5000, 'Should complete within 5 seconds');
      TestAssertions.assertCompressionRatio(result, 0.1, 0.9, 'Should achieve reasonable compression');

      // Verify tool operations are captured (at least the ones not in recent messages)
      TestAssertions.assertTrue(
        result.toolSummaries.length >= 7,
        'Should capture at least 7 tool operations (excluding recent messages)'
      );
    });
  });

  describe('real-world edge cases', () => {
    test('should handle mixed content types in conversation', async () => {
      // Arrange - Mix of different realistic Jasper interactions
      const mixedConversation = new TestConversationBuilder()
        .addUserMessage('Help me debug this error: TypeError: Cannot read property of undefined')
        .addAssistantMessage('I\'ll help debug this error. Let me examine your code.')
        .addFileReadTool('/src/app.js', 'const user = getUser();\nconsole.log(user.name); // Error here')
        .addAssistantMessage('The error occurs because getUser() might return undefined. Let me check the getUser function.')
        .addFileReadTool('/src/utils.js', 'function getUser() {\n  return users.find(u => u.active);\n}')
        .addBashTool('npm run build', 'webpack compiled with warnings\nBundle size: 2.1MB (too large)')
        .addBashTool('npm run analyze', 'Largest modules: lodash (400KB), moment (200KB)')
        .addAssistantMessage('Found the issue! getUser() returns undefined when no active user exists. Let\'s add proper error handling.')
        .addUserMessage('Also, can you help me optimize the bundle size?')
        .addAssistantMessage('I\'ll analyze your bundle. Your bundle is large due to heavy dependencies.')
        .addAssistantMessage('I recommend: 1) Replace moment with date-fns, 2) Use lodash-es with tree shaking.')
        .build();

      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 600,
        minMessagesBeforeCompaction: 4,
        conversationCompactionEnabled: true
      };

      // Act
      const result = await strategy.compactMessages(mixedConversation, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Mixed content conversation');
      TestAssertions.assertCompactionEffective(result, 'Mixed content should compact effectively');

      // Verify different tool types are all captured
      const hasFileReads = result.toolSummaries.some(t => t.summary.includes('Read'));
      const hasCommands = result.toolSummaries.some(t => t.summary.includes('Ran'));
      
      TestAssertions.assertTrue(hasFileReads, 'Should capture file read operations');
      TestAssertions.assertTrue(hasCommands, 'Should capture command executions');

      // Verify conversation context is maintained
      TestAssertions.assertTrue(
        result.summary.length > 10,
        'Should generate meaningful conversation summary'
      );
    });
  });
});