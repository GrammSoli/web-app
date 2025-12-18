/**
 * Sentry Error Tracking
 * Initialize FIRST, before any other imports in index.ts
 */

import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log('⚠️ Sentry disabled (no SENTRY_DSN)');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Capture 100% of transactions for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Don't send PII
    sendDefaultPii: false,
    
    // Ignore common non-errors
    ignoreErrors: [
      'Rate limit exceeded',
      'Too many requests',
      'Invalid Telegram auth',
    ],
    
    // Add context
    beforeSend(event) {
      // Remove sensitive data
      if (event.request?.headers) {
        delete event.request.headers['x-telegram-init-data'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });

  console.log('✅ Sentry initialized');
}

export { Sentry };

/**
 * Capture exception with context
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Add user context for errors
 */
export function setUserContext(userId: string, telegramId?: bigint) {
  if (!SENTRY_DSN) return;
  
  Sentry.setUser({
    id: userId,
    ...(telegramId && { username: `tg:${telegramId}` }),
  });
}

/**
 * Clear user context (on logout/error)
 */
export function clearUserContext() {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}
