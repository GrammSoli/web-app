import { Router, Request, Response } from 'express';
import { telegramAuth, adminOnly } from '../middleware/auth.js';
import { getDashboardStats } from '../../services/user.js';
import { prisma } from '../../services/database.js';
import { apiLogger } from '../../utils/logger.js';

const router = Router();

// Все админ роуты требуют аутентификации + админ права
router.use(telegramAuth(true));
router.use(adminOnly());

/**
 * GET /api/admin/dashboard
 * Основная статистика для дашборда
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const stats = await getDashboardStats();
    
    res.json({
      today: {
        apiCost: stats.todayApiCost,
        revenue: stats.todayRevenue,
        profit: stats.todayProfit,
        entries: stats.todayEntries,
      },
      users: {
        total: stats.totalUsers,
        premium: stats.premiumUsers,
      },
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get dashboard stats');
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

/**
 * GET /api/admin/usage
 * Детальная статистика использования API
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Группировка по дням и типам сервисов
    const dailyUsage = await prisma.$queryRaw<Array<{
      date: Date;
      service_type: string;
      requests: bigint;
      total_cost: number;
      total_tokens: bigint;
      total_duration: bigint;
    }>>`
      SELECT 
        DATE(date_created) as date,
        service_type,
        COUNT(*) as requests,
        SUM(cost_usd)::float as total_cost,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(duration_seconds) as total_duration
      FROM usage_logs
      WHERE date_created >= ${startDate}
      GROUP BY DATE(date_created), service_type
      ORDER BY date DESC
    `;
    
    // Преобразуем в удобный формат
    const chartData: Record<string, {
      date: string;
      gpt4oMini: { requests: number; cost: number; tokens: number };
      whisper: { requests: number; cost: number; duration: number };
      totalCost: number;
    }> = {};
    
    for (const row of dailyUsage) {
      const dateKey = row.date.toISOString().split('T')[0];
      
      if (!chartData[dateKey]) {
        chartData[dateKey] = {
          date: dateKey,
          gpt4oMini: { requests: 0, cost: 0, tokens: 0 },
          whisper: { requests: 0, cost: 0, duration: 0 },
          totalCost: 0,
        };
      }
      
      if (row.service_type === 'gpt-4o-mini') {
        chartData[dateKey].gpt4oMini = {
          requests: Number(row.requests),
          cost: row.total_cost,
          tokens: Number(row.total_tokens),
        };
      } else if (row.service_type === 'whisper-1') {
        chartData[dateKey].whisper = {
          requests: Number(row.requests),
          cost: row.total_cost,
          duration: Number(row.total_duration),
        };
      }
      
      chartData[dateKey].totalCost += row.total_cost;
    }
    
    // Итоговая статистика
    const summary = await prisma.usageLog.aggregate({
      where: { dateCreated: { gte: startDate } },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true, durationSeconds: true },
      _count: true,
    });
    
    res.json({
      period: { days, startDate, endDate: new Date() },
      summary: {
        totalRequests: summary._count,
        totalCost: Number(summary._sum.costUsd || 0),
        totalTokens: (summary._sum.inputTokens || 0) + (summary._sum.outputTokens || 0),
        totalAudioMinutes: Math.round((summary._sum.durationSeconds || 0) / 60),
      },
      chartData: Object.values(chartData).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get usage stats');
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

/**
 * GET /api/admin/revenue
 * Статистика доходов
 */
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const dailyRevenue = await prisma.$queryRaw<Array<{
      date: Date;
      transaction_type: string;
      count: bigint;
      total_stars: bigint;
      total_usd: number;
    }>>`
      SELECT 
        DATE(date_created) as date,
        transaction_type,
        COUNT(*) as count,
        SUM(amount_stars) as total_stars,
        SUM(amount_usd)::float as total_usd
      FROM transactions
      WHERE date_created >= ${startDate} AND is_successful = true
      GROUP BY DATE(date_created), transaction_type
      ORDER BY date DESC
    `;
    
    // Итоговая статистика
    const summary = await prisma.transaction.aggregate({
      where: { dateCreated: { gte: startDate }, isSuccessful: true },
      _sum: { amountStars: true, amountUsd: true },
      _count: true,
    });
    
    res.json({
      period: { days, startDate, endDate: new Date() },
      summary: {
        totalTransactions: summary._count,
        totalStars: summary._sum.amountStars || 0,
        totalUsd: Number(summary._sum.amountUsd || 0),
      },
      dailyRevenue: dailyRevenue.map(r => ({
        date: r.date.toISOString().split('T')[0],
        type: r.transaction_type,
        count: Number(r.count),
        stars: Number(r.total_stars),
        usd: r.total_usd,
      })),
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get revenue stats');
    res.status(500).json({ error: 'Failed to get revenue stats' });
  }
});

/**
 * GET /api/admin/users
 * Список пользователей
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const sortBy = (req.query.sortBy as string) || 'dateCreated';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';
    
    const users = await prisma.user.findMany({
      take: limit,
      skip: offset,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        balanceStars: true,
        totalEntriesCount: true,
        totalSpendUsd: true,
        status: true,
        isAdmin: true,
        dateCreated: true,
      },
    });
    
    const total = await prisma.user.count();
    
    res.json({
      users: users.map(u => ({
        ...u,
        telegramId: u.telegramId.toString(),
        totalSpendUsd: Number(u.totalSpendUsd),
      })),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + users.length < total,
      },
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get users');
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * GET /api/admin/transactions
 * Последние транзакции
 */
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const transactions = await prisma.transaction.findMany({
      take: limit,
      skip: offset,
      orderBy: { dateCreated: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            firstName: true,
          },
        },
      },
    });
    
    res.json({
      transactions: transactions.map(t => ({
        id: t.id,
        user: {
          username: t.user.username,
          firstName: t.user.firstName,
        },
        type: t.transactionType,
        stars: t.amountStars,
        usd: Number(t.amountUsd),
        isSuccessful: t.isSuccessful,
        createdAt: t.dateCreated,
      })),
    });
  } catch (error) {
    apiLogger.error({ error }, 'Failed to get transactions');
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

export default router;
