import fs from 'fs';
import path from 'path';

export interface LogLevel {
  ERROR: 'ERROR';
  WARN: 'WARN';
  INFO: 'INFO';
  DEBUG: 'DEBUG';
}

export const LogLevel: LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
} as const;

export type LogLevelType = keyof LogLevel;

export interface LoggerConfig {
  logToFile?: boolean;
  logFilePath?: string;
  logLevel?: LogLevelType;
  maxFileSize?: number; // in bytes
  enableConsole?: boolean;
}

class Logger {
  private config: Required<LoggerConfig>;
  private logStream?: fs.WriteStream;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      logToFile: config.logToFile ?? false,
      logFilePath: config.logFilePath ?? path.join(process.cwd(), 'jasper.log'),
      logLevel: config.logLevel ?? 'INFO',
      maxFileSize: config.maxFileSize ?? 10 * 1024 * 1024, // 10MB default
      enableConsole: config.enableConsole ?? false
    };

    this.initializeFileLogging();
  }

  private initializeFileLogging() {
    if (!this.config.logToFile) {
      if (this.config.enableConsole) {
        console.log('File logging disabled');
      }
      return;
    }

    try {
      // Create directory if it doesn't exist
      const logDir = path.dirname(this.config.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Check if log file exists and its size
      if (fs.existsSync(this.config.logFilePath)) {
        const stats = fs.statSync(this.config.logFilePath);
        if (stats.size > this.config.maxFileSize) {
          // Rotate log file
          const backupPath = this.config.logFilePath + '.old';
          if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
          }
          fs.renameSync(this.config.logFilePath, backupPath);
        }
      }

      this.logStream = fs.createWriteStream(this.config.logFilePath, { flags: 'a' });
      
      // Write initialization message
      this.logStream.write(`\n=== Jasper Session Started at ${new Date().toISOString()} ===\n`);
    } catch (error) {
      // Silently disable file logging if it fails
      this.config.logToFile = false;
    }
  }

  private shouldLog(level: LogLevelType): boolean {
    const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const currentLevelIndex = levels.indexOf(this.config.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatMessage(level: LogLevelType, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ') : '';
    return `[${timestamp}] ${level}: ${message}${formattedArgs}`;
  }

  private writeLog(level: LogLevelType, message: string, ...args: any[]) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, ...args);

    if (this.config.logToFile && this.logStream) {
      this.logStream.write(formattedMessage + '\n');
      // Force flush to ensure logs are written immediately
      this.logStream.uncork();
    }

    if (this.config.enableConsole) {
      console.log(formattedMessage);
    }
  }

  error(message: string, ...args: any[]) {
    this.writeLog('ERROR', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.writeLog('WARN', message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.writeLog('INFO', message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.writeLog('DEBUG', message, ...args);
  }

  close() {
    if (this.logStream) {
      this.logStream.end();
    }
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function initializeLogger(config: LoggerConfig = {}) {
  if (globalLogger) {
    globalLogger.close();
  }
  globalLogger = new Logger(config);
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

export function closeLogger() {
  if (globalLogger) {
    globalLogger.close();
    globalLogger = null;
  }
}