import { Router, Request, Response } from 'express';
import { telegramAuth } from '../middleware/auth.js';
import { timezoneMiddleware, isValidTimezone } from '../middleware/timezone.js';
import { getUserEntries, countTodayEntries, getEffectiveTier, updateUserTimezone } from '../../services/user.js';
import { getTierLimits, SUBSCRIPTION_PRICES } from '../../utils/pricing.js';
import { apiLogger } from '../../utils/logger.js';

const router = Router();

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
    const todayCounts = await countTodayEntries(user.id, req.userTimezone);
    const limits = await getTierLimits(tier);
    
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
      stats: {
        totalEntries: user.totalEntriesCount,
        totalVoice: user.totalVoiceCount,
        todayEntries: todayCounts.total,
        todayVoice: todayCounts.voice,
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
 * GET /api/user/entries
 * Получить записи пользователя
 */
router.get('/entries', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
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
      limit,
      offset,
      startDate,
      endDate,
    });
    
    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        textContent: e.textContent,
        moodScore: e.moodScore,
        moodLabel: e.moodLabel,
        aiTags: e.aiTags,
        aiSummary: e.aiSummary,
        aiSuggestions: e.aiSuggestions,
        isVoice: e.isVoice,
        voiceDuration: e.voiceDurationSeconds,
        isProcessed: e.isProcessed,
        createdAt: e.dateCreated,
      })),
      pagination: {
        limit,
        offset,
        hasMore: entries.length === limit,
      },
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
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const entries = await getUserEntries(user.id, {
      limit: 1000,
      startDate,
    });
    
    // Группируем по дням
    const dailyStats: Record<string, { count: number; avgMood: number; moods: number[] }> = {};
    
    for (const entry of entries) {
      if (!entry.moodScore) continue;
      
      const dateKey = entry.dateCreated.toISOString().split('T')[0];
      
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
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
    
    // Общая статистика
    const allMoods = entries.filter(e => e.moodScore).map(e => e.moodScore!);
    const avgMood = allMoods.length > 0
      ? allMoods.reduce((a, b) => a + b, 0) / allMoods.length
      : 0;
    
    res.json({
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
  
  res.json({
    currentTier: tier,
    expiresAt: user.subscriptionExpiresAt,
    prices: SUBSCRIPTION_PRICES,
  });
});

export default router;
