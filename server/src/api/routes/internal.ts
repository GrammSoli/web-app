import { Router, Request, Response } from 'express';
import { internalAuth, internalLimiter } from '../middleware/index.js';
import { prisma } from '../../services/database.js';
import { getBot } from '../../bot/index.js';
import { configService } from '../../services/config.js';
import { apiLogger } from '../../utils/logger.js';
import { SubscriptionTier } from '@prisma/client';

const router = Router();

// Внутренние API требуют специальный ключ
router.use(internalAuth());
router.use(internalLimiter);

/**
 * POST /api/internal/broadcast
 * Отправка рассылки (вызывается из Directus Flow)
 */
router.post('/broadcast', async (req: Request, res: Response) => {
  const { broadcast_id, message_text, target_audience, message_photo_url } = req.body;
  
  if (!broadcast_id || !message_text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    apiLogger.info({ broadcast_id, target_audience }, 'Starting broadcast');
    
    // Получаем список получателей
    type WhereClause = {
      status: 'active';
      subscriptionTier?: { in: SubscriptionTier[] } | SubscriptionTier;
    };
    
    const where: WhereClause = { status: 'active' };
    
    if (target_audience === 'premium') {
      where.subscriptionTier = { in: ['basic', 'premium'] as SubscriptionTier[] };
    } else if (target_audience === 'free') {
      where.subscriptionTier = 'free' as SubscriptionTier;
    }
    
    const users = await prisma.user.findMany({
      where,
      select: { telegramId: true },
    });
    
    let sentCount = 0;
    let failedCount = 0;
    
    const bot = getBot();
    if (!bot) {
      return res.status(503).json({ error: 'Bot is not initialized' });
    }
    
    // Отправка сообщений с rate limiting
    for (const user of users) {
      try {
        if (message_photo_url) {
          await bot.api.sendPhoto(user.telegramId.toString(), message_photo_url, {
            caption: message_text,
            parse_mode: 'HTML',
          });
        } else {
          await bot.api.sendMessage(user.telegramId.toString(), message_text, {
            parse_mode: 'HTML',
          });
        }
        sentCount++;
      } catch (error) {
        failedCount++;
        apiLogger.debug({ telegramId: user.telegramId.toString(), error }, 'Failed to send broadcast message');
      }
      
      // Задержка 50ms (20 сообщений/сек, лимит Telegram ~30/сек)
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Обновляем статус рассылки
    await prisma.broadcast.update({
      where: { id: broadcast_id },
      data: {
        status: 'sent',
        completedAt: new Date(),
        totalRecipients: users.length,
        sentCount,
        failedCount,
      },
    });
    
    apiLogger.info({
      broadcast_id,
      totalRecipients: users.length,
      sentCount,
      failedCount,
    }, 'Broadcast completed');
    
    res.json({
      success: true,
      totalRecipients: users.length,
      sent: sentCount,
      failed: failedCount,
    });
    
  } catch (error) {
    apiLogger.error({ error, broadcast_id }, 'Broadcast failed');
    
    // Обновляем статус на failed
    await prisma.broadcast.update({
      where: { id: broadcast_id },
      data: {
        status: 'failed',
        lastError: String(error),
      },
    }).catch(() => {});
    
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /api/internal/notify-admin
 * Отправить уведомление админу
 */
router.post('/notify-admin', async (req: Request, res: Response) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',') || [];
  
  const bot = getBot();
  if (!bot) {
    return res.status(503).json({ error: 'Bot is not initialized' });
  }
  
  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId.trim(), message, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      apiLogger.error({ adminId, error }, 'Failed to notify admin');
    }
  }
  
  res.json({ success: true, notified: adminIds.length });
});

/**
 * GET /api/internal/health
 * Проверка здоровья сервиса
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    // Проверяем подключение к БД
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'ok',
        bot: 'ok',
      },
      config: configService.getStats(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: String(error),
    });
  }
});

/**
 * POST /api/internal/config/invalidate
 * Инвалидация кеша конфигурации (вызывается из Directus Flow при изменении app_config)
 */
router.post('/config/invalidate', async (req: Request, res: Response) => {
  const { key } = req.body;
  
  if (key) {
    configService.invalidate(key);
    apiLogger.info({ key }, 'Config cache invalidated for key');
  } else {
    configService.invalidate();
    apiLogger.info('Full config cache invalidated');
  }
  
  // Reload config
  await configService.preload();
  
  res.json({
    success: true,
    stats: configService.getStats(),
  });
});

/**
 * GET /api/internal/config
 * Получить текущую конфигурацию (для отладки)
 */
router.get('/config', async (_req: Request, res: Response) => {
  const stats = configService.getStats();
  
  res.json({
    stats,
    message: 'Use Directus to view/edit configuration',
  });
});

export default router;
