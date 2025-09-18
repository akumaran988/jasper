import { test, describe } from 'node:test';
import { IntelligentCompactionStrategy, DEFAULT_COMPACTION_CONFIG } from '../../src/utils/compactionStrategy.js';
import { Message, ToolResult } from '../../src/types/index.js';
import { TestConversationBuilder, MockLLMProvider } from '../fixtures/testConversationBuilder.js';
import { TestAssertions } from '../fixtures/testAssertions.js';

describe('CompactionStrategy Edge Cases', () => {
  const strategy = new IntelligentCompactionStrategy();
  const mockLLM = new MockLLMProvider();

  describe('empty and minimal inputs', () => {
    test('should handle empty conversation', async () => {
      // Arrange
      const messages: Message[] = [];
      const config = DEFAULT_COMPACTION_CONFIG;

      // Act
      const shouldCompact = strategy.shouldCompact(messages, config);
      const result = await strategy.compactMessages(messages, mockLLM, config);

      // Assert
      TestAssertions.assertFalse(shouldCompact, 'Empty conversation should not trigger compaction');
      TestAssertions.assertCompactionResultValid(result, 'Empty conversation compaction');
      TestAssertions.assertEqual(result.messagesCompacted, 0, 'No messages should be compacted');
      TestAssertions.assertEqual(result.originalTokens, 0, 'Original tokens should be 0');
    });

    test('should handle single message', async () => {
      // Arrange
      const messages: Message[] = [{
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      }];
      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        minMessagesBeforeCompaction: 1, 
        tokenThreshold: 1 
      };

      // Act
      const result = await strategy.compactMessages(messages, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Single message compaction');
      TestAssertions.assertTrue(result.messagesCompacted >= 0, 'Should handle single message gracefully');
    });
  });

  describe('malformed data handling', () => {
    test('should handle malformed tool results', async () => {
      // Arrange
      const malformedToolResults: ToolResult[] = [
        {
          id: '',
          success: true,
          result: null
        },
        {
          id: 'invalid_tool',
          success: false,
          result: undefined,
          error: undefined
        }
      ];

      const messages: Message[] = [{
        role: 'system',
        content: 'Tool execution results: 2 results',
        toolResults: malformedToolResults,
        timestamp: new Date()
      }];

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 10, 
        minMessagesBeforeCompaction: 1 
      };

      // Act & Assert - Should not throw
      const result = await strategy.compactMessages(messages, mockLLM, config);
      TestAssertions.assertCompactionResultValid(result, 'Malformed tool results compaction');
    });

    test('should handle circular references', async () => {
      // Arrange
      const circularObject: any = { name: 'circular' };
      circularObject.self = circularObject;

      const toolResult: ToolResult = {
        id: 'circular_test',
        success: true,
        result: circularObject
      };

      const messages: Message[] = [{
        role: 'system',
        content: 'Tool execution results: 1 results',
        toolResults: [toolResult],
        timestamp: new Date()
      }];

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 10, 
        minMessagesBeforeCompaction: 1 
      };

      // Act & Assert - Should not throw or hang
      const result = await strategy.compactMessages(messages, mockLLM, config);
      TestAssertions.assertCompactionResultValid(result, 'Circular references compaction');
    });

    test('should handle null and undefined values', async () => {
      // Arrange
      const messages: Message[] = [
        {
          role: 'user',
          content: '',
          timestamp: new Date()
        },
        {
          role: 'assistant',
          content: null as any,
          timestamp: new Date()
        },
        {
          role: 'system',
          content: undefined as any,
          timestamp: new Date()
        }
      ];

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 1, 
        minMessagesBeforeCompaction: 1 
      };

      // Act & Assert - Should not throw
      const result = await strategy.compactMessages(messages, mockLLM, config);
      TestAssertions.assertCompactionResultValid(result, 'Null/undefined values compaction');
    });
  });

  describe('extreme configurations', () => {
    test('should handle zero token threshold', async () => {
      // Arrange
      const messages = new TestConversationBuilder()
        .addUserMessage('Test')
        .addAssistantMessage('Response')
        .build();

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 0, 
        minMessagesBeforeCompaction: 0 
      };

      // Act
      const shouldCompact = strategy.shouldCompact(messages, config);
      const result = await strategy.compactMessages(messages, mockLLM, config);

      // Assert
      TestAssertions.assertTrue(shouldCompact, 'Zero threshold should always trigger compaction');
      TestAssertions.assertCompactionResultValid(result, 'Zero threshold compaction');
    });

    test('should handle negative configuration values', async () => {
      // Arrange
      const messages = new TestConversationBuilder()
        .addUserMessage('Test message')
        .build();

      const negativeConfig = {
        maxMessageAge: -1,
        toolResultDeduplicationEnabled: true,
        conversationCompactionEnabled: true,
        maxCompactionIterations: -5,
        tokenThreshold: -100,
        minMessagesBeforeCompaction: -10
      };

      // Act & Assert - Should handle gracefully without throwing
      const shouldCompact = strategy.shouldCompact(messages, negativeConfig);
      const result = await strategy.compactMessages(messages, mockLLM, negativeConfig);

      TestAssertions.assertCompactionResultValid(result, 'Negative configuration compaction');
      TestAssertions.assertTrue(typeof shouldCompact === 'boolean', 'Should return boolean for shouldCompact');
    });
  });

  describe('error handling', () => {
    test('should handle LLM provider failure gracefully', async () => {
      // Arrange
      const failingLLM = {
        name: 'failing-llm',
        async generateResponse(): Promise<any> {
          throw new Error('LLM service unavailable');
        }
      };

      const messages = new TestConversationBuilder()
        .addUserMessage('Help me with coding')
        .addAssistantMessage('I\'ll help you with coding')
        .build();

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 10, 
        minMessagesBeforeCompaction: 1,
        conversationCompactionEnabled: true
      };

      // Act
      const result = await strategy.compactMessages(messages, failingLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'LLM failure compaction');
      TestAssertions.assertTrue(typeof result.summary === 'string', 'Should return valid summary even when LLM fails');
    });

    test('should handle extremely long content', async () => {
      // Arrange
      const longContent = 'A'.repeat(10000); // 10KB content
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Please process this large content',
          timestamp: new Date()
        },
        {
          role: 'system',
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
      const startTime = Date.now();
      const result = await strategy.compactMessages(messages, mockLLM, config);
      const executionTime = Date.now() - startTime;

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Large content compaction');
      TestAssertions.assertLessThan(executionTime, 10000, 'Should complete within 10 seconds');
      TestAssertions.assertCompactionEffective(result, 'Should compress large content effectively');
    });
  });

  describe('unicode and special characters', () => {
    test('should handle unicode and special characters', async () => {
      // Arrange
      const unicodeContent = '🚀 Testing with emojis: áéíóú, 中文, русский, العربية';
      const specialChars = '~!@#$%^&*()_+-=[]{}|;:",./<>?`';

      const messages: Message[] = [
        {
          role: 'user',
          content: `Help with ${unicodeContent}`,
          timestamp: new Date()
        },
        {
          role: 'assistant',
          content: `Processing: ${specialChars}`,
          timestamp: new Date()
        },
        {
          role: 'system',
          content: 'Tool execution results: 1 results',
          toolResults: [{
            id: 'unicode_test',
            success: true,
            result: {
              content: `${unicodeContent}${specialChars}`,
              encoding: 'utf-8'
            }
          }],
          timestamp: new Date()
        }
      ];

      const config = { 
        ...DEFAULT_COMPACTION_CONFIG, 
        tokenThreshold: 10, 
        minMessagesBeforeCompaction: 1 
      };

      // Act
      const result = await strategy.compactMessages(messages, mockLLM, config);

      // Assert
      TestAssertions.assertCompactionResultValid(result, 'Unicode and special characters compaction');
      TestAssertions.assertTrue(typeof result.summary === 'string', 'Should handle Unicode gracefully');
      TestAssertions.assertTrue(Array.isArray(result.toolSummaries), 'Should handle special chars in tool summaries');
    });
  });
});