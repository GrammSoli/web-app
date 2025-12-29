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
 * Получить вчерашнюю дату в timezone пользователя
 */
function getYesterdayInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // Get today, then subtract 1 day
    const todayStr = formatter.format(now);
    const yesterday = new Date(todayStr + 'T12:00:00Z');
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  } catch {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
}

/**
 * Получить лимит заморозок для тарифа
 */
async function getFreezeLimit(tier: string): Promise<number> {
  const limit = await configService.getNumber(`limits.${tier}.habit_freezes`);
  return limit ?? 1;
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Ежедневная проверка и применение заморозок
 * Запускается в 00:05 по timezone каждого пользователя
 * 
 * Логика:
 * 1. Найти пользователей с активными привычками
 * 2. Для каждого проверить: есть ли невыполненные привычки за вчера?
 * 3. Если да и есть стрик > 0 и есть заморозки → применить
 */
async function processDailyFreezeCheck(): Promise<void> {
  try {
    // Получаем пользователей с привычками, для которых сейчас 00:05
    const usersToCheck = await prisma.$queryRaw<Array<{
      user_id: string;
      telegram_id: bigint;
      timezone: string;
      subscription_tier: string;
      habit_freezes_used: number;
      habit_freezes_reset_month: Date | null;
      last_freeze_applied_date: Date | null;
    }>>`
      SELECT DISTINCT
        u.id as user_id,
        u.telegram_id,
        u.timezone,
        u.subscription_tier,
        u.habit_freezes_used,
        u.habit_freezes_reset_month,
        u.last_freeze_applied_date
      FROM app.users u
      JOIN app.habits h ON h.user_id = u.id AND h.is_active = true AND h.is_archived = false
      WHERE u.status = 'active'
    `;

    for (const user of usersToCheck) {
      const currentTime = getCurrentTimeInTimezone(user.timezone);
      
      // Запускаем только в 00:05 по времени пользователя
      if (currentTime !== '00:05') continue;

      const yesterdayStr = getYesterdayInTimezone(user.timezone);
      
      // Проверяем: не применяли ли уже заморозку сегодня
      if (user.last_freeze_applied_date) {
        const lastAppliedStr = user.last_freeze_applied_date.toISOString().split('T')[0];
        const todayStr = new Date().toISOString().split('T')[0];
        if (lastAppliedStr >= todayStr) continue; // Уже применяли
      }

      // Проверяем месячный reset
      const currentMonthStart = new Date(new Date().toISOString().slice(0, 7) + '-01');
      const needsReset = !user.habit_freezes_reset_month || 
        new Date(user.habit_freezes_reset_month) < currentMonthStart;
      
      const freezeLimit = await getFreezeLimit(user.subscription_tier);
      const freezesUsed = needsReset ? 0 : user.habit_freezes_used;
      const freezesRemaining = freezeLimit - freezesUsed;
      
      if (freezesRemaining <= 0) continue; // Нет заморозок

      // Получаем привычки пользователя с невыполненными за вчера
      const habitsWithMissedYesterday = await prisma.$queryRaw<Array<{
        habit_id: string;
        habit_name: string;
        current_streak: number;
        frequency: string;
        custom_days: number[];
      }>>`
        SELECT 
          h.id as habit_id,
          h.name as habit_name,
          h.current_streak,
          h.frequency,
          h.custom_days
        FROM app.habits h
        WHERE h.user_id = ${user.user_id}::uuid
          AND h.is_active = true
          AND h.is_archived = false
          AND h.current_streak > 0
          AND h.date_created::date <= ${yesterdayStr}::date
          AND NOT EXISTS (
            SELECT 1 FROM app.habit_completions hc
            WHERE hc.habit_id = h.id
              AND hc.completed_date = ${yesterdayStr}::date
          )
      `;

      if (habitsWithMissedYesterday.length === 0) continue;

      // Фильтруем по расписанию (только те, что должны были быть выполнены вчера)
      const yesterdayDayOfWeek = (new Date(yesterdayStr + 'T12:00:00Z').getDay() + 6) % 7; // Mon=0
      
      const actuallyMissed = habitsWithMissedYesterday.filter(h => {
        switch (h.frequency) {
          case 'daily': return true;
          case 'weekdays': return yesterdayDayOfWeek >= 0 && yesterdayDayOfWeek <= 4;
          case 'weekends': return yesterdayDayOfWeek === 5 || yesterdayDayOfWeek === 6;
          case 'custom': return (h.custom_days || []).includes(yesterdayDayOfWeek);
          default: return true;
        }
      });

      if (actuallyMissed.length === 0) continue;

      // Применяем заморозку! (атомарно)
      const updateResult = await prisma.$executeRaw`
        UPDATE app.users 
        SET 
          habit_freezes_used = CASE 
            WHEN habit_freezes_reset_month IS NULL OR habit_freezes_reset_month < ${currentMonthStart}::date 
            THEN 1 
            ELSE habit_freezes_used + 1 
          END,
          habit_freezes_reset_month = ${currentMonthStart}::date,
          last_freeze_applied_date = CURRENT_DATE,
          last_freeze_notification_date = CURRENT_DATE,
          last_freeze_habit_id = ${actuallyMissed[0].habit_id}::uuid,
          last_freeze_streak = ${actuallyMissed[0].current_streak}
        WHERE id = ${user.user_id}::uuid
          AND (last_freeze_applied_date IS NULL OR last_freeze_applied_date < CURRENT_DATE)
          AND (
            (habit_freezes_reset_month IS NULL OR habit_freezes_reset_month < ${currentMonthStart}::date)
            OR habit_freezes_used < ${freezeLimit}
          )
      `;

      if (updateResult > 0) {
        // Создаём "frozen" записи для пропущенных привычек
        for (const habit of actuallyMissed) {
          await prisma.$executeRaw`
            INSERT INTO app.habit_completions (id, habit_id, user_id, completed_date, is_frozen, date_created)
            VALUES (
              gen_random_uuid(),
              ${habit.habit_id}::uuid,
              ${user.user_id}::uuid,
              ${yesterdayStr}::date,
              true,
              NOW()
            )
            ON CONFLICT (habit_id, completed_date) DO NOTHING
          `;
        }

        dbLogger.info({
          userId: user.user_id,
          telegramId: user.telegram_id.toString(),
          habitsCount: actuallyMissed.length,
          habitNames: actuallyMissed.map(h => h.habit_name),
        }, 'Freeze applied for missed habits');
      }
    }
  } catch (error) {
    dbLogger.error({ error }, 'Error processing daily freeze check');
  }
}

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
    await processDailyFreezeCheck(); // Применение заморозок (в 00:05 по timezone пользователя)
    await processFreezeNotifications(); // Уведомления (в 09:00)
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
