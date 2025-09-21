import { test, describe } from 'node:test';
import { IntelligentCompactionStrategy, DEFAULT_COMPACTION_CONFIG } from '../../src/utils/compactionStrategy.js';
import { TestConversationBuilder, MockLLMProvider } from '../fixtures/testConversationBuilder.js';
import { TestAssertions } from '../fixtures/testAssertions.js';

describe('Compaction Performance', () => {
  const strategy = new IntelligentCompactionStrategy();
  const mockLLM = new MockLLMProvider([
    'User engaged in extensive development work. I provided comprehensive assistance with code analysis, debugging, and optimization across multiple project files.',
    'User worked on a large-scale application. I helped with architecture decisions, performance improvements, and code quality enhancements throughout the session.'
  ]);

  describe('scalability tests', () => {
    test('should handle small conversations efficiently', async () => {
      // Arrange
      const messages = createConversationOfSize(10);
      const config = { ...DEFAULT_COMPACTION_CONFIG, tokenThreshold: 50 };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Small conversation');
      TestAssertions.assertLessThan(executionTime, 1000, 'Small conversation should complete within 1 second');
      TestAssertions.assertCompressionRatio(result, 0.01, 0.99, 'Should achieve some compression');
    });

    test('should handle medium conversations efficiently', async () => {
      // Arrange
      const messages = createConversationOfSize(50);
      const config = { ...DEFAULT_COMPACTION_CONFIG, tokenThreshold: 500 };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Medium conversation');
      TestAssertions.assertLessThan(executionTime, 3000, 'Medium conversation should complete within 3 seconds');
      TestAssertions.assertCompressionRatio(result, 0.2, 0.95, 'Should achieve 20-95% compression');
    });

    test('should handle large conversations efficiently', async () => {
      // Arrange
      const messages = createConversationOfSize(100);
      const config = { ...DEFAULT_COMPACTION_CONFIG, tokenThreshold: 1000 };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Large conversation');
      TestAssertions.assertLessThan(executionTime, 5000, 'Large conversation should complete within 5 seconds');
      TestAssertions.assertCompressionRatio(result, 0.3, 0.95, 'Should achieve 30-95% compression');
      TestAssertions.assertTrue(result.toolSummaries.length > 10, 'Should have many tool summaries');
    });
  });

  describe('deduplication performance', () => {
    test('should efficiently handle conversations with many duplicates', async () => {
      // Arrange - Create conversation with heavy duplicate tool results
      const builder = new TestConversationBuilder();
      const baseContent = 'This is repeated file content for deduplication testing. '.repeat(20);

      builder
        .addUserMessage('Please analyze these files for duplicates')
        .addAssistantMessage('I\'ll analyze the files and identify any duplicates.');

      // Add many duplicate file reads
      for (let i = 0; i < 30; i++) {
        if (i % 5 === 0) {
          // Same file read multiple times
          builder.addFileReadTool('/project/config.json', '{"key": "value", "settings": {"debug": true}}');
        } else if (i % 3 === 0) {
          // Another repeated file
          builder.addFileReadTool('/project/package.json', baseContent);
        } else {
          // Unique files
          builder.addFileReadTool(`/project/file_${i}.txt`, `Content for file ${i}\n${baseContent}`);
        }
      }

      const messages = builder.build();
      const config = { ...DEFAULT_COMPACTION_CONFIG, tokenThreshold: 1000 };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Duplicate-heavy conversation');
      TestAssertions.assertLessThan(executionTime, 10000, 'Deduplication should complete within 10 seconds');
      TestAssertions.assertCompressionRatio(result, 0.4, 0.99, 'Deduplication should achieve 40-99% compression');
    });
  });

  describe('memory efficiency', () => {
    test('should handle large content without excessive memory usage', async () => {
      // Arrange
      const longContent = 'A'.repeat(50000); // 50KB content per message
      const messages = [
        {
          role: 'user' as const,
          content: 'Please process this large content',
          timestamp: new Date()
        },
        {
          role: 'system' as const,
          content: 'Tool execution results: 1 results',
          toolResults: [{
            id: 'large_content_test',
            success: true,
            result: {
              operation: 'read',
              content: longContent
            }
          }],
          timestamp: new Date()
        }
      ];

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 1000, 
        minMessagesBeforeCompaction: 1 
      };

      // Act
      const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;
      const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024; // MB
      const memoryUsed = memoryAfter - memoryBefore;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Large content compaction');
      TestAssertions.assertLessThan(executionTime, 5000, 'Should handle large content within 5 seconds');
      TestAssertions.assertLessThan(memoryUsed, 50, 'Should use less than 50MB additional memory');
      TestAssertions.assertCompactionEffective(result, 'Should compress large content effectively');
    });
  });

  describe('age-based filtering performance', () => {
    test('should efficiently filter messages by age', async () => {
      // Arrange
      const messageCount = 200;
      const ageLimit = 50;
      
      const messages = createConversationOfSize(messageCount);
      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 500,
        maxMessageAge: ageLimit
      };

      // Act
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Age-filtered conversation');
      TestAssertions.assertLessThan(executionTime, 3000, 'Age filtering should be fast');
      
      // Verify age limit effectiveness
      const effectiveMessages = Math.min(messageCount, ageLimit);
      TestAssertions.assertTrue(
        result.messagesCompacted <= effectiveMessages,
        'Should not compact more messages than age limit allows'
      );
    });
  });
});

// Helper function to create conversations of specific sizes
function createConversationOfSize(messageCount: number) {
  const builder = new TestConversationBuilder();
  
  // Add initial user message
  builder
    .addUserMessage('Help me with a development project')
    .addAssistantMessage('I\'ll help you with your development project. Let me examine your codebase.');

  // Add many messages in a realistic pattern
  for (let i = 0; i < messageCount - 2; i++) {
    const messageType = i % 4;
    
    switch (messageType) {
      case 0:
        builder.addUserMessage(`Please examine component ${i + 1}`);
        break;
      case 1:
        builder.addAssistantMessage(`Examining component ${i + 1}. Let me read the file.`);
        break;
      case 2:
        builder.addFileReadTool(
          `/project/src/component${i + 1}.ts`,
          `// Component ${i + 1}\nexport const Component${i + 1} = () => {\n  return "component ${i + 1}";\n};\n\nexport default Component${i + 1};`
        );
        break;
      case 3:
        if (i % 8 === 3) {
          builder.addDirectoryListTool(`/project/dir_${Math.floor(i / 8)}`, [`component${i}.ts`, `component${i + 1}.ts`]);
        } else if (i % 8 === 7) {
          builder.addBashTool('npm test', `Running tests...\nTest suite passed. ${Math.floor(Math.random() * 10)} tests completed.`);
        }
        break;
    }
  }

  return builder.build();
}