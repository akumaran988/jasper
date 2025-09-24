import type { LogEntry } from '../types.js';

export interface ILogger {
  addLog(serviceId: string, level: LogEntry['level'], message: string, source?: LogEntry['source']): void;
  getLogs(serviceId: string, limit?: number): LogEntry[];
  clearLogs(serviceId: string): void;
  cleanup(): void;
}