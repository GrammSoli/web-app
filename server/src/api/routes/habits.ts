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
 * Calculate streak for a habit
 */
function calculateHabitStreak(completions: { completedDate: Date }[]): { current: number; longest: number } {
  if (completions.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Sort by date descending
  const dates = completions
    .map(c => new Date(c.completedDate))
    .sort((a, b) => b.getTime() - a.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;
  
  // Check if completed today or yesterday to start streak
  const lastCompletion = dates[0];
  lastCompletion.setHours(0, 0, 0, 0);
  
  if (lastCompletion.getTime() === today.getTime() || lastCompletion.getTime() === yesterday.getTime()) {
    currentStreak = 1;
    
    // Count consecutive days
    for (let i = 1; i < dates.length; i++) {
      const current = dates[i];
      const prev = dates[i - 1];
      current.setHours(0, 0, 0, 0);
      prev.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((prev.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        currentStreak++;
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
        break;
      }
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
    
    // Format response
    const habitsWithStats: HabitWithStats[] = habits.map(habit => {
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
    
    // Calculate daily progress
    const totalHabits = habitsWithStats.length;
    const completedToday = habitsWithStats.filter(h => h.completedToday).length;
    
    return res.json({
      habits: habitsWithStats,
      stats: {
        totalHabits,
        completedToday,
        maxHabits,
        canCreateMore: totalHabits < maxHabits,
      },
      weekDates,
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
    
    // Recalculate streak
    const allCompletions = await prisma.habitCompletion.findMany({
      where: { habitId: id },
      select: { completedDate: true },
      orderBy: { completedDate: 'desc' },
    });
    
    const { current, longest } = calculateHabitStreak(allCompletions);
    
    // Update habit stats
    await prisma.habit.update({
      where: { id },
      data: {
        currentStreak: current,
        longestStreak: Math.max(habit.longestStreak, longest),
        totalCompletions: allCompletions.length,
      },
    });
    
    // Check if all habits completed for the target date (for confetti)
    // Use date strings for consistent comparison
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
    
    const allCompleted = allHabits.length > 0 && allHabits.every(h => h.completions.length > 0);
    
    apiLogger.info({ 
      userId: user.id, 
      habitId: id, 
      completed, 
      streak: current,
      allCompleted,
    }, 'Habit toggled');
    
    return res.json({
      completed,
      currentStreak: current,
      longestStreak: Math.max(habit.longestStreak, longest),
      totalCompletions: allCompletions.length,
      allCompleted, // For triggering confetti!
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to toggle habit');
    return res.status(500).json({ error: 'Failed to toggle habit' });
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
    const days = parseInt(req.query.days as string) || 30;
    
    const startDate = new Date();
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
          select: { name: true, emoji: true },
        },
      },
    });
    
    // Group by date
    const byDate: Record<string, number> = {};
    completions.forEach(c => {
      const dateStr = new Date(c.completedDate).toISOString().split('T')[0];
      byDate[dateStr] = (byDate[dateStr] || 0) + 1;
    });
    
    // Calculate completion rate
    const habits = await prisma.habit.findMany({
      where: {
        userId: user.id,
        isActive: true,
        isArchived: false,
      },
    });
    
    const totalPossible = habits.length * days;
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
