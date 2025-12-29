/**
 * Habits API Routes
 * 
 * Endpoints for habit tracking feature
 */

import { Router, Request, Response } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import { timezoneMiddleware } from '../middleware/timezone.js';
import { prisma } from '../../services/database.js';
import { configService } from '../../services/config.js';
import { getEffectiveTier } from '../../services/user.js';
import { apiLogger } from '../../utils/logger.js';

const router = Router();

// All routes require authentication
router.use(telegramAuth(true));
router.use(timezoneMiddleware());

// ============================================
// TYPES
// ============================================

interface HabitWithStats {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: string;
  customDays: number[];
  reminderTime: string | null;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  sortOrder: number;
  isActive: boolean;
  completedToday: boolean;
  completedDates: string[]; // For the week view
}

// ============================================
// HELPERS
// ============================================

/**
 * Get habit limit for user's tier
 */
async function getHabitLimit(tier: string): Promise<number> {
  const bypassTiers = await configService.getBool('feature.bypass_tiers', false);
  
  if (bypassTiers) {
    return configService.getNumber('limits.bypass.max_habits', 6);
  }
  
  switch (tier) {
    case 'premium':
      return configService.getNumber('limits.premium.max_habits', 50);
    case 'basic':
      return configService.getNumber('limits.basic.max_habits', 6);
    default:
      return configService.getNumber('limits.free.max_habits', 3);
  }
}

/**
 * Get habit freeze limit for user's tier
 */
async function getFreezeLimit(tier: string): Promise<number> {
  const bypassTiers = await configService.getBool('feature.bypass_tiers', false);
  
  if (bypassTiers) {
    return configService.getNumber('limits.bypass.habit_freezes', 3);
  }
  
  switch (tier) {
    case 'premium':
      return configService.getNumber('limits.premium.habit_freezes', 3);
    case 'basic':
      return configService.getNumber('limits.basic.habit_freezes', 2);
    default:
      return configService.getNumber('limits.free.habit_freezes', 1);
  }
}

/**
 * Calculate streak for a habit considering frequency and freeze
 * Uses date strings for comparison to avoid timezone issues
 * Skips non-scheduled days when calculating streaks
 * Uses freeze to allow 1 missed day without breaking streak
 */
