import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Create a child logger with a specific module name
 */
export function createLogger(module: string) {
  return logger.child({ module });
}

export const botLogger = logger.child({ module: 'bot' });
export const apiLogger = logger.child({ module: 'api' });
export const aiLogger = logger.child({ module: 'ai' });
export const dbLogger = logger.child({ module: 'db' });
export const configLogger = logger.child({ module: 'config' });
export const adminLogger = logger.child({ module: 'admin' });
