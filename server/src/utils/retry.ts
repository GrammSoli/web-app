/**
 * Retry utilities with exponential backoff
 * For handling transient failures in external API calls
 */

import { apiLogger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (error) => {
    // Retry on network errors, timeouts, and 5xx status codes
    if (error instanceof Error) {
      return (
        error.message.includes('timeout') ||
        error.message.includes('network') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT')
      );
    }
    return false;
  },
};

/**
 * Delays execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates delay for next retry with exponential backoff and jitter
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Retries an async operation with exponential backoff
 * 
 * @param operation - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise resolving to operation result
 * 
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, initialDelayMs: 500 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if error is not retryable
      if (!opts.retryableErrors(error)) {
        throw error;
      }

      // Don't retry if we've exhausted all attempts
      if (attempt === opts.maxRetries) {
        break;
      }

      const delayMs = calculateBackoffDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
        opts.backoffMultiplier
      );

      apiLogger.warn(
        {
          attempt: attempt + 1,
          maxRetries: opts.maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        },
        'Operation failed, retrying with backoff'
      );

      await delay(delayMs);
    }
  }

  // All retries exhausted
  apiLogger.error(
    {
      maxRetries: opts.maxRetries,
      error: lastError,
    },
    'Operation failed after all retries'
  );

  throw lastError;
}

/**
 * Specialized retry for payment operations
 * More conservative retry strategy for critical financial operations
 */
export async function retryPaymentOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  return retryWithBackoff(operation, {
    maxRetries: 2, // Fewer retries for payments
    initialDelayMs: 2000, // Longer initial delay
    maxDelayMs: 8000,
    backoffMultiplier: 2,
    retryableErrors: (error) => {
      // Only retry on network/timeout errors, not validation or business logic errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes('timeout') ||
          message.includes('network') ||
          message.includes('econnrefused') ||
          message.includes('etimedout')
        );
      }
      return false;
    },
  });
}
