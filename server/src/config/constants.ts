/**
 * Application Constants
 * Centralized configuration for magic numbers and limits
 */

// ============================================
// DATABASE QUERY LIMITS
// ============================================

/**
 * Maximum number of entries to fetch for streak calculation
 * Last 100 entries should cover most cases (3+ months with daily entries)
 */
export const STREAK_ENTRIES_LIMIT = 100;

/**
 * Maximum number of entries to fetch for stats calculation
 * 1000 entries covers approximately 3 years of daily entries
 */
export const STATS_ENTRIES_LIMIT = 1000;

/**
 * Default pagination limit for entries listing
 */
export const ENTRIES_DEFAULT_LIMIT = 20;

// ============================================
// TIME CONSTANTS
// ============================================

/**
 * Milliseconds in one day (24 hours)
 */
export const MS_PER_DAY = 86400000;

/**
 * Seconds in one day (24 hours)
 */
export const SECONDS_PER_DAY = 86400;

// ============================================
// VALIDATION LIMITS
// ============================================

/**
 * Maximum text content length for journal entries
 */
export const MAX_ENTRY_TEXT_LENGTH = 10000;

/**
 * Maximum number of tags per entry
 */
export const MAX_TAGS_PER_ENTRY = 10;

/**
 * Maximum tag length
 */
export const MAX_TAG_LENGTH = 30;

// ============================================
// STATS CONFIGURATION
// ============================================

/**
 * Default number of days for stats calculation
 */
export const STATS_DEFAULT_DAYS = 30;

/**
 * Maximum number of days for stats calculation
 */
export const STATS_MAX_DAYS = 90;

/**
 * Number of top tags to return in stats
 */
export const STATS_TOP_TAGS_COUNT = 10;

/**
 * Days to look back for weekly moods chart
 */
export const STATS_WEEKLY_DAYS = 7;

/**
 * Days to look back for monthly moods chart
 */
export const STATS_MONTHLY_DAYS = 30;

/**
 * Threshold for mood trend change (in mood score points)
 */
export const MOOD_TREND_THRESHOLD = 0.5;
