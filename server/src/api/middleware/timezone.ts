import { Request, Response, NextFunction } from 'express';

/**
 * Validate if a timezone string is a valid IANA timezone
 */
export function isValidTimezone(tz: string): boolean {
  try {
    // Try to create a DateTimeFormat with the timezone
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Extend Express Request to include userTimezone
declare global {
  namespace Express {
    interface Request {
      userTimezone: string;
    }
  }
}

/**
 * Middleware to extract and validate user timezone
 * 
 * Priority:
 * 1. X-Timezone header (from client)
 * 2. User's stored timezone from database
 * 3. Fallback to 'UTC'
 */
export function timezoneMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Priority 1: Check X-Timezone header
    const headerTimezone = req.headers['x-timezone'] as string;
    
    if (headerTimezone && isValidTimezone(headerTimezone)) {
      req.userTimezone = headerTimezone;
      return next();
    }
    
    // Priority 2: Use user's stored timezone from DB (set by auth middleware)
    if (req.user?.timezone && isValidTimezone(req.user.timezone)) {
      req.userTimezone = req.user.timezone;
      return next();
    }
    
    // Priority 3: Fallback to UTC
    req.userTimezone = 'UTC';
    next();
  };
}

/**
 * Get the start and end of "today" in a specific timezone
 * Returns UTC Date objects that represent the boundaries of today in the user's timezone
 */
export function getTodayBoundsInTimezone(timezone: string): { start: Date; end: Date } {
  const now = new Date();
  
  // Get the current date parts in the user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Format gives us YYYY-MM-DD in the user's timezone
  const todayStr = formatter.format(now);
  
  // Parse start of day in user's timezone
  // We create a date string like "2024-12-14T00:00:00" and interpret it in the timezone
  const startOfDayLocal = new Date(`${todayStr}T00:00:00`);
  const endOfDayLocal = new Date(`${todayStr}T23:59:59.999`);
  
  // Get timezone offset for these times
  const startOffset = getTimezoneOffset(timezone, startOfDayLocal);
  const endOffset = getTimezoneOffset(timezone, endOfDayLocal);
  
  // Convert to UTC by subtracting the offset
  const startUTC = new Date(startOfDayLocal.getTime() - startOffset * 60 * 1000);
  const endUTC = new Date(endOfDayLocal.getTime() - endOffset * 60 * 1000);
  
  return { start: startUTC, end: endUTC };
}

/**
 * Get timezone offset in minutes for a specific date
 * Positive = ahead of UTC, Negative = behind UTC
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  // Get the date string in both UTC and target timezone
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  
  // Difference in minutes
  return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
}

/**
 * Convert a UTC date to a specific timezone and format it
 */
export function formatDateInTimezone(
  date: Date, 
  timezone: string, 
  options?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    ...options,
  }).format(date);
}

/**
 * Get the current date string (YYYY-MM-DD) in a specific timezone
 */
export function getCurrentDateInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Check if a UTC date falls on "today" in a specific timezone
 */
export function isToday(utcDate: Date, timezone: string): boolean {
  const { start, end } = getTodayBoundsInTimezone(timezone);
  return utcDate >= start && utcDate <= end;
}
