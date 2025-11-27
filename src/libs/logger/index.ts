// Simple logger for template. Extend or replace with pino, winston, or another logger for production.
// Example:
// import pino from 'pino';
// export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export interface LogContext {
  userId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  error?: string;
  stack?: string;
  status?: number | string;
  // Cache-related context
  key?: string;
  keys?: string[];
  keysCount?: number;
  ttl?: number;
  // Generic extra data
  [key: string]: unknown;
}

class Logger {
  private formatLog(level: string, message: string, context?: LogContext) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
  }

  info(message: string, context?: LogContext) {
    console.log(JSON.stringify(this.formatLog("INFO", message, context)));
  }

  error(message: string, error?: Error, context?: LogContext) {
    console.error(
      JSON.stringify(
        this.formatLog("ERROR", message, {
          ...context,
          error: error?.message,
          stack: error?.stack,
        })
      )
    );
  }

  warn(message: string, context?: LogContext) {
    console.warn(JSON.stringify(this.formatLog("WARN", message, context)));
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === "development") {
      console.debug(JSON.stringify(this.formatLog("DEBUG", message, context)));
    }
  }
}

export const logger = new Logger();
