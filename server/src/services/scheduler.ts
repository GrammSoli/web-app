import cron from 'node-cron';
import { prisma } from './database.js';
import { configService } from './config.js';
import { getBot } from '../bot/index.js';
import { InlineKeyboard } from 'grammy';
import { dbLogger } from '../utils/logger.js';

// Дефолтные тексты напоминаний
const DEFAULT_REMINDER_MESSAGES = [
  '🌟 Привет! Как твоё настроение сегодня? Запиши свои мысли!',
  '✨ Время для минутки рефлексии. Как прошёл твой день?',
  '🌈 Не забудь записать свои эмоции! Это поможет лучше понять себя.',
  '💭 Момент для дневника! Что хорошего произошло сегодня?',
  '🎯 Привет! Удели минутку себе — запиши свои мысли.',
  '🌸 Как ты себя чувствуешь? Поделись в дневнике!',
  '⭐ Вечерняя рефлексия: за что ты благодарен сегодня?',
];

/**
 * Получить текущее время в указанной таймзоне в формате HH:MM
 */
function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(now);
  } catch {
    return new Date().toTimeString().slice(0, 5);
  }
}

/**
 * Получить рандомный текст напоминания из конфига
 */
async function getRandomReminderMessage(): Promise<string> {
  try {
    const messagesJson = await configService.getJson<string[]>('reminder.messages');
    const messages = messagesJson && messagesJson.length > 0 
      ? messagesJson 
      : DEFAULT_REMINDER_MESSAGES;
    
    return messages[Math.floor(Math.random() * messages.length)];
  } catch {
    return DEFAULT_REMINDER_MESSAGES[Math.floor(Math.random() * DEFAULT_REMINDER_MESSAGES.length)];
  }
}

/**
 * Отправить напоминание пользователю
 */
async function sendReminder(telegramId: bigint, message: string): Promise<boolean> {
  try {
    const bot = getBot();
    if (!bot) {
      dbLogger.warn('Bot not initialized, cannot send reminder');
      return false;
    }

    const webAppUrl = await configService.getString('bot.webapp_url') || 'https://grammvpn.ru';
    
    const keyboard = new InlineKeyboard()
      .webApp('📝 Открыть дневник', webAppUrl);

    await bot.api.sendMessage(telegramId.toString(), message, {
      reply_markup: keyboard,
    });

    dbLogger.info({ telegramId: telegramId.toString() }, 'Reminder sent successfully');
    return true;
  } catch (error) {
    dbLogger.error({ error, telegramId: telegramId.toString() }, 'Failed to send reminder');
    return false;
  }
}

/**
 * Обработать напоминания для текущей минуты
 */
async function processReminders(): Promise<void> {
  try {
    // Получаем всех пользователей с включенными напоминаниями
    const usersWithReminders = await prisma.$queryRaw<Array<{
      telegram_id: bigint;
      timezone: string;
      reminder_time: string;
    }>>`
      SELECT telegram_id, timezone, reminder_time 
      FROM app.users 
      WHERE reminder_enabled = true 
        AND reminder_time IS NOT NULL
        AND status = 'active'
    `;

    if (usersWithReminders.length === 0) {
      return;
    }

    dbLogger.debug({ count: usersWithReminders.length }, 'Checking reminders for users');

    // Проверяем каждого пользователя
    for (const user of usersWithReminders) {
      const currentTime = getCurrentTimeInTimezone(user.timezone);
      
      if (currentTime === user.reminder_time) {
        const message = await getRandomReminderMessage();
        await sendReminder(user.telegram_id, message);
        
        // Небольшая задержка между отправками чтобы не спамить API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    dbLogger.error({ error }, 'Error processing reminders');
  }
}

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Запустить scheduler
 */
export function startScheduler(): void {
  // Запускаем каждую минуту
  scheduledTask = cron.schedule('* * * * *', async () => {
    await processReminders();
  });

  dbLogger.info('✅ Reminder scheduler started (every minute)');
}

/**
 * Остановить scheduler
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    dbLogger.info('🛑 Reminder scheduler stopped');
  }
}

/**
 * Проверить статус scheduler
 */
export function isSchedulerRunning(): boolean {
  return scheduledTask !== null;
}
