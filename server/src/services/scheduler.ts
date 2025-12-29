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

    const webAppUrl = await configService.getString('bot.webapp_url') || 'https://mindful-journal.com';
    
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
 * Отправить напоминание о привычке (с кнопкой на трекер)
 */
async function sendHabitReminder(telegramId: bigint, message: string): Promise<boolean> {
  try {
    const bot = getBot();
    if (!bot) {
      dbLogger.warn('Bot not initialized, cannot send habit reminder');
      return false;
    }

    const webAppUrl = await configService.getString('bot.webapp_url') || 'https://mindful-journal.com';
    
    const keyboard = new InlineKeyboard()
      .webApp('📊 Открыть трекер', webAppUrl + '/habits');

    await bot.api.sendMessage(telegramId.toString(), message, {
      reply_markup: keyboard,
    });

    dbLogger.info({ telegramId: telegramId.toString() }, 'Habit reminder sent successfully');
    return true;
  } catch (error) {
    dbLogger.error({ error, telegramId: telegramId.toString() }, 'Failed to send habit reminder');
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

// Дефолтные тексты напоминаний для привычек
const DEFAULT_HABIT_REMINDER_MESSAGES = [
  '⏰ Время для привычки "{name}"!',
  '🎯 Не забудь: {name}',
  '✨ Пора выполнить: {name}',
  '💪 Напоминание: {name}',
];

/**
 * Получить день недели в формате 0-6 (Пн-Вс) для указанной таймзоны
 */
function getDayOfWeekInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    const dayName = formatter.format(now);
    // JS weekday: Sun=0, Mon=1, ... Sat=6
    // Our format: Mon=0, Tue=1, ... Sun=6
    const mapping: Record<string, number> = {
      'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6
    };
    return mapping[dayName] ?? 0;
  } catch {
    // Fallback to server timezone
    const day = new Date().getDay();
    // Convert from JS format (Sun=0) to our format (Mon=0)
    return day === 0 ? 6 : day - 1;
  }
}

/**
 * Проверить, должна ли привычка выполняться сегодня
 */
function shouldHabitRunToday(frequency: string, customDays: number[], dayOfWeek: number): boolean {
  switch (frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 0 && dayOfWeek <= 4; // Mon-Fri (0-4)
    case 'weekends':
      return dayOfWeek === 5 || dayOfWeek === 6; // Sat-Sun (5-6)
    case 'custom':
      return customDays.includes(dayOfWeek);
    default:
      return true;
  }
}

/**
 * Обработать напоминания для привычек
 */
