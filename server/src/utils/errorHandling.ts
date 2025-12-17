/**
 * Centralized error handling utilities
 * Provides consistent error logging and response formatting
 */

import { apiLogger } from './logger.js';

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  details?: unknown;
  code?: string;
}

/**
 * Error types for classification
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMIT = 'RATE_LIMIT_EXCEEDED',
  SERVER = 'SERVER_ERROR',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * Standard error class with metadata
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public type: ErrorType = ErrorType.SERVER,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Formats error for API response
 */
export function formatErrorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.type,
      ...(process.env.NODE_ENV === 'development' && { details: error.details }),
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      ...(process.env.NODE_ENV === 'development' && { details: error.stack }),
    };
  }

  return {
    error: 'Произошла неизвестная ошибка',
  };
}

/**
 * Logs error with context
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (error instanceof AppError) {
    // Don't log validation errors and not found errors at error level
    if (error.type === ErrorType.VALIDATION || error.type === ErrorType.NOT_FOUND) {
      apiLogger.warn({ ...context, error: error.message, type: error.type }, 'Client error');
      return;
    }
  }

  apiLogger.error({ ...context, error }, 'Unhandled error');
}

/**
 * Safe error handler wrapper for async route handlers
 */
export function asyncHandler(
  fn: (req: any, res: any, next?: any) => Promise<any>
) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      logError(error, { path: req.path, method: req.method });

      if (error instanceof AppError) {
        return res.status(error.statusCode).json(formatErrorResponse(error));
      }

      // Default 500 error
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    });
  };
}

/**
 * Client-side error utilities
 */
export const clientErrors = {
  /**
   * Extracts user-friendly error message from error object
   */
  getUserMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object' && 'error' in error) {
      return String((error as any).error);
    }
    
    return 'Произошла ошибка';
  },

  /**
   * Checks if error is a network error
   */
  isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'AbortError' || 
             error.message.includes('network') || 
             error.message.includes('timeout') ||
             error.message.includes('fetch');
    }
    return false;
  },

  /**
   * Checks if error is an auth error
   */
  isAuthError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      return (error as any).code === ErrorType.UNAUTHORIZED;
    }
    return false;
  },
};
