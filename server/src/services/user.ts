import { prisma } from './database.js';
import { Prisma, User, JournalEntry, SubscriptionTier } from '@prisma/client';
import { dbLogger } from '../utils/logger.js';
import { SUBSCRIPTION_PRICES } from '../utils/pricing.js';
import type { MoodAnalysisResult } from './openai.js';

// ============================================
// USER SERVICE
// ============================================

export interface CreateUserData {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}

/**
 * Получить или создать пользователя по Telegram ID
 */
export async function getOrCreateUser(data: CreateUserData): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { telegramId: data.telegramId },
  });
  
  if (existing) {
    // Обновляем данные если изменились
    if (
      existing.username !== data.username ||
      existing.firstName !== data.firstName
    ) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          username: data.username,
          firstName: data.firstName,
          lastName: data.lastName,
        },
      });
    }
    return existing;
  }
  
  dbLogger.info({ telegramId: data.telegramId.toString() }, 'Creating new user');
  
  return prisma.user.create({
    data: {
      telegramId: data.telegramId,
      username: data.username,
      firstName: data.firstName,
      lastName: data.lastName,
      languageCode: data.languageCode || 'ru',
    },
  });
}

/**
 * Получить пользователя по Telegram ID
 */
export async function getUserByTelegramId(telegramId: bigint): Promise<User | null> {
  return prisma.user.findUnique({
    where: { telegramId },
  });
}

/**
 * Обновить таймзону пользователя
 */
export async function updateUserTimezone(userId: string, timezone: string): Promise<User> {
  dbLogger.info({ userId, timezone }, 'Updating user timezone');
  
  // Use raw SQL to bypass Prisma cache issue
  await prisma.$executeRaw`UPDATE app.users SET timezone = ${timezone} WHERE id = ${userId}`;
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  return user;
}

/**
 * Проверить, является ли пользователь админом
 */
export async function isUserAdmin(telegramId: bigint): Promise<boolean> {
  const user = await getUserByTelegramId(telegramId);
  return user?.isAdmin ?? false;
}

/**
 * Проверить, есть ли у пользователя активная подписка
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user) return false;
  if (user.subscriptionTier === 'free') return false;
  if (!user.subscriptionExpiresAt) return false;
  
  return user.subscriptionExpiresAt > new Date();
}

/**
 * Получить эффективный тариф пользователя
 */
export async function getEffectiveTier(userId: string): Promise<SubscriptionTier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user) return 'free';
  
  // Если подписка истекла — возвращаем free
  if (user.subscriptionTier !== 'free' && user.subscriptionExpiresAt) {
    if (user.subscriptionExpiresAt < new Date()) {
      // Автоматически понижаем до free
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'free' },
      });
      return 'free';
    }
  }
  
  return user.subscriptionTier;
}

// ============================================
// JOURNAL ENTRY SERVICE
// ============================================

export interface CreateEntryData {
  userId: string;
  textContent: string;
  isVoice?: boolean;
  voiceFileId?: string;
  voiceDurationSeconds?: number;
}

export interface ProcessEntryData {
  moodScore: number;
  moodLabel: string;
  aiTags: string[];
  aiSummary: string;
  aiSuggestions: string;
}

/**
 * Создать запись дневника
 */
export async function createEntry(data: CreateEntryData): Promise<JournalEntry> {
  dbLogger.debug({ userId: data.userId, isVoice: data.isVoice }, 'Creating journal entry');
  
  return prisma.journalEntry.create({
    data: {
      userId: data.userId,
      textContent: data.textContent,
      isVoice: data.isVoice || false,
      voiceFileId: data.voiceFileId,
      voiceDurationSeconds: data.voiceDurationSeconds,
    },
  });
}

/**
 * Обновить запись после AI анализа
 */
export async function processEntry(
  entryId: string,
  analysis: MoodAnalysisResult
): Promise<JournalEntry> {
  return prisma.journalEntry.update({
    where: { id: entryId },
    data: {
      moodScore: analysis.moodScore,
      moodLabel: analysis.moodLabel,
      aiTags: analysis.tags,
      aiSummary: analysis.summary,
      aiSuggestions: analysis.suggestions,
      isProcessed: true,
    },
  });
}

/**
 * Отметить ошибку обработки
 */
export async function markEntryError(
  entryId: string,
  error: string
): Promise<JournalEntry> {
  return prisma.journalEntry.update({
    where: { id: entryId },
    data: {
      isProcessed: true,
      processingError: error,
    },
  });
}

/**
 * Получить записи пользователя
 */
