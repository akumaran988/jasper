import assert from 'node:assert';
import { CompactionResult } from '../../src/types/index.js';

export class TestAssertions {
  static assertEqual<T>(actual: T, expected: T, message?: string): void {
    assert.strictEqual(actual, expected, message);
  }

  static assertTrue(condition: boolean, message?: string): void {
    assert.ok(condition, message);
  }

  static assertFalse(condition: boolean, message?: string): void {
    assert.ok(!condition, message);
  }

  static assertGreaterThan(actual: number, expected: number, message?: string): void {
    assert.ok(actual > expected, message || `Expected ${actual} to be greater than ${expected}`);
  }

  static assertLessThan(actual: number, expected: number, message?: string): void {
    assert.ok(actual < expected, message || `Expected ${actual} to be less than ${expected}`);
  }

  static assertArrayLength<T>(array: T[], expectedLength: number, message?: string): void {
    assert.strictEqual(array.length, expectedLength, message);
  }

  static assertArrayContains<T>(array: T[], item: T, message?: string): void {
    assert.ok(array.includes(item), message);
  }

  static assertStringContains(str: string, substring: string, message?: string): void {
    assert.ok(str.includes(substring), message);
  }

  static assertStringDoesNotContain(str: string, substring: string, message?: string): void {
    assert.ok(!str.includes(substring), message);
  }

  static assertObjectHasProperty(obj: any, property: string, message?: string): void {
    assert.ok(Object.prototype.hasOwnProperty.call(obj, property), message);
  }

  static assertCompactionResultValid(result: CompactionResult, message?: string): void {
    const prefix = message ? `${message}: ` : '';
    
    // Check all required properties exist
    assert.ok(typeof result === 'object' && result !== null, `${prefix}CompactionResult must be an object`);
    assert.ok(typeof result.summary === 'string', `${prefix}summary must be string`);
    assert.ok(Array.isArray(result.toolSummaries), `${prefix}toolSummaries must be array`);
    assert.ok(typeof result.messagesCompacted === 'number', `${prefix}messagesCompacted must be number`);
    assert.ok(typeof result.originalTokens === 'number', `${prefix}originalTokens must be number`);
    assert.ok(typeof result.compactedTokens === 'number', `${prefix}compactedTokens must be number`);
    assert.ok(result.timestamp instanceof Date, `${prefix}timestamp must be Date`);
    
    // Check value ranges
    assert.ok(result.messagesCompacted >= 0, `${prefix}messagesCompacted must be non-negative`);
    assert.ok(result.originalTokens >= 0, `${prefix}originalTokens must be non-negative`);
    assert.ok(result.compactedTokens >= 0, `${prefix}compactedTokens must be non-negative`);
  }

  static assertCompactionEffective(result: CompactionResult, message?: string): void {
    const prefix = message ? `${message}: ` : '';
    
    TestAssertions.assertCompactionResultValid(result, message);
    assert.ok(
      result.compactedTokens < result.originalTokens, 
      `${prefix}Compaction must reduce tokens: ${result.compactedTokens} should be < ${result.originalTokens}`
    );
    
    // Ensure meaningful compression (at least 1% reduction)
    const compressionRatio = 1 - (result.compactedTokens / result.originalTokens);
    assert.ok(
      compressionRatio > 0.01,
      `${prefix}Compaction must achieve >1% compression, got ${(compressionRatio * 100).toFixed(2)}%`
    );
  }

  static assertToolSummariesValid(toolSummaries: any[], message?: string): void {
    const prefix = message ? `${message}: ` : '';
    
    assert.ok(Array.isArray(toolSummaries), `${prefix}toolSummaries must be array`);
    
    for (let i = 0; i < toolSummaries.length; i++) {
      const tool = toolSummaries[i];
      const toolPrefix = `${prefix}toolSummary[${i}]`;
      
      assert.ok(typeof tool === 'object' && tool !== null, `${toolPrefix} must be object`);
      assert.ok(typeof tool.toolName === 'string' && tool.toolName.length > 0, `${toolPrefix}.toolName must be non-empty string`);
      assert.ok(typeof tool.summary === 'string' && tool.summary.length > 0, `${toolPrefix}.summary must be non-empty string`);
      assert.ok(typeof tool.success === 'boolean', `${toolPrefix}.success must be boolean`);
      
      if (tool.executionTime !== undefined) {
        assert.ok(typeof tool.executionTime === 'number' && tool.executionTime >= 0, `${toolPrefix}.executionTime must be non-negative number`);
      }
    }
  }

  static assertCompressionRatio(result: CompactionResult, minRatio: number, maxRatio: number, message?: string): void {
    const compressionRatio = 1 - (result.compactedTokens / result.originalTokens);
    assert.ok(
      compressionRatio >= minRatio && compressionRatio <= maxRatio,
      `${message || ''} Compression ratio ${(compressionRatio * 100).toFixed(1)}% not in range ${(minRatio * 100).toFixed(1)}%-${(maxRatio * 100).toFixed(1)}%`
    );
  }

  static assertPerformanceMetrics(executionTime: number, memoryUsed: number, maxTime: number, maxMemory: number): void {
    assert.ok(executionTime > 0, 'Execution time must be positive');
    assert.ok(executionTime < maxTime, `Execution time ${executionTime}ms exceeds limit ${maxTime}ms`);
    assert.ok(memoryUsed < maxMemory, `Memory usage ${memoryUsed.toFixed(1)}MB exceeds limit ${maxMemory}MB`);
  }
}