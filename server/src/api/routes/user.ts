import { Router, Request, Response } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import { timezoneMiddleware, isValidTimezone } from '../middleware/timezone.js';
import { getUserEntries, countTodayEntries, getEffectiveTier, updateUserTimezone, createEntry, processEntry, logUsage, getTodayVoiceUsageSeconds, getAverageMood, getDateInTimezone, calculateStreak } from '../../services/user.js';
import { getTierLimits, getSubscriptionPricing } from '../../utils/pricing.js';
import { analyzeMood } from '../../services/openai.js';
import { apiLogger } from '../../utils/logger.js';
import { getBot } from '../../bot/index.js';
import { validateTags, validateEntryText, validateMoodScore } from '../../utils/validation.js';
import { 
  STREAK_ENTRIES_LIMIT, 
  STATS_ENTRIES_LIMIT, 
  MAX_ENTRY_TEXT_LENGTH, 
  MAX_TAGS_PER_ENTRY, 
  MAX_TAG_LENGTH,
  STATS_DEFAULT_DAYS,
  STATS_MAX_DAYS,
  STATS_TOP_TAGS_COUNT,
  STATS_WEEKLY_DAYS,
  STATS_MONTHLY_DAYS,
  MOOD_TREND_THRESHOLD
} from '../../config/constants.js';

const router = Router();

// Helper: get mood label from score
const getMoodLabel = (score: number): string => {
  const labels: Record<number, string> = {
    1: 'ужасно', 2: 'очень плохо', 3: 'плохо', 4: 'неважно', 5: 'нормально',
    6: 'неплохо', 7: 'хорошо', 8: 'отлично', 9: 'прекрасно', 10: 'великолепно'
  };
  return labels[score] || 'нормально';
};

// Все роуты требуют аутентификации
router.use(telegramAuth(true));
router.use(timezoneMiddleware());

/**
 * POST /api/user/timezone
 * Обновить таймзону пользователя
 */
router.post('/timezone', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { timezone } = req.body;
    
    if (!timezone || typeof timezone !== 'string') {
      return res.status(400).json({ error: 'Timezone is required' });
    }
    
    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone. Use IANA format (e.g., Europe/Moscow)' });
    }
    
    const updatedUser = await updateUserTimezone(user.id, timezone);
    
    apiLogger.info({ userId: user.id, timezone }, 'User timezone updated');
    
    res.json({ 
      success: true, 
      timezone: updatedUser.timezone 
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to update timezone');
    res.status(500).json({ error: 'Failed to update timezone' });
  }
});

/**
 * GET /api/user/me
 * Получить данные текущего пользователя
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const tier = await getEffectiveTier(user.id);
    const [todayCounts, averageMood] = await Promise.all([
      countTodayEntries(user.id, req.userTimezone),
      getAverageMood(user.id),
    ]);
    const limits = await getTierLimits(tier);
    
    // Calculate streak with timezone awareness
    const entries = await getUserEntries(user.id, { limit: STREAK_ENTRIES_LIMIT });
    const { current: currentStreak } = calculateStreak(entries, req.userTimezone);
    
    res.json({
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      timezone: user.timezone,
      subscriptionTier: tier,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      balanceStars: user.balanceStars,
      isAdmin: user.isAdmin,
      streakDays: currentStreak,
      settings: {
        timezone: user.timezone,
        reminderEnabled: (user as Record<string, unknown>).reminderEnabled as boolean || false,
        reminderTime: (user as Record<string, unknown>).reminderTime as string || null,
        privacyBlurDefault: (user as Record<string, unknown>).privacyBlurDefault as boolean || false,
      },
      stats: {
        totalEntries: user.totalEntriesCount,
        totalVoice: user.totalVoiceCount,
        todayEntries: todayCounts.total,
        todayVoice: todayCounts.voice,
        averageMood: averageMood,
      },
      limits: {
        dailyEntries: limits.dailyEntries,
        voiceAllowed: limits.voiceAllowed,
        voiceMinutesDaily: limits.voiceMinutesDaily,
      },
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get user data');
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

/**
 * POST /api/user/entries
 * Создать новую запись через Web App
 */