async function processHabitReminders(): Promise<void> {
  try {
    // Получаем все активные привычки с напоминаниями, которые еще не выполнены сегодня
    const habitsWithReminders = await prisma.$queryRaw<Array<{
      habit_id: string;
      habit_name: string;
      reminder_time: string;
      frequency: string;
      custom_days: number[];
      telegram_id: bigint;
      timezone: string;
    }>>`
      SELECT 
        h.id as habit_id,
        h.name as habit_name,
        h.reminder_time,
        h.frequency,
        h.custom_days,
        u.telegram_id,
        u.timezone
      FROM app.habits h
      JOIN app.users u ON h.user_id = u.id
      WHERE h.is_active = true 
        AND h.is_archived = false
        AND h.reminder_time IS NOT NULL
        AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM app.habit_completions hc 
          WHERE hc.habit_id = h.id 
            AND hc.completed_date = (
              CURRENT_TIMESTAMP AT TIME ZONE u.timezone
            )::date
        )
    `;

    if (habitsWithReminders.length === 0) {
      return;
    }

    dbLogger.debug({ count: habitsWithReminders.length }, 'Checking habit reminders');

    // Проверяем каждую привычку
    for (const habit of habitsWithReminders) {
      const currentTime = getCurrentTimeInTimezone(habit.timezone);
      const dayOfWeek = getDayOfWeekInTimezone(habit.timezone);
      
      // Проверяем время и день недели
      if (currentTime === habit.reminder_time && 
          shouldHabitRunToday(habit.frequency, habit.custom_days || [], dayOfWeek)) {
        
        // Формируем сообщение
        const templates = DEFAULT_HABIT_REMINDER_MESSAGES;
        const template = templates[Math.floor(Math.random() * templates.length)];
        const message = template.replace('{name}', habit.habit_name);
        
        await sendHabitReminder(habit.telegram_id, message);
        dbLogger.info({ 
          habitId: habit.habit_id, 
          habitName: habit.habit_name,
          telegramId: habit.telegram_id.toString() 
        }, 'Habit reminder sent');
        
        // Небольшая задержка между отправками
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    dbLogger.error({ error }, 'Error processing habit reminders');
  }
}

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Отправить уведомление о использованной заморозке
 */
async function sendFreezeNotification(
  telegramId: bigint, 
  habitName: string, 
  streak: number, 
  freezesRemaining: number
): Promise<boolean> {
  try {
    const bot = getBot();
    if (!bot) {
      dbLogger.warn('Bot not initialized, cannot send freeze notification');
      return false;
    }

    const webAppUrl = await configService.getString('bot.webapp_url') || 'https://mindful-journal.com';
    
    const message = `❄️ Вчера был трудный день? Я использовал заморозку, чтобы сохранить твой прогресс в привычке "${habitName}" (🔥 ${streak} ${streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}). Осталось заморозок: ${freezesRemaining}.`;
    
    const keyboard = new InlineKeyboard()
      .webApp('📊 Открыть трекер', webAppUrl + '/habits');

    await bot.api.sendMessage(telegramId.toString(), message, {
      reply_markup: keyboard,
    });

    dbLogger.info({ telegramId: telegramId.toString(), habitName, streak }, 'Freeze notification sent');
    return true;
  } catch (error) {
    dbLogger.error({ error, telegramId: telegramId.toString() }, 'Failed to send freeze notification');
    return false;
  }
}

/**
 * Обработать утренние уведомления о заморозках (запускается в 09:00 по таймзоне пользователя)
 */
async function processFreezeNotifications(): Promise<void> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Получаем пользователей, у которых вчера была использована заморозка
    const usersWithFreezeUsed = await prisma.$queryRaw<Array<{
      telegram_id: bigint;
      timezone: string;
      habit_name: string;
      last_freeze_streak: number;
      freezes_remaining: number;
    }>>`
      SELECT 
        u.telegram_id,
        u.timezone,
        h.name as habit_name,
        u.last_freeze_streak,
        (
          COALESCE((
            SELECT CAST(value AS INTEGER) 
            FROM app.app_config 
            WHERE key = 'limits.' || u.subscription_tier || '.habit_freezes'
          ), 1) - u.habit_freezes_used
        ) as freezes_remaining
      FROM app.users u
      LEFT JOIN app.habits h ON h.id = u.last_freeze_habit_id
      WHERE u.last_freeze_notification_date = ${yesterdayStr}::date
        AND u.status = 'active'
    `;

    if (usersWithFreezeUsed.length === 0) {
      return;
    }

    dbLogger.debug({ count: usersWithFreezeUsed.length }, 'Checking freeze notifications');

    // Отправляем уведомления в 09:00 по таймзоне пользователя
    for (const user of usersWithFreezeUsed) {
      const currentTime = getCurrentTimeInTimezone(user.timezone);
      
      if (currentTime === '09:00') {
        await sendFreezeNotification(
          user.telegram_id,
          user.habit_name || 'привычки',
          user.last_freeze_streak || 0,
          user.freezes_remaining || 0
        );
        
        // Сбрасываем дату уведомления чтобы не отправлять повторно
        await prisma.$executeRaw`
          UPDATE app.users 
          SET last_freeze_notification_date = NULL
          WHERE telegram_id = ${user.telegram_id}
        `;
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    dbLogger.error({ error }, 'Error processing freeze notifications');
  }
}

/**
 * Запустить scheduler
 */
export function startScheduler(): void {
  // Запускаем каждую минуту
  scheduledTask = cron.schedule('* * * * *', async () => {
    await processReminders();
    await processHabitReminders();
    await processFreezeNotifications();
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