export async function getUserEntries(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<JournalEntry[]> {
  const { limit = 50, offset = 0, startDate, endDate } = options || {};
  
  const where: Prisma.JournalEntryWhereInput = {
    userId,
  };
  
  if (startDate || endDate) {
    where.dateCreated = {};
    if (startDate) where.dateCreated.gte = startDate;
    if (endDate) where.dateCreated.lte = endDate;
  }
  
  return prisma.journalEntry.findMany({
    where,
    orderBy: { dateCreated: 'desc' },
    take: limit,
    skip: offset,
  });
}

/**
 * Подсчитать записи за сегодня (с учётом таймзоны)
 */
export async function countTodayEntries(
  userId: string,
  timezone: string = 'UTC'
): Promise<{ total: number; voice: number }> {
  // Get today's boundaries in user's timezone
  const { start, end } = getTodayBoundsForTimezone(timezone);
  
  const [total, voice] = await Promise.all([
    prisma.journalEntry.count({
      where: {
        userId,
        dateCreated: { 
          gte: start,
          lte: end,
        },
      },
    }),
    prisma.journalEntry.count({
      where: {
        userId,
        dateCreated: { 
          gte: start,
          lte: end,
        },
        isVoice: true,
      },
    }),
  ]);
  
  return { total, voice };
}

/**
 * Получить границы "сегодня" в указанной таймзоне (возвращает UTC Date)
 */
function getTodayBoundsForTimezone(timezone: string): { start: Date; end: Date } {
  const now = new Date();
  
  // Get the current date in user's timezone (YYYY-MM-DD format)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(now);
  
  // Create date objects for start and end of day
  // We need to find what UTC time corresponds to 00:00 and 23:59:59 in user's timezone
  const startLocal = new Date(`${todayStr}T00:00:00`);
  const endLocal = new Date(`${todayStr}T23:59:59.999`);
  
  // Get offset for the timezone
  const getOffset = (date: Date) => {
    const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tz = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return (tz.getTime() - utc.getTime()) / (1000 * 60);
  };
  
  const startOffset = getOffset(startLocal);
  const endOffset = getOffset(endLocal);
  
  // Convert to UTC
  const startUTC = new Date(startLocal.getTime() - startOffset * 60 * 1000);
  const endUTC = new Date(endLocal.getTime() - endOffset * 60 * 1000);
  
  return { start: startUTC, end: endUTC };
}

/**
 * Получить записи пользователя за "сегодня" с учётом таймзоны
 */
export async function getTodayEntries(
  userId: string,
  timezone: string = 'UTC'
): Promise<JournalEntry[]> {
  const { start, end } = getTodayBoundsForTimezone(timezone);
  
  return prisma.journalEntry.findMany({
    where: {
      userId,
      dateCreated: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { dateCreated: 'desc' },
  });
}

// ============================================
// USAGE LOG SERVICE
// ============================================

export interface LogUsageData {
  userId: string;
  entryId?: string;
  serviceType: 'gpt_4o_mini' | 'whisper_1';
  modelName: string;
  inputTokens?: number;
  outputTokens?: number;
  durationSeconds?: number;
  costUsd: number;
  requestId?: string;
  latencyMs?: number;
}

/**
 * Записать использование API
 */
export async function logUsage(data: LogUsageData): Promise<void> {
  await prisma.usageLog.create({
    data: {
      userId: data.userId,
      entryId: data.entryId,
      serviceType: data.serviceType,
      modelName: data.modelName,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      durationSeconds: data.durationSeconds || 0,
      costUsd: new Prisma.Decimal(data.costUsd),
      requestId: data.requestId,
      latencyMs: data.latencyMs,
    },
  });
  
  // Обновляем total_spend_usd пользователя
  await prisma.user.update({
    where: { id: data.userId },
    data: {
      totalSpendUsd: {
        increment: new Prisma.Decimal(data.costUsd),
      },
    },
  });
  
  dbLogger.debug({ userId: data.userId, costUsd: data.costUsd }, 'Usage logged');
}

// ============================================
// SUBSCRIPTION SERVICE
// ============================================

/**
 * Активировать подписку
 */
export async function activateSubscription(
  userId: string,
  tier: 'basic' | 'premium',
  transactionId?: string
): Promise<void> {
  const pricing = SUBSCRIPTION_PRICES[tier];
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + pricing.durationDays);
  
  await prisma.$transaction([
    // Создаём запись подписки
    prisma.subscription.create({
      data: {
        userId,
        transactionId,
        tier,
        expiresAt,
        priceStars: pricing.stars,
        priceUsd: new Prisma.Decimal(pricing.usd),
      },
    }),
    // Обновляем пользователя
    prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: tier,
        subscriptionExpiresAt: expiresAt,
      },
    }),
  ]);
  
  dbLogger.info({ userId, tier, expiresAt }, 'Subscription activated');
}

// ============================================
// STATS SERVICE (для админки)
// ============================================

export interface DashboardStats {
  todayApiCost: number;
  todayRevenue: number;
  todayProfit: number;
  totalUsers: number;
  premiumUsers: number;
  todayEntries: number;
}

/**
 * Получить статистику для админ-дашборда
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [
    todayUsage,
    todayTransactions,
    userStats,
    todayEntriesCount,
  ] = await Promise.all([
    // API расходы за сегодня
    prisma.usageLog.aggregate({
      where: { dateCreated: { gte: today } },
      _sum: { costUsd: true },
    }),
    // Доходы за сегодня
    prisma.transaction.aggregate({
      where: {
        dateCreated: { gte: today },
        isSuccessful: true,
      },
      _sum: { amountUsd: true },
    }),
    // Статистика пользователей
    prisma.user.groupBy({
      by: ['subscriptionTier'],
      where: { status: 'active' },
      _count: true,
    }),
    // Записей за сегодня
    prisma.journalEntry.count({
      where: { dateCreated: { gte: today } },
    }),
  ]);
  
  const todayApiCost = Number(todayUsage._sum.costUsd || 0);
  const todayRevenue = Number(todayTransactions._sum.amountUsd || 0);
  
  const totalUsers = userStats.reduce((sum, s) => sum + s._count, 0);
  const premiumUsers = userStats
    .filter(s => s.subscriptionTier !== 'free')
    .reduce((sum, s) => sum + s._count, 0);
  
  return {
    todayApiCost,
    todayRevenue,
    todayProfit: todayRevenue - todayApiCost,
    totalUsers,
    premiumUsers,
    todayEntries: todayEntriesCount,
  };
}

export default {
  getOrCreateUser,
  getUserByTelegramId,
  isUserAdmin,
  hasActiveSubscription,
  getEffectiveTier,
  createEntry,
  processEntry,
  markEntryError,
  getUserEntries,
  countTodayEntries,
  getTodayEntries,
  logUsage,
  activateSubscription,
  getDashboardStats,
};
