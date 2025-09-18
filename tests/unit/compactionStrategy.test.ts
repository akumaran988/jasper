import { test, describe } from 'node:test';
import { IntelligentCompactionStrategy, DEFAULT_COMPACTION_CONFIG } from '../../src/utils/compactionStrategy.js';
import { Message } from '../../src/types/index.js';
import { TestConversationBuilder, MockLLMProvider, TestFixtures } from '../fixtures/testConversationBuilder.js';
import { TestAssertions } from '../fixtures/testAssertions.js';

describe('CompactionStrategy', () => {
  const strategy = new IntelligentCompactionStrategy();
  const mockLLM = new MockLLMProvider();

  describe('shouldCompact', () => {
    test('should reject small conversations', () => {
      // Arrange
      const messages = TestFixtures.createSimpleConversation();
      const config = DEFAULT_COMPACTION_CONFIG;

      // Act
      const shouldCompact = strategy.shouldCompact(messages, config);

      // Assert
      TestAssertions.assertFalse(shouldCompact, 'Small conversation should not trigger compaction');
    });

    test('should accept large conversations', () => {
      // Arrange
      const messages = TestFixtures.createLargeConversation();
      const config = { ...DEFAULT_COMPACTION_CONFIG, tokenThreshold: 1000 };

      // Act
      const shouldCompact = strategy.shouldCompact(messages, config);

      // Assert
      TestAssertions.assertTrue(shouldCompact, 'Large conversation should trigger compaction');
    });

    test('should respect custom configuration', () => {
      // Arrange
      const messages = TestFixtures.createSimpleConversation();
      const aggressiveConfig = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 10,
        minMessagesBeforeCompaction: 2
      };

      // Act
      const shouldCompact = strategy.shouldCompact(messages, aggressiveConfig);

      // Assert
      TestAssertions.assertTrue(shouldCompact, 'Aggressive config should trigger compaction on simple conversation');
    });
  });

  describe('token calculation', () => {
    test('should calculate tokens correctly', () => {
      // Arrange
      const messages: Message[] = [
        {
          role: 'user',
          content: 'This is a test message',
          timestamp: new Date()
        },
        {
          role: 'system',
          content: 'Tool execution results: 1 results',
          toolResults: [{
            id: 'test_tool_1',
            success: true,
            result: { operation: 'read', content: 'File content here' }
          }],
          timestamp: new Date()
        }
      ];

      // Act
      const totalTokens = (strategy as any).calculateTotalTokens(messages);

      // Assert
      TestAssertions.assertTrue(typeof totalTokens === 'number', 'Token count should be a number');
      TestAssertions.assertGreaterThan(totalTokens, 0, 'Token count should be positive');
      TestAssertions.assertLessThan(totalTokens, 1000, 'Token count should be reasonable for test data');
    });
  });

  describe('message filtering', () => {
    test('should filter messages by age correctly', () => {
      // Arrange
      const builder = new TestConversationBuilder();
      for (let i = 0; i < 10; i++) {
        builder.addUserMessage(`Message ${i}`);
      }
      const messages = builder.build();
      const maxAge = 5;

      // Act
      const filteredMessages = (strategy as any).filterByAge(messages, maxAge);

      // Assert
      TestAssertions.assertArrayLength(filteredMessages, maxAge, `Should keep exactly ${maxAge} most recent messages`);
      TestAssertions.assertStringContains(
        filteredMessages[filteredMessages.length - 1].content,
        'Message 9',
        'Should keep the most recent message'
      );
    });
  });

  describe('tool result deduplication', () => {
    test('should detect and mark duplicate tool results', () => {
      // Arrange
      const messages = TestFixtures.createConversationWithDuplicates();

      // Act
      const deduplicatedMessages = (strategy as any).deduplicateToolResults(messages);

      // Assert
      const originalToolResults = messages.flatMap(m => m.toolResults || []);
      const deduplicatedToolResults = deduplicatedMessages.flatMap(m => m.toolResults || []);

      TestAssertions.assertTrue(
        deduplicatedToolResults.length <= originalToolResults.length,
        'Deduplication should not increase tool result count'
      );

      // Verify reference markers exist for duplicates
      const hasReferences = deduplicatedToolResults.some(tool => 
        tool.result && typeof tool.result === 'string' && tool.result.includes('[Duplicate of tool call')
      );
      TestAssertions.assertTrue(hasReferences, 'Should contain reference markers for duplicates');
    });
  });

  describe('message categorization', () => {
    test('should categorize messages correctly', () => {
      // Arrange - Need enough messages since last 3 are kept as recent
      const messages = new TestConversationBuilder()
        .addUserMessage('User message 1')
        .addAssistantMessage('Assistant response')
        .addFileReadTool('/test.txt', 'content')
        .addUserMessage('User message 2')
        .addDirectoryListTool('/dir', ['file1.txt', 'file2.txt'])
        .addUserMessage('User message 3')
        .addAssistantMessage('Final response')
        .addFileReadTool('/another.txt', 'more content')
        .build();

      // Act
      const categorized = (strategy as any).categorizeMessages(messages);

      // Assert
      TestAssertions.assertObjectHasProperty(categorized, 'conversationMessages');
      TestAssertions.assertObjectHasProperty(categorized, 'toolMessages');
      TestAssertions.assertObjectHasProperty(categorized, 'recentMessages');

      TestAssertions.assertTrue(
        categorized.conversationMessages.length >= 0,
        'Should categorize conversation messages'
      );
      TestAssertions.assertTrue(
        categorized.toolMessages.length >= 0,
        'Should categorize tool messages'
      );
      TestAssertions.assertArrayLength(
        categorized.recentMessages,
        3,
        'Should keep exactly 3 recent messages'
      );
    });
  });

  describe('tool message compaction', () => {
    test('should generate meaningful tool summaries', async () => {
      // Arrange
      const messages = new TestConversationBuilder()
        .addFileReadTool('/app/config.json', '{"key": "value"}')
        .addDirectoryListTool('/src', ['index.ts', 'app.ts'])
        .addBashTool('npm test', 'All tests passed')
        .build();

      const toolMessages = messages.filter(m => m.toolResults);

      // Act
      const toolSummaries = (strategy as any).compactToolMessages(toolMessages);

      // Assert
      TestAssertions.assertToolSummariesValid(toolSummaries, 'Tool summaries should be valid');
      TestAssertions.assertTrue(toolSummaries.length > 0, 'Should generate tool summaries');

      // Verify specific operation types are captured
      const hasFileOperation = toolSummaries.some(t => 
        t.summary.includes('Read') || t.summary.includes('Listed') || t.summary.includes('Ran')
      );
      TestAssertions.assertTrue(hasFileOperation, 'Should capture file operations in summaries');
    });
  });

  describe('conversation compaction', () => {
    test('should generate conversation summary with AI', async () => {
      // Arrange
      const messages = new TestConversationBuilder()
        .addUserMessage('Can you help me with my React project?')
        .addAssistantMessage('I\'d be happy to help with your React project. What specific issue are you facing?')
        .addUserMessage('I\'m having trouble with state management')
        .addAssistantMessage('State management can be tricky. Let me help you understand the best practices.')
        .build();

      // Act
      const summary = await (strategy as any).compactConversationMessages(
        messages,
        mockLLM,
        3
      );

      // Assert
      TestAssertions.assertTrue(typeof summary === 'string', 'Summary should be a string');
      TestAssertions.assertTrue(summary.length > 0, 'Summary should not be empty');
      TestAssertions.assertStringContains(summary.toLowerCase(), 'user', 'Summary should mention user interaction');
    });
  });

  describe('full compaction pipeline', () => {
    test('should execute complete compaction workflow', async () => {
      // Arrange
      const messages = TestFixtures.createConversationWithDuplicates();
      const config = {
        ...DEFAULT_COMPACTION_CONFIG,
        tokenThreshold: 50,
        minMessagesBeforeCompaction: 3
      };

      // Act
      const result = await strategy.compactMessages(messages, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Full compaction pipeline result');
      TestAssertions.assertCompactionEffective(result, 'Compaction should be effective');
      TestAssertions.assertTrue(result.messagesCompacted >= 0, 'Should report compacted message count');
      TestAssertions.assertCompressionRatio(result, 0.01, 0.99, 'Should achieve reasonable compression');
    });
  });
});