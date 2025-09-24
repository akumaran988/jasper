import type { ILogger } from '../interfaces/ILogger.js';
import type { LogEntry } from '../types.js';

export class LoggerService implements ILogger {
  private logs: Map<string, LogEntry[]> = new Map();
  private readonly maxLogsPerService: number = 1000;
  private readonly logRetentionHours: number = 24;

  addLog(serviceId: string, level: LogEntry['level'], message: string, source?: LogEntry['source']): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message: this.sanitizeMessage(message),
      source,
    };

    const serviceLogs = this.logs.get(serviceId) || [];
    serviceLogs.push(logEntry);

    // Keep only the most recent logs
    if (serviceLogs.length > this.maxLogsPerService) {
      serviceLogs.splice(0, serviceLogs.length - this.maxLogsPerService);
    }

    this.logs.set(serviceId, serviceLogs);

    // Also log to console for debugging
    this.logToConsole(serviceId, logEntry);
  }

  getLogs(serviceId: string, limit?: number): LogEntry[] {
    const serviceLogs = this.logs.get(serviceId) || [];
    
    if (limit && limit > 0) {
      return serviceLogs.slice(-limit);
    }
    
    return [...serviceLogs];
  }

  clearLogs(serviceId: string): void {
    this.logs.delete(serviceId);
  }

  cleanup(): void {
    const cutoffTime = new Date(Date.now() - this.logRetentionHours * 60 * 60 * 1000);
    
    for (const [serviceId, serviceLogs] of this.logs.entries()) {
      const filteredLogs = serviceLogs.filter(log => log.timestamp > cutoffTime);
      
      if (filteredLogs.length === 0) {
        this.logs.delete(serviceId);
      } else {
        this.logs.set(serviceId, filteredLogs);
      }
    }
  }

  getServiceIds(): string[] {
    return Array.from(this.logs.keys());
  }

  getTotalLogCount(): number {
    let total = 0;
    for (const serviceLogs of this.logs.values()) {
      total += serviceLogs.length;
    }
    return total;
  }

  getLogStats(): { serviceCount: number; totalLogs: number; oldestLog?: Date; newestLog?: Date } {
    let totalLogs = 0;
    let oldestLog: Date | undefined;
    let newestLog: Date | undefined;

    for (const serviceLogs of this.logs.values()) {
      totalLogs += serviceLogs.length;
      
      for (const log of serviceLogs) {
        if (!oldestLog || log.timestamp < oldestLog) {
          oldestLog = log.timestamp;
        }
        if (!newestLog || log.timestamp > newestLog) {
          newestLog = log.timestamp;
        }
      }
    }

    return {
      serviceCount: this.logs.size,
      totalLogs,
      oldestLog,
      newestLog,
    };
  }

  private sanitizeMessage(message: string): string {
    // Remove any control characters and limit length
    return message
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .substring(0, 1000) // Limit message length
      .trim();
  }

  private logToConsole(serviceId: string, logEntry: LogEntry): void {
    const timestamp = logEntry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${serviceId.substring(0, 8)}] [${logEntry.level.toUpperCase()}]`;
    const source = logEntry.source ? ` [${logEntry.source}]` : '';
    const message = `${prefix}${source} ${logEntry.message}`;

    switch (logEntry.level) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'debug':
        if (process.env.DEBUG) {
          console.debug(message);
        }
        break;
      default:
        console.log(message);
        break;
    }
  }
}