function calculateHabitStreak(
  completions: { completedDate: Date }[], 
  timezone: string = 'UTC',
  frequency: string = 'daily',
  customDays: number[] = [],
  _freezesRemaining: number = 0, // Deprecated: freeze is now applied by scheduler
  habitCreatedAt?: Date
): { current: number; longest: number } {
  if (completions.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Get today in user's timezone
  const todayStr = getTodayInTimezone(timezone);
  
  // Convert completions to date strings in user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Get habit created date string (to not count days before creation as "missed")
  const habitCreatedStr = habitCreatedAt ? formatter.format(new Date(habitCreatedAt)) : '2020-01-01';
  
  // Get unique date strings, sorted descending
  // Note: Frozen days are included as completions (created by scheduler with is_frozen=true)
  const completedDateStrings = new Set(
    completions.map(c => formatter.format(new Date(c.completedDate)))
  );
  
  // Helper to check if a date should have habit scheduled
  const isScheduledDay = (dateStr: string): boolean => {
    const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
    return shouldShowHabitOnDay(frequency, customDays, dayOfWeek);
  };
  
  // Helper to get previous day string
  const getPrevDay = (dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00Z');
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };
  
  // Find the most recent scheduled day (today or before)
  let checkDate = todayStr;
  
  // If today is not a scheduled day, find the last scheduled day
  while (!isScheduledDay(checkDate) && checkDate > '2020-01-01') {
    checkDate = getPrevDay(checkDate);
  }
  
  // Calculate current streak going backwards
  let currentStreak = 0;
  let streakDate = checkDate;
  
  // Check if the most recent scheduled day was completed
  const todayIsScheduled = isScheduledDay(todayStr);
  const todayCompleted = completedDateStrings.has(todayStr);
  
  if (todayIsScheduled) {
    if (todayCompleted) {
      // Today is scheduled and completed - start counting from today
      currentStreak = 1;
      streakDate = getPrevDay(todayStr);
    } else {
      // Today is scheduled but not completed - check if yesterday's scheduled day was completed
      let lastScheduledDay = getPrevDay(todayStr);
      while (!isScheduledDay(lastScheduledDay) && lastScheduledDay > '2020-01-01') {
        lastScheduledDay = getPrevDay(lastScheduledDay);
      }
      
      // Don't count days before habit was created as "missed"
      if (lastScheduledDay < habitCreatedStr) {
        // Habit didn't exist yet, no streak to calculate
        streakDate = todayStr;
      } else if (completedDateStrings.has(lastScheduledDay)) {
        // Yesterday was completed (or frozen), today can still be done
        currentStreak = 1;
        streakDate = getPrevDay(lastScheduledDay);
      } else {
        // Streak is broken
        streakDate = lastScheduledDay;
      }
    }
  } else {
    // Today is not scheduled - check if the last scheduled day was completed
    if (completedDateStrings.has(checkDate)) {
      currentStreak = 1;
      streakDate = getPrevDay(checkDate);
    }
  }
  
  // Continue counting backwards for current streak
  if (currentStreak > 0) {
    while (streakDate > '2020-01-01' && streakDate >= habitCreatedStr) {
      // Find the previous scheduled day
      while (!isScheduledDay(streakDate) && streakDate > '2020-01-01') {
        streakDate = getPrevDay(streakDate);
      }
      
      // Stop if we've gone before habit creation
      if (streakDate < habitCreatedStr || streakDate <= '2020-01-01') break;
      
      if (completedDateStrings.has(streakDate)) {
        currentStreak++;
        streakDate = getPrevDay(streakDate);
      } else {
        break; // Streak broken
      }
    }
  }
  
  // Calculate longest streak by iterating through all completions
  // Sort completions ascending
  const sortedDates = [...completedDateStrings].sort();
  let longestStreak = 0;
  let tempStreak = 0;
  let lastScheduledCompleted: string | null = null;
  
  for (const dateStr of sortedDates) {
    if (!isScheduledDay(dateStr)) {
      // This completion was on a non-scheduled day (edge case)
      continue;
    }
    
    if (lastScheduledCompleted === null) {
      tempStreak = 1;
      lastScheduledCompleted = dateStr;
    } else {
      // Check if this is the next scheduled day after lastScheduledCompleted
      // Walk backwards from current date to find if lastScheduledCompleted is the previous scheduled day
      let prevScheduled = getPrevDay(dateStr);
      while (!isScheduledDay(prevScheduled) && prevScheduled > '2020-01-01') {
        prevScheduled = getPrevDay(prevScheduled);
      }
      
      if (prevScheduled === lastScheduledCompleted) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
      
      lastScheduledCompleted = dateStr;
    }
  }
  
  longestStreak = Math.max(longestStreak, tempStreak, currentStreak);
  
  return { current: currentStreak, longest: longestStreak };
}

/**
 * Get dates for the current week (for completion dots)
 * Uses user's timezone to determine "today"
 */
function getWeekDates(timezone: string = 'UTC'): string[] {
  // Get current date in user's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now); // YYYY-MM-DD format
  const today = new Date(todayStr + 'T12:00:00Z'); // noon UTC to avoid timezone issues
  
  const dates: string[] = [];
  
  // Get last 7 days including today
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
}

/**
 * Get "today" date string in user's timezone
 */
function getTodayInTimezone(timezone: string = 'UTC'): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now); // YYYY-MM-DD format
}

/**
 * Get day of week (0=Mon, 6=Sun) from a date string (YYYY-MM-DD)
 */