router.post('/entries', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { textContent } = req.body;
    
    if (!textContent || typeof textContent !== 'string' || textContent.trim().length === 0) {
      return res.status(400).json({ error: 'Текст записи обязателен' });
    }
    
    if (textContent.length > MAX_ENTRY_TEXT_LENGTH) {
      return res.status(400).json({ error: `Текст слишком длинный (макс ${MAX_ENTRY_TEXT_LENGTH} символов)` });
    }
    
    // Проверяем лимиты
    const todayCounts = await countTodayEntries(user.id, user.timezone || 'UTC');
    const tier = await getEffectiveTier(user.id);
    const limits = await getTierLimits(tier);
    
    if (limits.dailyEntries !== -1 && todayCounts.total >= limits.dailyEntries) {
      return res.status(429).json({ 
        error: 'Дневной лимит записей исчерпан',
        limit: limits.dailyEntries,
        used: todayCounts.total,
      });
    }
    
    // Создаём запись
    const entry = await createEntry({
      userId: user.id,
      textContent: textContent.trim(),
      isVoice: false,
    });
    
    apiLogger.info({ userId: user.id, entryId: entry.id }, 'Entry created via Web App');
    
    // Анализируем настроение через AI
    try {
      const analysisResponse = await analyzeMood(textContent.trim());
      
      // Логируем использование API
      await logUsage({
        userId: user.id,
        entryId: entry.id,
        serviceType: 'gpt_4o_mini',
        modelName: 'gpt-4o-mini',
        inputTokens: analysisResponse.usage?.inputTokens || 0,
        outputTokens: analysisResponse.usage?.outputTokens || 0,
        costUsd: analysisResponse.usage?.costUsd || 0,
      });
      
      // Обновляем запись с результатами анализа
      const processedEntry = await processEntry(entry.id, analysisResponse.result);
      
      res.status(201).json({
        id: processedEntry.id,
        textContent: processedEntry.textContent,
        moodScore: processedEntry.moodScore,
        moodLabel: processedEntry.moodLabel,
        tags: processedEntry.aiTags || [],
        aiSummary: processedEntry.aiSummary,
        aiSuggestions: processedEntry.aiSuggestions,
        isVoice: processedEntry.isVoice,
        isProcessed: processedEntry.isProcessed,
        createdAt: processedEntry.dateCreated?.toISOString() || null,
        dateCreated: processedEntry.dateCreated?.toISOString() || null,
      });
    } catch (aiError) {
      apiLogger.error({ error: aiError, entryId: entry.id }, 'AI analysis failed');
      
      // Возвращаем запись без анализа
      res.status(201).json({
        id: entry.id,
        textContent: entry.textContent,
        moodScore: null,
        moodLabel: null,
        tags: [],
        aiSummary: null,
        aiSuggestions: null,
        isVoice: entry.isVoice,
        isProcessed: false,
        createdAt: entry.dateCreated?.toISOString() || null,
        dateCreated: entry.dateCreated?.toISOString() || null,
      });
    }
  } catch (error) {
    apiLogger.error({ error }, 'Failed to create entry');
    res.status(500).json({ error: 'Не удалось создать запись' });
  }
});

/**
 * GET /api/user/entries/:id
 * Получить конкретную запись по ID
 */
router.get('/entries/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    
    const { prisma } = await import('../../services/database.js');
    
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!entry) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    res.json({
      id: entry.id,
      textContent: entry.textContent,
      moodScore: entry.moodScore,
      moodLabel: entry.moodLabel,
      tags: entry.aiTags || [],
      aiSummary: entry.aiSummary,
      aiSuggestions: entry.aiSuggestions,
      isVoice: entry.isVoice,
      voiceDuration: entry.voiceDurationSeconds,
      voiceFileId: entry.voiceFileId,
      isProcessed: entry.isProcessed,
      createdAt: entry.dateCreated?.toISOString() || null,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get entry');
    res.status(500).json({ error: 'Не удалось загрузить запись' });
  }
});

/**
 * PATCH /api/user/entries/:id
 * Редактировать запись (текст, теги, настроение)
 */
