/**
 * Broadcast Service
 * 
 * Сервис для отправки массовых рассылок через Telegram бота.
 * Поддерживает текст и изображения.
 */

import { prisma } from './database.js';
import { getBot } from '../bot/index.js';
import { BroadcastAudience, BroadcastStatus } from '@prisma/client';
import { dbLogger } from '../utils/logger.js';
import { InlineKeyboard } from 'grammy';

// Задержка между сообщениями (мс) чтобы не спамить Telegram API
const MESSAGE_DELAY_MS = 50;
const BATCH_SIZE = 30; // Telegram rate limit: ~30 msg/sec

interface BroadcastResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Получить список получателей для рассылки
 */
async function getRecipients(audience: BroadcastAudience): Promise<bigint[]> {
  let where: any = { status: 'active' };
  
  switch (audience) {
    case 'premium':
      where.subscriptionTier = { in: ['basic', 'premium'] };
      break;
    case 'free':
      where.subscriptionTier = 'free';
      break;
    case 'all':
    default:
      // Все активные пользователи
      break;
  }
  
  const users = await prisma.user.findMany({
    where,
    select: { telegramId: true },
  });
  
  return users.map(u => u.telegramId);
}

/**
 * Отправить сообщение одному пользователю
 */
async function sendMessage(
  telegramId: bigint,
  text: string,
  photoUrl?: string | null
): Promise<boolean> {
  const bot = getBot();
  if (!bot) {
    throw new Error('Bot not initialized');
  }
  
  try {
    const keyboard = new InlineKeyboard()
      .webApp('📊 Открыть дневник', process.env.WEBAPP_URL || 'https://t.me/MindfulJournalBot/app');
    
    if (photoUrl) {
      // Отправляем с фото
      await bot.api.sendPhoto(telegramId.toString(), photoUrl, {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      // Только текст
      await bot.api.sendMessage(telegramId.toString(), text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        disable_web_page_preview: true,
      });
    }
    
    return true;
  } catch (error: any) {
    // Игнорируем ошибки "user blocked bot" и "user not found"
    if (error?.error_code === 403 || error?.error_code === 400) {
      dbLogger.debug({ telegramId: telegramId.toString(), error: error.description }, 'User blocked or not found');
      return false;
    }
    throw error;
  }
}

/**
 * Выполнить рассылку
 */
export async function executeBroadcast(broadcastId: string): Promise<BroadcastResult> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
  });
  
  if (!broadcast) {
    throw new Error(`Broadcast ${broadcastId} not found`);
  }
  
  dbLogger.info({ broadcastId, title: broadcast.title }, 'Starting broadcast');
  
  // Получаем получателей
  const recipients = await getRecipients(broadcast.targetAudience);
  
  // Обновляем статус
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: 'sending',
      startedAt: new Date(),
      totalRecipients: recipients.length,
    },
  });
  
  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  
  // Отправляем партиями
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.all(
      batch.map(async (telegramId) => {
        try {
          const success = await sendMessage(telegramId, broadcast.messageText, broadcast.messagePhotoUrl);
          return success;
        } catch (error: any) {
          errors.push(`${telegramId}: ${error.message}`);
          return false;
        }
      })
    );
    
    // Подсчитываем результаты
    for (const success of results) {
      if (success) {
        sentCount++;
      } else {
        failedCount++;
      }
    }
    
    // Обновляем прогресс в БД
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { sentCount, failedCount },
    });
    
    // Пауза между партиями
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS * BATCH_SIZE));
    }
    
    dbLogger.debug({ broadcastId, progress: `${i + batch.length}/${recipients.length}` }, 'Broadcast progress');
  }
  
  // Финальное обновление
  const finalStatus: BroadcastStatus = failedCount === recipients.length ? 'failed' : 'sent';
  
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      sentCount,
      failedCount,
      lastError: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
    },
  });
  
  dbLogger.info({
    broadcastId,
    sentCount,
    failedCount,
    total: recipients.length,
  }, 'Broadcast completed');
  
  return {
    success: finalStatus === 'sent',
    sentCount,
    failedCount,
    errors,
  };
}

/**
 * Запланировать рассылку
 */
export async function scheduleBroadcast(broadcastId: string, scheduledAt: Date): Promise<void> {
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: {
      status: 'scheduled',
      scheduledAt,
    },
  });
  
  dbLogger.info({ broadcastId, scheduledAt }, 'Broadcast scheduled');
}

/**
 * Проверить и запустить запланированные рассылки
 * (вызывается из scheduler)
 */
export async function processScheduledBroadcasts(): Promise<void> {
  const now = new Date();
  
  const scheduledBroadcasts = await prisma.broadcast.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { lte: now },
    },
  });
  
  for (const broadcast of scheduledBroadcasts) {
    dbLogger.info({ broadcastId: broadcast.id, title: broadcast.title }, 'Executing scheduled broadcast');
    
    // Запускаем в фоне
    executeBroadcast(broadcast.id).catch((error) => {
      dbLogger.error({ error, broadcastId: broadcast.id }, 'Scheduled broadcast failed');
    });
  }
}