function getDayOfWeekFromDateStr(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00Z');
  const jsDay = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Convert to our format: 0=Mon, 1=Tue, ..., 6=Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Check if a habit should be shown on a specific day
 */
function shouldShowHabitOnDay(
  frequency: string, 
  customDays: number[], 
  dayOfWeek: number
): boolean {
  switch (frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 0 && dayOfWeek <= 4; // Mon-Fri
    case 'weekends':
      return dayOfWeek === 5 || dayOfWeek === 6; // Sat-Sun
    case 'custom':
      return customDays.includes(dayOfWeek);
    default:
      return true;
  }
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/habits
 * Get all habits for user with completion status
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userTimezone = req.userTimezone || 'UTC';
    const dateParam = req.query.date as string | undefined;
    
    // Target date - use user timezone if not specified
    const todayStr = dateParam || getTodayInTimezone(userTimezone);
    const targetDayOfWeek = getDayOfWeekFromDateStr(todayStr);
    
    // Get week dates for completion dots (in user's timezone)
    const weekDates = getWeekDates(userTimezone);
    const weekStart = new Date(weekDates[0] + 'T00:00:00Z');
    const weekEnd = new Date(weekDates[weekDates.length - 1] + 'T23:59:59Z');
    
    // Get habits with completions for the week
    const habits = await prisma.habit.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
      include: {
        completions: {
          where: {
            completedDate: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
          select: {
            completedDate: true,
          },
        },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { dateCreated: 'asc' },
      ],
    });
    
    // Get tier and limits
    const effectiveTier = await getEffectiveTier(user.id);
    const maxHabits = await getHabitLimit(effectiveTier);
    
    // Filter habits that should be shown on the target day
    const filteredHabits = habits.filter(habit => 
      shouldShowHabitOnDay(habit.frequency, habit.customDays, targetDayOfWeek)
    );
    
    // Format response (only habits scheduled for this day)
    const habitsWithStats: HabitWithStats[] = filteredHabits.map(habit => {
      const completedDates = habit.completions.map(c => 
        new Date(c.completedDate).toISOString().split('T')[0]
      );
      
      const completedToday = completedDates.includes(todayStr);
      
      return {
        id: habit.id,
        name: habit.name,
        emoji: habit.emoji,
        color: habit.color,
        frequency: habit.frequency,
        customDays: habit.customDays,
        reminderTime: habit.reminderTime,
        currentStreak: habit.currentStreak,
        longestStreak: habit.longestStreak,
        totalCompletions: habit.totalCompletions,
        sortOrder: habit.sortOrder,
        isActive: habit.isActive,
        completedToday,
        completedDates,
      };
    });
    
    // Calculate daily progress (only for habits scheduled today)
    const totalHabits = habitsWithStats.length;
    const completedToday = habitsWithStats.filter(h => h.completedToday).length;
    
    // Total habits count for limits (all habits, not filtered)
    const totalHabitsForLimit = habits.length;
    
    // Calculate completion dots for week strip (considering frequency)
    const completionDots: Record<string, number> = {};
    for (const dateStr of weekDates) {
      const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
      let count = 0;
      
      for (const habit of habits) {
        // Only count if habit is scheduled for this day
        if (shouldShowHabitOnDay(habit.frequency, habit.customDays, dayOfWeek)) {
          const hasCompletion = habit.completions.some(c => 
            new Date(c.completedDate).toISOString().split('T')[0] === dateStr
          );
          if (hasCompletion) {
            count++;
          }
        }
      }
      
      if (count > 0) {
        completionDots[dateStr] = count;
      }
    }
    
    // Get freeze info (using raw query until Prisma client is regenerated)
    const freezeData = await prisma.$queryRaw<Array<{
      habit_freezes_used: number;
      habit_freezes_reset_month: Date | null;
    }>>`
      SELECT habit_freezes_used, habit_freezes_reset_month 
      FROM app.users WHERE id = ${user.id}::uuid
    `;
    
    const userFreeze = freezeData[0];
    const currentMonthStart = new Date(new Date().toISOString().slice(0, 7) + '-01');
    const needsReset = !userFreeze?.habit_freezes_reset_month || 
      new Date(userFreeze.habit_freezes_reset_month) < currentMonthStart;
    const freezeLimit = await getFreezeLimit(effectiveTier);
    const freezesUsed = needsReset ? 0 : (userFreeze?.habit_freezes_used || 0);
    
    return res.json({
      habits: habitsWithStats,
      stats: {
        totalHabits,
        completedToday,
        maxHabits,
        canCreateMore: totalHabitsForLimit < maxHabits,
        totalHabitsAll: totalHabitsForLimit, // Total habits for UI info
      },
      weekDates,
      completionDots, // Pre-calculated with frequency in mind
      freezeInfo: {
        used: freezesUsed,
        limit: freezeLimit,
        remaining: freezeLimit - freezesUsed,
      },
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get habits');
    return res.status(500).json({ error: 'Failed to get habits' });
  }
});