router.patch('/entries/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { textContent, tags, moodScore, moodLabel } = req.body;
    
    // Validate at least one field to update
    const hasTextContent = textContent !== undefined;
    const hasTags = tags !== undefined;
    const hasMood = moodScore !== undefined;
    
    if (!hasTextContent && !hasTags && !hasMood) {
      return res.status(400).json({ error: 'Нужно указать данные для обновления' });
    }
    
    if (hasTextContent) {
      const textError = validateEntryText(textContent);
      if (textError) {
        return res.status(400).json({ error: textError });
      }
    }
    
    if (hasTags && !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Теги должны быть массивом' });
    }
    
    if (hasMood) {
      const moodError = validateMoodScore(moodScore);
      if (moodError) {
        return res.status(400).json({ error: moodError });
      }
    }
    
    const { prisma } = await import('../../services/database.js');
    
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!entry) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    // Build update data
    const updateData: { textContent?: string; aiTags?: string[]; moodScore?: number; moodLabel?: string } = {};
    if (hasTextContent) {
      updateData.textContent = textContent.trim();
    }
    if (hasTags) {
      updateData.aiTags = validateTags(tags as string[]);
    }
    if (hasMood) {
      updateData.moodScore = moodScore;
      updateData.moodLabel = moodLabel || getMoodLabel(moodScore);
    }
    
    const updated = await prisma.journalEntry.update({
      where: { id },
      data: updateData,
    });
    
    apiLogger.info({ userId: user.id, entryId: id }, 'Entry updated');
    
    res.json({
      id: updated.id,
      textContent: updated.textContent,
      moodScore: updated.moodScore,
      moodLabel: updated.moodLabel,
      tags: updated.aiTags || [],
      aiSummary: updated.aiSummary,
      aiSuggestions: updated.aiSuggestions,
      isVoice: updated.isVoice,
      voiceDuration: updated.voiceDurationSeconds,
      voiceFileId: updated.voiceFileId,
      isProcessed: updated.isProcessed,
      createdAt: updated.dateCreated?.toISOString() || null,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to update entry');
    res.status(500).json({ error: 'Не удалось обновить запись' });
  }
});

/**
 * DELETE /api/user/entries/:id
 * Удалить запись
 */
router.delete('/entries/:id', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    
    const { prisma } = await import('../../services/database.js');
    
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!entry) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    // Use transaction to ensure atomicity
    await prisma.$transaction([
      prisma.journalEntry.delete({
        where: { id },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { totalEntriesCount: { decrement: 1 } },
      }),
    ]);
    
    apiLogger.info({ userId: user.id, entryId: id }, 'Entry deleted');
    
    res.json({ success: true });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to delete entry');
    res.status(500).json({ error: 'Не удалось удалить запись' });
  }
});

/**
 * GET /api/user/entries/:id/audio
 * Получить URL аудио файла
 */
