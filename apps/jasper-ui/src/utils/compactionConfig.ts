import { CompactionConfig, DEFAULT_COMPACTION_CONFIG } from './compactionStrategy.js';

export interface CompactionSettings {
  enabled: boolean;
  maxMessageAge: number;
  tokenThreshold: number;
  toolDeduplication: boolean;
  conversationCompaction: boolean;
  maxAIIterations: number;
  minMessagesBeforeCompaction: number;
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  maxMessageAge: DEFAULT_COMPACTION_CONFIG.maxMessageAge,
  tokenThreshold: DEFAULT_COMPACTION_CONFIG.tokenThreshold,
  toolDeduplication: DEFAULT_COMPACTION_CONFIG.toolResultDeduplicationEnabled,
  conversationCompaction: DEFAULT_COMPACTION_CONFIG.conversationCompactionEnabled,
  maxAIIterations: DEFAULT_COMPACTION_CONFIG.maxCompactionIterations,
  minMessagesBeforeCompaction: DEFAULT_COMPACTION_CONFIG.minMessagesBeforeCompaction
};

export class CompactionConfigManager {
  private settings: CompactionSettings;

  constructor(settings?: Partial<CompactionSettings>) {
    this.settings = { ...DEFAULT_COMPACTION_SETTINGS, ...settings };
  }

  getConfig(): CompactionConfig {
    return {
      maxMessageAge: this.settings.maxMessageAge,
      toolResultDeduplicationEnabled: this.settings.toolDeduplication,
      conversationCompactionEnabled: this.settings.conversationCompaction,
      maxCompactionIterations: this.settings.maxAIIterations,
      tokenThreshold: this.settings.tokenThreshold,
      minMessagesBeforeCompaction: this.settings.minMessagesBeforeCompaction
    };
  }

  updateSettings(settings: Partial<CompactionSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  getSettings(): CompactionSettings {
    return { ...this.settings };
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
  }

  // Preset configurations for different use cases
  static createDevelopmentConfig(): CompactionConfig {
    return {
      maxMessageAge: 100, // Shorter for development
      toolResultDeduplicationEnabled: true,
      conversationCompactionEnabled: false, // Disable AI compaction for dev
      maxCompactionIterations: 3,
      tokenThreshold: 15000, // Lower threshold for dev
      minMessagesBeforeCompaction: 5
    };
  }

  static createProductionConfig(): CompactionConfig {
    return {
      maxMessageAge: 300,
      toolResultDeduplicationEnabled: true,
      conversationCompactionEnabled: true,
      maxCompactionIterations: 5,
      tokenThreshold: 25000,
      minMessagesBeforeCompaction: 10
    };
  }

  static createLowResourceConfig(): CompactionConfig {
    return {
      maxMessageAge: 200,
      toolResultDeduplicationEnabled: true,
      conversationCompactionEnabled: false, // Disable AI to save resources
      maxCompactionIterations: 1,
      tokenThreshold: 10000, // Aggressive compaction
      minMessagesBeforeCompaction: 5
    };
  }

  static createHighPerformanceConfig(): CompactionConfig {
    return {
      maxMessageAge: 500,
      toolResultDeduplicationEnabled: true,
      conversationCompactionEnabled: true,
      maxCompactionIterations: 10,
      tokenThreshold: 50000, // Allow larger conversations
      minMessagesBeforeCompaction: 20
    };
  }
}