/**
 * POST /api/habits
 * Create a new habit
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { name, emoji, color, frequency, customDays, reminderTime } = req.body;
    
    // Validate
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 chars)' });
    }
    
    // Validate customDays if provided
    if (customDays && Array.isArray(customDays)) {
      const invalidDays = customDays.filter((d: unknown) => typeof d !== 'number' || d < 0 || d > 6);
      if (invalidDays.length > 0) {
        return res.status(400).json({ error: 'Invalid day values in customDays (must be 0-6)' });
      }
    }
    
    // Validate frequency
    const VALID_FREQUENCIES = ['daily', 'weekdays', 'weekends', 'custom'];
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency (must be daily, weekdays, weekends, or custom)' });
    }
    
    // Validate color (hex format)
    const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
    if (color && !COLOR_REGEX.test(color)) {
      return res.status(400).json({ error: 'Invalid color format (must be #RRGGBB)' });
    }
    
    // Validate emoji (max 10 chars, only emoji characters)
    if (emoji && (typeof emoji !== 'string' || emoji.length > 10)) {
      return res.status(400).json({ error: 'Invalid emoji (max 10 characters)' });
    }
    
    // Check limit
    const effectiveTier = await getEffectiveTier(user.id);
    const maxHabits = await getHabitLimit(effectiveTier);
    
    const currentCount = await prisma.habit.count({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
    });
    
    if (currentCount >= maxHabits) {
      return res.status(403).json({ 
        error: 'Habit limit reached',
        limit: maxHabits,
        tier: effectiveTier,
      });
    }
    
    // Get next sort order
    const lastHabit = await prisma.habit.findFirst({
      where: { userId: user.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    
    const sortOrder = (lastHabit?.sortOrder ?? -1) + 1;
    
    // Create habit
    const habit = await prisma.habit.create({
      data: {
        userId: user.id,
        name: name.trim(),
        emoji: emoji || '✨',
        color: color || '#6366f1',
        frequency: frequency || 'daily',
        customDays: customDays || [],
        reminderTime: reminderTime || null,
        sortOrder,
      },
    });
    
    apiLogger.info({ userId: user.id, habitId: habit.id }, 'Habit created');
    
    return res.status(201).json({
      id: habit.id,
      name: habit.name,
      emoji: habit.emoji,
      color: habit.color,
      frequency: habit.frequency,
      customDays: habit.customDays,
      reminderTime: habit.reminderTime,
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      sortOrder: habit.sortOrder,
      isActive: true,
      completedToday: false,
      completedDates: [],
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to create habit');
    return res.status(500).json({ error: 'Failed to create habit' });
  }
});

/**
 * PUT /api/habits/:id
 * Update a habit
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { name, emoji, color, frequency, customDays, reminderTime } = req.body;
    
    // Check ownership
    const habit = await prisma.habit.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    // Validate name length
    if (name && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    if (name && name.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 chars)' });
    }
    
    // Validate frequency
    const VALID_FREQUENCIES = ['daily', 'weekdays', 'weekends', 'custom'];
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency (must be daily, weekdays, weekends, or custom)' });
    }
    
    // Validate color (hex format)
    const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
    if (color && !COLOR_REGEX.test(color)) {
      return res.status(400).json({ error: 'Invalid color format (must be #RRGGBB)' });
    }
    
    // Validate emoji
    if (emoji && (typeof emoji !== 'string' || emoji.length > 10)) {
      return res.status(400).json({ error: 'Invalid emoji (max 10 characters)' });
    }
    
    // Validate customDays if provided
    if (customDays && Array.isArray(customDays)) {
      const invalidDays = customDays.filter((d: unknown) => typeof d !== 'number' || d < 0 || d > 6);
      if (invalidDays.length > 0) {
        return res.status(400).json({ error: 'Invalid day values in customDays (must be 0-6)' });
      }
    }
    
    // Update
    const updated = await prisma.habit.update({
      where: { id },
      data: {
        name: name?.trim() || habit.name,
        emoji: emoji || habit.emoji,
        color: color || habit.color,
        frequency: frequency || habit.frequency,
        customDays: customDays ?? habit.customDays,
        reminderTime: reminderTime !== undefined ? reminderTime : habit.reminderTime,
      },
    });
    
    return res.json(updated);
  } catch (error) {
    apiLogger.error({ error }, 'Failed to update habit');
    return res.status(500).json({ error: 'Failed to update habit' });
  }
});

/**
 * DELETE /api/habits/:id
 * Delete (archive) a habit
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    
    // Check ownership
    const habit = await prisma.habit.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    // Archive instead of delete (preserve history)
    await prisma.habit.update({
      where: { id },
      data: { isArchived: true, isActive: false },
    });
    
    apiLogger.info({ userId: user.id, habitId: id }, 'Habit archived');
    
    return res.json({ success: true });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to delete habit');
    return res.status(500).json({ error: 'Failed to delete habit' });
  }
});

/**
 * POST /api/habits/:id/toggle
 * Toggle habit completion for a date
 */
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userTimezone = req.userTimezone || 'UTC';
    const { id } = req.params;
    const { date } = req.body; // Optional, defaults to today in user's timezone
    
    // Target date - use user timezone if not specified
    const targetDateStr = date || getTodayInTimezone(userTimezone);
    const todayStr = getTodayInTimezone(userTimezone);
    
    // Block completion for future dates
    if (targetDateStr > todayStr) {
      return res.status(400).json({ 
        error: 'Cannot mark habits as completed for future dates',
        code: 'FUTURE_DATE',
        message: 'Будущее еще не наступило. Вернитесь в этот день, чтобы отметить выполнение!',
      });
    }
    
    const targetDate = new Date(targetDateStr + 'T12:00:00Z'); // noon UTC to avoid timezone issues
    
    // Check ownership
    const habit = await prisma.habit.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    // Check if already completed (use date range for the day)
    const dayStart = new Date(targetDateStr + 'T00:00:00Z');
    const dayEnd = new Date(targetDateStr + 'T23:59:59Z');
    
    const existing = await prisma.habitCompletion.findFirst({
      where: {
        habitId: id,
        completedDate: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });
    
    let completed: boolean;
    
    if (existing) {
      // Remove completion
      await prisma.habitCompletion.delete({
        where: { id: existing.id },
      });
      completed = false;
    } else {
      // Add completion
      await prisma.habitCompletion.create({
        data: {
          habitId: id,
          userId: user.id,
          completedDate: targetDate,
        },
      });
      completed = true;
    }
    
    // Recalculate streak (considering habit frequency and freeze)
    const allCompletions = await prisma.habitCompletion.findMany({
      where: { habitId: id },
      select: { completedDate: true },
      orderBy: { completedDate: 'desc' },
    });
    
    // Get user freeze info (using raw query until Prisma client is regenerated)
    const freezeData = await prisma.$queryRaw<Array<{
      habit_freezes_available: number;
      habit_freezes_used: number;
      habit_freezes_reset_month: Date | null;
    }>>`
      SELECT habit_freezes_available, habit_freezes_used, habit_freezes_reset_month 
      FROM app.users WHERE id = ${user.id}::uuid
    `;
    
    const userFreeze = freezeData[0];
    
    // Check if we need to reset freeze count (new month)
    const currentMonthStart = new Date(new Date().toISOString().slice(0, 7) + '-01');
    const needsReset = !userFreeze?.habit_freezes_reset_month || 
      new Date(userFreeze.habit_freezes_reset_month) < currentMonthStart;
    
    // Get freeze limit for tier
    const effectiveTier = await getEffectiveTier(user.id);
    const freezeLimit = await getFreezeLimit(effectiveTier);
    
    let freezesUsed = needsReset ? 0 : (userFreeze?.habit_freezes_used || 0);
    
    // Calculate streak WITHOUT applying freeze (freeze is applied by scheduler at 00:05)
    const { current, longest } = calculateHabitStreak(
      allCompletions, 
      userTimezone,
      habit.frequency,
      habit.customDays,
      0, // Don't use freeze in toggle - it's handled by daily scheduler
      habit.dateCreated
    );
    
    // Reset freeze count if new month (but don't apply freeze here)
    if (needsReset) {
      await prisma.$executeRaw`
        UPDATE app.users SET 
          habit_freezes_used = 0,
          habit_freezes_reset_month = ${currentMonthStart},
          habit_freezes_available = ${freezeLimit}
        WHERE id = ${user.id}::uuid
      `;
      freezesUsed = 0;
    }
    
    // Update habit stats
    await prisma.habit.update({
      where: { id },
      data: {
        currentStreak: current,
        longestStreak: Math.max(habit.longestStreak, longest),
        totalCompletions: allCompletions.length,
      },
    });
    
    // Check if all habits scheduled for the target day are completed (for confetti)
    const targetDayOfWeek = getDayOfWeekFromDateStr(targetDateStr);
    
    const allHabits = await prisma.habit.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
      include: {
        completions: {
          where: {
            completedDate: {
              gte: dayStart,
              lte: dayEnd,
            },
          },
        },
      },
    });
    
    // Filter to only habits scheduled for this day
    const scheduledHabits = allHabits.filter(h => 
      shouldShowHabitOnDay(h.frequency, h.customDays, targetDayOfWeek)
    );
    
    const allCompleted = scheduledHabits.length > 0 && scheduledHabits.every(h => h.completions.length > 0);
    
    apiLogger.info({ 
      userId: user.id, 
      habitId: id, 
      completed, 
      streak: current,
      allCompleted,
      scheduledCount: scheduledHabits.length,
    }, 'Habit toggled');
    
    return res.json({
      completed,
      currentStreak: current,
      longestStreak: Math.max(habit.longestStreak, longest),
      totalCompletions: allCompletions.length,
      allCompleted, // For triggering confetti!
      freezeInfo: {
        used: freezesUsed,
        limit: freezeLimit,
        remaining: freezeLimit - freezesUsed,
      },
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to toggle habit');
    return res.status(500).json({ error: 'Failed to toggle habit' });
  }
});