router.get('/entries/:id/audio', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    
    apiLogger.info({ userId: user.id, entryId: id }, 'Getting audio for entry');
    
    const { prisma } = await import('../../services/database.js');
    
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });
    
    if (!entry) {
      apiLogger.warn({ userId: user.id, entryId: id }, 'Entry not found for audio');
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    
    apiLogger.info({ entryId: id, isVoice: entry.isVoice, voiceFileId: entry.voiceFileId }, 'Entry found');
    
    if (!entry.isVoice || !entry.voiceFileId) {
      return res.status(400).json({ error: 'Эта запись не содержит аудио' });
    }
    
    // Get file URL from Telegram
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      apiLogger.error('TELEGRAM_BOT_TOKEN not configured');
      return res.status(500).json({ error: 'Bot token not configured' });
    }
    
    const telegramUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${entry.voiceFileId}`;
    apiLogger.info({ voiceFileId: entry.voiceFileId }, 'Requesting file from Telegram');
    
    const fileResponse = await fetch(telegramUrl);
    const fileData = await fileResponse.json() as { ok: boolean; result?: { file_path: string }; description?: string };
    
    apiLogger.info({ telegramResponse: fileData }, 'Telegram getFile response');
    
    if (!fileData.ok || !fileData.result?.file_path) {
      apiLogger.error({ telegramResponse: fileData }, 'Telegram getFile failed');
      return res.status(404).json({ error: 'Аудио файл не найден в Telegram' });
    }
    
    const audioUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    
    res.json({ 
      audioUrl,
      duration: entry.voiceDurationSeconds,
    });
  } catch (error) {
    apiLogger.error({ error, stack: (error as Error).stack }, 'Failed to get audio');
    res.status(500).json({ error: 'Не удалось получить аудио' });
  }
});

/**
 * GET /api/user/entries
 * Получить записи пользователя
 */
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const page = parseInt(req.query.page as string) || 1;
    const offset = (page - 1) * limit;
    
    // Фильтр по дате
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (req.query.startDate) {
      startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      endDate = new Date(req.query.endDate as string);
    }
    
    const entries = await getUserEntries(user.id, {
      limit: limit + 1, // Запрашиваем на 1 больше чтобы узнать есть ли еще
      offset,
      startDate,
      endDate,
    });
    
    // Если получили больше чем лимит - значит есть еще записи
    const hasMore = entries.length > limit;
    const items = hasMore ? entries.slice(0, limit) : entries;
    
    res.json({
      items: items.map((e) => ({
        id: e.id,
        textContent: e.textContent,
        moodScore: e.moodScore,
        moodLabel: e.moodLabel,
        tags: e.aiTags || [],
        aiSummary: e.aiSummary,
        aiSuggestions: e.aiSuggestions,
        isVoice: e.isVoice,
        voiceDuration: e.voiceDurationSeconds,
        isProcessed: e.isProcessed,
        createdAt: e.dateCreated?.toISOString() || null,
        dateCreated: e.dateCreated?.toISOString() || null,
      })),
      page,
      pageSize: limit,
      total: items.length,
      hasMore,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get entries');
    res.status(500).json({ error: 'Failed to get entries' });
  }
});

/**
 * GET /api/user/stats
 * Статистика настроения за период
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const days = Math.min(parseInt(req.query.days as string) || STATS_DEFAULT_DAYS, STATS_MAX_DAYS);
    
    // Get user's tier and limits
    const tier = await getEffectiveTier(user.id);
    const limits = await getTierLimits(tier);
    const todayCounts = await countTodayEntries(user.id, req.userTimezone);
    const todayVoiceSeconds = await getTodayVoiceUsageSeconds(user.id, req.userTimezone);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const entries = await getUserEntries(user.id, {
      limit: STATS_ENTRIES_LIMIT,
      startDate,
    });
    
    // Группируем по дням
    const dailyStats: Record<string, { count: number; avgMood: number; moods: number[] }> = {};
    
    for (const entry of entries) {
      if (!entry.moodScore) continue;
      
      // Convert entry date to user's timezone
      const dateKey = getDateInTimezone(entry.dateCreated, req.userTimezone);
      
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { count: 0, avgMood: 0, moods: [] };
      }
      
      dailyStats[dateKey].count++;
      dailyStats[dateKey].moods.push(entry.moodScore);
    }
    
    // Вычисляем средние
    const chartData = Object.entries(dailyStats)
      .map(([date, data]) => ({
        date,
        count: data.count,
        avgMood: data.moods.reduce((a, b) => a + b, 0) / data.moods.length,
        minMood: Math.min(...data.moods),
        maxMood: Math.max(...data.moods),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Распределение настроения
    const moodDistribution: Record<number, number> = {};
    for (const entry of entries) {
      if (!entry.moodScore) continue;
      moodDistribution[entry.moodScore] = (moodDistribution[entry.moodScore] || 0) + 1;
    }
    
    // Топ теги
    const tagCounts: Record<string, number> = {};
    for (const entry of entries) {
      const tags = entry.aiTags as string[];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, STATS_TOP_TAGS_COUNT)
      .map(([tag, count]) => ({ tag, count }));
    
    // Общая статистика
    const allMoods = entries.filter(e => e.moodScore).map(e => e.moodScore!);
    const avgMood = allMoods.length > 0
      ? allMoods.reduce((a, b) => a + b, 0) / allMoods.length
      : 0;
    
    // Weekly moods for chart (last N days in user's timezone)
    const weeklyMoods: Array<{ date: string; score: number }> = [];
    const now = new Date();
    for (let i = STATS_WEEKLY_DAYS - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 86400000);
      const dateKey = getDateInTimezone(date, req.userTimezone);
      const dayData = dailyStats[dateKey];
      weeklyMoods.push({
        date: dateKey,
        score: dayData ? Math.round(dayData.moods.reduce((a, b) => a + b, 0) / dayData.moods.length) : 0,
      });
    }
    
    // Calculate streaks with timezone awareness
    const { current: currentStreak, longest: longestStreak } = calculateStreak(entries, req.userTimezone);
    
    // Calculate mood trend (compare last 7 days to previous 7 days)
    const last7Days = weeklyMoods.filter(m => m.score > 0).map(m => m.score);
    const avgLast7 = last7Days.length > 0 ? last7Days.reduce((a, b) => a + b, 0) / last7Days.length : 0;
    
    // Previous N days in user's timezone
    const prev7Moods: number[] = [];
    const now2 = new Date();
    for (let i = STATS_WEEKLY_DAYS * 2 - 1; i >= STATS_WEEKLY_DAYS; i--) {
      const date = new Date(now2.getTime() - i * 86400000);
      const dateKey = getDateInTimezone(date, req.userTimezone);
      const dayData = dailyStats[dateKey];
      if (dayData && dayData.moods.length > 0) {
        prev7Moods.push(dayData.moods.reduce((a, b) => a + b, 0) / dayData.moods.length);
      }
    }
    const avgPrev7 = prev7Moods.length > 0 ? prev7Moods.reduce((a, b) => a + b, 0) / prev7Moods.length : 0;
    
    let moodTrend: 'up' | 'down' | 'stable' = 'stable';
    let trendPercentage = 0;
    
    if (avgLast7 > 0 && avgPrev7 > 0) {
      trendPercentage = Math.round(((avgLast7 - avgPrev7) / avgPrev7) * 100);
      if (avgLast7 > avgPrev7 + MOOD_TREND_THRESHOLD) moodTrend = 'up';
      else if (avgLast7 < avgPrev7 - MOOD_TREND_THRESHOLD) moodTrend = 'down';
    }
    
    // Monthly moods for chart (last N days in user's timezone)
    const monthlyMoods: Array<{ date: string; score: number }> = [];
    const now3 = new Date();
    for (let i = STATS_MONTHLY_DAYS - 1; i >= 0; i--) {
      const date = new Date(now3.getTime() - i * 86400000);
      const dateKey = getDateInTimezone(date, req.userTimezone);
      const dayData = dailyStats[dateKey];
      monthlyMoods.push({
        date: dateKey,
        score: dayData ? Math.round(dayData.moods.reduce((a, b) => a + b, 0) / dayData.moods.length) : 0,
      });
    }
    
    // Today's counts
    
    // Calculate today's voice usage in minutes
    const todayVoiceMinutes = Math.round(todayVoiceSeconds / 60);
    
    res.json({
      tier,
      totalEntries: entries.length,
      todayEntries: todayCounts.total,
      todayVoice: todayVoiceMinutes,
      dailyLimit: limits.dailyEntries === -1 ? null : limits.dailyEntries,
      voiceLimit: limits.voiceMinutesDaily === -1 ? null : limits.voiceMinutesDaily,
      averageMood: Math.round(avgMood * 10) / 10,
      currentStreak,
      longestStreak,
      moodTrend,
      trendPercentage,
      weeklyMoods,
      monthlyMoods,
      // Additional data
      period: { days, startDate, endDate: new Date() },
      summary: {
        totalEntries: entries.length,
        avgMood: Math.round(avgMood * 10) / 10,
        minMood: allMoods.length > 0 ? Math.min(...allMoods) : 0,
        maxMood: allMoods.length > 0 ? Math.max(...allMoods) : 0,
      },
      chartData,
      moodDistribution,
      topTags,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get stats');
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/user/subscription
 * Информация о подписках
 */
router.get('/subscription', async (req: Request, res: Response) => {
  const user = req.user!;
  const tier = await getEffectiveTier(user.id);
  
  // Get prices from config (async)
  const [basicPricing, premiumPricing] = await Promise.all([
    getSubscriptionPricing('basic'),
    getSubscriptionPricing('premium'),
  ]);
  
  res.json({
    currentTier: tier,
    expiresAt: user.subscriptionExpiresAt,
    prices: {
      basic: basicPricing,
      premium: premiumPricing,
    },
  });
});

/**
 * GET /api/user/subscription/plans
 * Получение информации о планах подписки
 */
router.get('/subscription/plans', async (_req: Request, res: Response) => {
  try {
    const { configService } = await import('../../services/config.js');
    
    const [basicPricing, premiumPricing] = await Promise.all([
      getSubscriptionPricing('basic'),
      getSubscriptionPricing('premium'),
    ]);
    
    // Get customizable features from config (stored as JSON type)
    const basicFeatures = await configService.getJson<string[]>('subscription.basic.features', []);
    const premiumFeatures = await configService.getJson<string[]>('subscription.premium.features', []);
    const basicName = await configService.getString('subscription.basic.name', 'Basic');
    const premiumName = await configService.getString('subscription.premium.name', 'Premium');
    
    // Get promo banner config
    const promoEnabled = await configService.getBool('promo.stars_banner.enabled', false);
    let promo = null;
    
    if (promoEnabled) {
      promo = {
        enabled: true,
        title: await configService.getString('promo.stars_banner.title', '⭐ Купить Stars дешевле'),
        subtitle: await configService.getString('promo.stars_banner.subtitle', 'Экономия до 40%'),
        buttonText: await configService.getString('promo.stars_banner.button_text', 'Перейти →'),
        url: await configService.getString('promo.stars_banner.url', ''),
        discount: await configService.getNumber('promo.stars_banner.discount', 30),
        gradient: await configService.getString('promo.stars_banner.gradient', 'from-yellow-400 to-orange-500'),
      };
    }
    
    res.json({
      basic: {
        name: basicName,
        stars: basicPricing.stars,
        durationDays: basicPricing.durationDays,
        features: basicFeatures,
      },
      premium: {
        name: premiumName,
        stars: premiumPricing.stars,
        durationDays: premiumPricing.durationDays,
        features: premiumFeatures,
      },
      promo,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get subscription plans');
    res.status(500).json({ error: 'Failed to get subscription plans' });
  }
});

/**
 * POST /api/user/subscription/invoice
 * Создание инвойса для оплаты подписки через Telegram Stars
 */
router.post('/subscription/invoice', async (req: Request, res: Response) => {
  try {
    const { tier } = req.body as { tier: 'basic' | 'premium' };
    
    if (!tier || !['basic', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be "basic" or "premium"' });
    }
    
    const bot = getBot();
    if (!bot) {
      apiLogger.error('Bot not initialized');
      return res.status(500).json({ error: 'Bot not available' });
    }
    
    const pricing = await getSubscriptionPricing(tier);
    
    // Создаём invoice link через бота
    // provider_token должен быть пустой строкой для Telegram Stars (XTR)
    const invoiceUrl = await bot.api.createInvoiceLink(
      `Подписка ${tier === 'basic' ? 'Basic' : 'Premium'}`,
      `Ежемесячная подписка на AI Mindful Journal (${pricing.durationDays} дней)`,
      `sub_${tier}_${req.user!.telegramId}_${Date.now()}`,
      '', // provider_token - пустой для Telegram Stars
      'XTR', // Telegram Stars currency
      [{ label: 'Подписка', amount: pricing.stars }]
    );
    
    res.json({ invoiceUrl });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to create subscription invoice');
    res.status(500).json({ error: 'Failed to create subscription invoice' });
  }
});

/**
 * POST /api/user/subscription/crypto-invoice
 * Создание инвойса для оплаты подписки через CryptoPay
 */
router.post('/subscription/crypto-invoice', async (req: Request, res: Response) => {
  try {
    const { tier } = req.body as { tier: 'basic' | 'premium' };
    
    if (!tier || !['basic', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be "basic" or "premium"' });
    }
    
    const { createSubscriptionInvoice, cryptoPayService } = await import('../../services/cryptopay.js');
    
    const enabled = await cryptoPayService.isEnabled();
    if (!enabled) {
      return res.status(400).json({ error: 'Crypto payments are not enabled' });
    }
    
    const result = await createSubscriptionInvoice(
      tier,
      req.user!.id,
      String(req.user!.telegramId)
    );
    
    if (!result) {
      return res.status(500).json({ error: 'Failed to create crypto invoice' });
    }
    
    apiLogger.info({
      userId: req.user!.id,
      tier,
      invoiceId: result.invoiceId,
    }, 'Crypto invoice created');
    
    res.json({
      invoiceUrl: result.invoiceUrl,
      invoiceId: result.invoiceId,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to create crypto invoice');
    res.status(500).json({ error: 'Failed to create crypto invoice' });
  }
});

/**
 * GET /api/user/subscription/crypto-prices
 * Получение крипто-цен для подписок
 */
router.get('/subscription/crypto-prices', async (_req: Request, res: Response) => {
  try {
    const { getCryptoPricing, cryptoPayService } = await import('../../services/cryptopay.js');
    
    const enabled = await cryptoPayService.isEnabled();
    
    const [basicPricing, premiumPricing] = await Promise.all([
      getCryptoPricing('basic'),
      getCryptoPricing('premium'),
    ]);
    
    res.json({
      enabled,
      basic: basicPricing,
      premium: premiumPricing,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get crypto prices');
    res.status(500).json({ error: 'Failed to get crypto prices' });
  }
});

/**
 * GET /api/user/export
 * Экспорт всех записей пользователя (JSON/CSV)
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const format = (req.query.format as string) || 'json';
    const tier = await getEffectiveTier(user.id);
    
    // Только для платных подписок
    if (tier === 'free') {
      return res.status(403).json({ error: 'Export is available for Premium users only' });
    }
    
    const entries = await getUserEntries(user.id, { limit: 1000 }); // Max 1000 entries
    
    if (format === 'csv') {
      // CSV format
      const csvHeader = 'id,date,mood_score,mood_label,text,tags\n';
      const csvRows = entries.map(e => {
        const text = (e.textContent || '').replace(/"/g, '""').replace(/\n/g, ' ');
        const tags = ((e.aiTags as string[]) || []).join('; ');
        const date = e.dateCreated ? new Date(e.dateCreated).toISOString() : '';
        return `"${e.id}","${date}","${e.moodScore || ''}","${e.moodLabel || ''}","${text}","${tags}"`;
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mindful-journal-export-${Date.now()}.csv"`);
      res.send(csvHeader + csvRows);
    } else {
      // JSON format
      const exportData = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          timezone: user.timezone,
        },
        entriesCount: entries.length,
        entries: entries.map(e => ({
          id: e.id,
          date: e.dateCreated,
          moodScore: e.moodScore,
          moodLabel: e.moodLabel,
          text: e.textContent,
          tags: e.aiTags,
          isVoice: !!e.voiceFileId,
        })),
      };
      
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mindful-journal-export-${Date.now()}.json"`);
      res.json(exportData);
    }
    
    apiLogger.info({ userId: user.id, format, count: entries.length }, 'User exported data');
  } catch (error) {
    apiLogger.error({ error }, 'Failed to export data');
    res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * GET /api/user/settings
 * Получить настройки пользователя
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    
    res.json({
      timezone: user.timezone,
      reminderEnabled: (user as Record<string, unknown>).reminderEnabled as boolean || false,
      reminderTime: (user as Record<string, unknown>).reminderTime as string || null,
      privacyBlurDefault: (user as Record<string, unknown>).privacyBlurDefault as boolean || false,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get settings');
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT /api/user/settings
 * Обновить настройки пользователя
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { timezone, reminderEnabled, reminderTime, privacyBlurDefault } = req.body;
    
    const updateData: Record<string, unknown> = {};
    
    if (timezone !== undefined) {
      if (!isValidTimezone(timezone)) {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
      updateData.timezone = timezone;
    }
    
    if (reminderEnabled !== undefined) {
      updateData.reminderEnabled = Boolean(reminderEnabled);
    }
    
    if (reminderTime !== undefined) {
      // Validate time format HH:MM
      if (reminderTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(reminderTime)) {
        return res.status(400).json({ error: 'Invalid time format. Use HH:MM' });
      }
      updateData.reminderTime = reminderTime || null;
    }
    
    if (privacyBlurDefault !== undefined) {
      updateData.privacyBlurDefault = Boolean(privacyBlurDefault);
    }
    
    const { prisma } = await import('../../services/database.js');
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });
    
    apiLogger.info({ userId: user.id, settings: updateData }, 'User settings updated');
    
    res.json({
      timezone: updatedUser.timezone,
      reminderEnabled: (updatedUser as Record<string, unknown>).reminderEnabled as boolean || false,
      reminderTime: (updatedUser as Record<string, unknown>).reminderTime as string || null,
      privacyBlurDefault: (updatedUser as Record<string, unknown>).privacyBlurDefault as boolean || false,
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to update settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
