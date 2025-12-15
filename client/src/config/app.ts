/**
 * Application configuration constants
 * Centralized place for all magic numbers and configurable values
 */

export const APP_CONFIG = {
  /** Minimum characters required for journal entry text */
  MIN_ENTRY_CHARS: 10,
  
  /** How many entries to show on home page */
  HOME_ENTRIES_LIMIT: 5,
  
  /** API request timeout in milliseconds */
  API_TIMEOUT_MS: 30000,
  
  /** Pagination page size */
  ENTRIES_PAGE_SIZE: 10,
} as const;