/**
 * GET /api/habits/freeze
 * Get user's freeze info
 */
router.get('/freeze', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    
    // Get freeze info (using raw query until Prisma client is regenerated)
    const freezeData = await prisma.$queryRaw<Array<{
      habit_freezes_available: number;
      habit_freezes_used: number;
      habit_freezes_reset_month: Date | null;
    }>>`
      SELECT habit_freezes_available, habit_freezes_used, habit_freezes_reset_month 
      FROM app.users WHERE id = ${user.id}::uuid
    `;
    
    const userFreeze = freezeData[0];
    
    // Check if we need to reset freeze count (new month)
    const currentMonthStart = new Date(new Date().toISOString().slice(0, 7) + '-01');
    const needsReset = !userFreeze?.habit_freezes_reset_month || 
      new Date(userFreeze.habit_freezes_reset_month) < currentMonthStart;
    
    const effectiveTier = await getEffectiveTier(user.id);
    const freezeLimit = await getFreezeLimit(effectiveTier);
    const freezesUsed = needsReset ? 0 : (userFreeze?.habit_freezes_used || 0);
    
    // Reset if needed
    if (needsReset) {
      await prisma.$executeRaw`
        UPDATE app.users 
        SET habit_freezes_used = 0,
            habit_freezes_reset_month = ${currentMonthStart}::date,
            habit_freezes_available = ${freezeLimit}
        WHERE id = ${user.id}::uuid
      `;
    }
    
    return res.json({
      used: needsReset ? 0 : freezesUsed,
      limit: freezeLimit,
      remaining: freezeLimit - (needsReset ? 0 : freezesUsed),
      tier: effectiveTier,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get freeze info');
    return res.status(500).json({ error: 'Failed to get freeze info' });
  }
});

/**
 * POST /api/habits/reorder
 * Reorder habits
 */
router.post('/reorder', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { order } = req.body; // Array of habit IDs in new order
    
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array' });
    }
    
    // Update sort orders
    await prisma.$transaction(
      order.map((id: string, index: number) =>
        prisma.habit.updateMany({
          where: { id, userId: user.id },
          data: { sortOrder: index },
        })
      )
    );
    
    return res.json({ success: true });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to reorder habits');
    return res.status(500).json({ error: 'Failed to reorder habits' });
  }
});

/**
 * GET /api/habits/stats
 * Get habit statistics for a date range
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const userTimezone = req.userTimezone || 'UTC';
    const daysParam = parseInt(req.query.days as string) || 30;
    const days = Math.min(Math.max(daysParam, 1), 365); // Limit to 1-365 days
    
    const todayStr = getTodayInTimezone(userTimezone);
    const todayDate = new Date(todayStr + 'T12:00:00Z');
    
    const startDate = new Date(todayDate);
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    
    // Get all completions in range
    const completions = await prisma.habitCompletion.findMany({
      where: {
        userId: user.id,
        completedDate: { gte: startDate },
      },
      include: {
        habit: {
          select: { name: true, emoji: true, frequency: true, customDays: true },
        },
      },
    });
    
    // Group by date
    const byDate: Record<string, number> = {};
    completions.forEach(c => {
      const dateStr = new Date(c.completedDate).toISOString().split('T')[0];
      byDate[dateStr] = (byDate[dateStr] || 0) + 1;
    });
    
    // Calculate completion rate (considering frequency)
    const habits = await prisma.habit.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
      select: {
        frequency: true,
        customDays: true,
        dateCreated: true,
      },
    });
    
    // Formatter to convert dateCreated to user's timezone
    const createdDateFormatter = new Intl.DateTimeFormat('en-CA', { 
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    
    // Calculate total possible completions (sum of scheduled days per habit)
    // Only count days since habit was created (in user's timezone)
    let totalPossible = 0;
    for (let i = 0; i < days; i++) {
      const checkDate = new Date(todayDate);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];
      const dayOfWeek = getDayOfWeekFromDateStr(dateStr);
      
      for (const habit of habits) {
        // Skip days before habit was created (using user's timezone)
        const habitCreatedDate = createdDateFormatter.format(new Date(habit.dateCreated));
        if (dateStr < habitCreatedDate) {
          continue;
        }
        
        if (shouldShowHabitOnDay(habit.frequency, habit.customDays, dayOfWeek)) {
          totalPossible++;
        }
      }
    }
    
    const totalCompleted = completions.length;
    const completionRate = totalPossible > 0 ? (totalCompleted / totalPossible) * 100 : 0;
    
    // Best day
    let bestDay = { date: '', count: 0 };
    Object.entries(byDate).forEach(([date, count]) => {
      if (count > bestDay.count) {
        bestDay = { date, count };
      }
    });
    
    return res.json({
      days,
      totalCompletions: totalCompleted,
      totalPossible,
      completionRate: Math.round(completionRate * 10) / 10,
      byDate,
      bestDay,
      totalHabits: habits.length,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get habit stats');
    return res.status(500).json({ error: 'Failed to get habit stats' });
  }
});

export default router;
