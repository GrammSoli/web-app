import { Bot, Context, session, SessionFlavor, GrammyError, HttpError } from 'grammy';
import { hydrate, HydrateFlavor } from '@grammyjs/hydrate';
import { botLogger } from '../utils/logger.js';
import prisma from '../services/database.js';
import {
  getOrCreateUser,
  createEntry,
  processEntry,
  logUsage,
  countTodayEntries,
  getTodayVoiceUsageSeconds,
  getEffectiveTier,
  activateSubscription,
} from '../services/user.js';
import { analyzeMood, processVoiceMessage } from '../services/openai.js';
import { checkLimitsAsync, getSubscriptionPricing } from '../utils/pricing.js';
import { getMessage, configService } from '../services/config.js';

// ============================================
// ТИПЫ
// ============================================

interface SessionData {
  lastMessageId?: number;
}

type MyContext = HydrateFlavor<Context> & SessionFlavor<SessionData>;

// ============================================
// СОЗДАНИЕ БОТА
// ============================================

let botInstance: Bot<MyContext> | null = null;

export function createBot(token: string): Bot<MyContext> {
  const bot = new Bot<MyContext>(token);
  
  // Middleware
  bot.use(session({ initial: () => ({}) }));
  bot.use(hydrate());
  
  // ============================================
  // КОМАНДЫ
  // ============================================

  bot.command('start', async (ctx) => {
    const user = ctx.from;
    if (!user) return;
    
    const dbUser = await getOrCreateUser({
      telegramId: BigInt(user.id),
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      languageCode: user.language_code,
    });
    
    botLogger.info({ telegramId: user.id, oderId: dbUser.id }, 'User started bot');
    
    // Check for deep link parameter (e.g., payment_success)
    const startParam = ctx.match;
    if (startParam === 'payment_success') {
      await ctx.reply(
        '🎉 *Спасибо за оплату!*\n\nВаша подписка активирована. Наслаждайтесь всеми возможностями AI Mindful Journal!',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const webAppUrl = process.env.WEBAPP_URL;
    
    // Check if user has completed WebApp activation
    const hasTimezone = dbUser.timezone && dbUser.timezone !== 'UTC';
    
    if (!hasTimezone) {
      // Сценарий 1: Новый пользователь (Newbie)
      const keyboard = [];
      
      if (webAppUrl && webAppUrl.startsWith('https://')) {
        keyboard.push([{ text: '🚀 Активировать Дневник', web_app: { url: webAppUrl } }]);
      }
      
      const welcomeMessage = await getMessage('msg.welcome', { name: user.first_name });
      const welcomePhotoUrl = await configService.getString('bot.welcome_photo_url', '');
      
      // Отправляем фото если есть URL, иначе просто текст
      if (welcomePhotoUrl) {
        await ctx.replyWithPhoto(welcomePhotoUrl, {
          caption: welcomeMessage,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard as any,
          },
        });
      } else {
        await ctx.reply(
          welcomeMessage,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: keyboard as any,
            },
          }
        );
      }
    } else {
      // Сценарий 2: Активный пользователь (уже заходил)
      const keyboard = [];
      
      if (webAppUrl && webAppUrl.startsWith('https://')) {
        keyboard.push([{ text: '📱 Открыть Дневник', web_app: { url: webAppUrl } }]);
        keyboard.push([
          { text: '💎 Premium', web_app: { url: `${webAppUrl}/premium` } },
          { text: '❓ Помощь', callback_data: 'show_help' }
        ]);
      }
      
      const welcomeBackMessage = await getMessage('msg.welcome_back', { name: user.first_name });
      const startPhotoUrl = await configService.getString('bot.start_photo_url', '');
      
      if (startPhotoUrl) {
        await ctx.replyWithPhoto(startPhotoUrl, {
          caption: welcomeBackMessage,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard as any,
          },
        });
      } else {
        await ctx.reply(
          welcomeBackMessage,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: keyboard as any,
            },
          }
        );
      }
    }
  });

  bot.command('help', async (ctx) => {
    const helpMessage = await getMessage('msg.help');
    const helpPhotoUrl = await configService.getString('bot.help_photo_url', '');
    
    const helpKeyboard = {
      inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'back_to_start' }]]
    };
    
    if (helpPhotoUrl) {
      await ctx.replyWithPhoto(helpPhotoUrl, { caption: helpMessage, parse_mode: 'Markdown', reply_markup: helpKeyboard });
    } else {
      await ctx.reply(helpMessage, { parse_mode: 'Markdown', reply_markup: helpKeyboard });
    }
  });

  // ============================================
  // CALLBACK QUERIES
  // ============================================

  bot.callbackQuery('show_help', async (ctx) => {
    await ctx.answerCallbackQuery();
    const helpMessage = await getMessage('msg.help');
    const helpPhotoUrl = await configService.getString('bot.help_photo_url', '');
    
    const helpKeyboard = {
      inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'back_to_start' }]]
    };
    
    if (helpPhotoUrl) {
      await ctx.replyWithPhoto(helpPhotoUrl, { caption: helpMessage, parse_mode: 'Markdown', reply_markup: helpKeyboard });
    } else {
      await ctx.reply(helpMessage, { parse_mode: 'Markdown', reply_markup: helpKeyboard });
    }
  });

  // Обработчик кнопки "Назад" - возвращает к главному меню
  bot.callbackQuery('back_to_start', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const webAppUrl = process.env.WEBAPP_URL || '';
    const keyboard = [];
    
    if (webAppUrl && webAppUrl.startsWith('https://')) {
      keyboard.push([{ text: '📱 Открыть Дневник', web_app: { url: webAppUrl } }]);
      keyboard.push([
        { text: '💎 Premium', web_app: { url: `${webAppUrl}/premium` } },
        { text: '❓ Помощь', callback_data: 'show_help' }
      ]);
    }
    
    const startPhotoUrl = await configService.getString('bot.start_photo_url', '');
    const user = ctx.from!;
    const welcomeBackMessage = await getMessage('msg.welcome_back', { name: user.first_name });
    
    if (startPhotoUrl) {
      await ctx.replyWithPhoto(startPhotoUrl, {
        caption: welcomeBackMessage,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard as any },
      });
    } else {
      await ctx.reply(welcomeBackMessage, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard as any },
      });
    }
  });

  bot.callbackQuery('show_premium', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const [basicPricing, premiumPricing] = await Promise.all([
      getSubscriptionPricing('basic'),
      getSubscriptionPricing('premium'),
    ]);
    
    await ctx.reply(
      `⭐ *Выбери тариф:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `💳 Basic — ${basicPricing.stars} ⭐/мес`, callback_data: 'buy_basic' }],
            [{ text: `💳 Premium — ${premiumPricing.stars} ⭐/мес`, callback_data: 'buy_premium' }],
          ],
        },
      }
    );
  });

  bot.callbackQuery(/^buy_(basic|premium)$/, async (ctx) => {
    const tier = ctx.match![1] as 'basic' | 'premium';
    
    await ctx.answerCallbackQuery();
    
    // Get dynamic pricing
    const pricing = await getSubscriptionPricing(tier);
    
    await ctx.replyWithInvoice(
      `Подписка ${tier === 'basic' ? 'Basic' : 'Premium'}`,
      `Ежемесячная подписка на AI Mindful Journal`,
      `sub_${tier}_${Date.now()}`,
      'XTR',
      [{ label: 'Подписка', amount: pricing.stars }]
    );
  });

  // ============================================
  // ОБРАБОТКА ПЛАТЕЖЕЙ
  // ============================================

  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on('message:successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const user = ctx.from;
    
    if (!user || !payment) return;
    
    const telegramPaymentId = payment.telegram_payment_charge_id;
    
    botLogger.info({
      telegramId: user.id,
      amount: payment.total_amount,
      currency: payment.currency,
      payload: payment.invoice_payload,
      telegramPaymentId,
    }, 'Successful payment received');
    
    // Parse payload: sub_tier_telegramId_timestamp
    const payload = payment.invoice_payload;
    if (!payload?.startsWith('sub_')) {
      botLogger.warn({ payload }, 'Unknown payment payload format');
      const successMessage = await getMessage('msg.payment_success');
      await ctx.reply(successMessage);
      return;
    }
    
    // Idempotency check: check if transaction already processed
    const existingTx = await prisma.transaction.findFirst({
      where: { invoiceId: telegramPaymentId },
    });
    
    if (existingTx) {
      botLogger.info({ telegramPaymentId }, 'Payment already processed (idempotency)');
      const successMessage = await getMessage('msg.payment_success');
      await ctx.reply(successMessage);
      return;
    }
    
    try {
      // Parse tier from payload: sub_basic_123456_1234567890
      const parts = payload.split('_');
      const tier = parts[1] as 'basic' | 'premium';
      
      if (!['basic', 'premium'].includes(tier)) {
        botLogger.error({ tier, payload }, 'Invalid subscription tier in payload');
        return;
      }
      
      // Get user from DB
      const dbUser = await getOrCreateUser({
        telegramId: BigInt(user.id),
        username: user.username,
        firstName: user.first_name,
      });
      
      const pricing = await getSubscriptionPricing(tier);
      
      // Create transaction record (idempotency key)
      const transaction = await prisma.transaction.create({
        data: {
          userId: dbUser.id,
          invoiceId: telegramPaymentId,
          transactionType: 'stars_payment',
          amountStars: payment.total_amount,
          amountUsd: pricing.usd,
          currency: payment.currency,
          isSuccessful: true,
          metadata: { tier, payload },
        },
      });
      
      // Activate subscription
      await activateSubscription(dbUser.id, tier, transaction.id);
      
      // Update user total spend
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { 
          totalSpendUsd: { increment: pricing.usd },
        },
      });
      
      botLogger.info({
        userId: dbUser.id,
        tier,
        transactionId: transaction.id,
        telegramPaymentId,
      }, 'Telegram Stars subscription activated');
      
      const successMessage = await getMessage('msg.payment_success');
      await ctx.reply(successMessage);
      
    } catch (error) {
      botLogger.error({ error, telegramPaymentId }, 'Failed to process payment');
      // Still reply success to user since payment was received
      const successMessage = await getMessage('msg.payment_success');
      await ctx.reply(successMessage);
    }
  });

  // ============================================
  // ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ
  // ============================================

  bot.on('message:text', async (ctx) => {
    const user = ctx.from;
    const text = ctx.message.text;
    
    if (!user || !text) return;
    if (text.startsWith('/')) return;
    
    const dbUser = await getOrCreateUser({
      telegramId: BigInt(user.id),
      username: user.username,
      firstName: user.first_name,
    });
    
    // Check if user has completed WebApp activation
    const hasTimezone = dbUser.timezone && dbUser.timezone !== 'UTC';
    
    if (!hasTimezone) {
      const webAppUrl = process.env.WEBAPP_URL;
      await ctx.reply(
        'Сначала активируй дневник по кнопке ниже 👇\n\n' +
        'Это нужно, чтобы я мог правильно вести твою статистику.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📊 Открыть дневник', web_app: { url: webAppUrl! } }
            ]]
          }
        }
      );
      return;
    }
    
    const userTimezone = dbUser.timezone || 'UTC';
    const today = await countTodayEntries(dbUser.id, userTimezone);
    const tier = await getEffectiveTier(dbUser.id);
    // For text messages: pass 0 for voice seconds (not a voice message)
    const limitCheck = await checkLimitsAsync(tier, today.total, 0, false, 0);
    
    if (!limitCheck.allowed) {
      const limitMessage = await getMessage('msg.limit_exceeded', { reason: limitCheck.reason || '' });
      await ctx.reply(limitMessage);
      return;
    }
    
    await ctx.replyWithChatAction('typing');
    
    try {
      const entry = await createEntry({
        userId: dbUser.id,
        textContent: text,
        isVoice: false,
      });
      
      const analysis = await analyzeMood(text);
      
      await processEntry(entry.id, analysis.result);
      
      await logUsage({
        userId: dbUser.id,
        entryId: entry.id,
        serviceType: 'gpt_4o_mini',
        modelName: 'gpt-4o-mini',
        inputTokens: analysis.usage.inputTokens,
        outputTokens: analysis.usage.outputTokens,
        costUsd: analysis.usage.costUsd,
        requestId: analysis.requestId,
      });
      
      const moodEmoji = getMoodEmoji(analysis.result.moodScore);
      const tags = analysis.result.tags.map(t => `#${t}`).join(' ');
      
      await ctx.reply(
        `${moodEmoji} *Настроение: ${analysis.result.moodScore}/10* (${analysis.result.moodLabel})\n\n` +
        `📝 ${analysis.result.summary}\n\n` +
        `💡 ${analysis.result.suggestions}\n\n` +
        `${tags}`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      botLogger.error({ error }, 'Failed to process text message');
      const errorMessage = await getMessage('msg.error_generic');
      await ctx.reply(errorMessage);
    }
  });

  // ============================================
  // ОБРАБОТКА ГОЛОСОВЫХ СООБЩЕНИЙ
  // ============================================

  bot.on('message:voice', async (ctx) => {
    const user = ctx.from;
    const voice = ctx.message.voice;
    
    if (!user || !voice) return;
    
    const dbUser = await getOrCreateUser({
      telegramId: BigInt(user.id),
      username: user.username,
      firstName: user.first_name,
    });
    
    // Check if user has completed WebApp activation
    const hasTimezone = dbUser.timezone && dbUser.timezone !== 'UTC';
    
    if (!hasTimezone) {
      const webAppUrl = process.env.WEBAPP_URL;
      await ctx.reply(
        'Сначала активируй дневник по кнопке ниже 👇\n\n' +
        'Это нужно, чтобы я мог правильно вести твою статистику.',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '📊 Открыть дневник', web_app: { url: webAppUrl! } }
            ]]
          }
        }
      );
      return;
    }
    
    const userTimezone = dbUser.timezone || 'UTC';
    
    // Get today's usage data
    const [todayEntries, usedVoiceSecondsToday] = await Promise.all([
      countTodayEntries(dbUser.id, userTimezone),
      getTodayVoiceUsageSeconds(dbUser.id, userTimezone),
    ]);
    
    const tier = await getEffectiveTier(dbUser.id);
    
    // CRITICAL: Check limits BEFORE sending to OpenAI Whisper
    // We use voice.duration from Telegram (available immediately) to check
    // if the user will exceed their limit after this message
    const limitCheck = await checkLimitsAsync(
      tier,
      todayEntries.total,
      usedVoiceSecondsToday,
      true,
      voice.duration // Duration of the new voice message in seconds
    );
    
    if (!limitCheck.allowed) {
      const limitMessage = await getMessage('msg.limit_exceeded', { reason: limitCheck.reason || '' });
      await ctx.reply(limitMessage);
      return;
    }
    
    await ctx.replyWithChatAction('typing');
    const voiceProcessingMsg = await getMessage('msg.voice_processing');
    const statusMsg = await ctx.reply(voiceProcessingMsg);
    
    try {
      const file = await ctx.api.getFile(voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      
      const result = await processVoiceMessage(fileUrl, voice.duration);
      
      const entry = await createEntry({
        userId: dbUser.id,
        textContent: result.transcription.text,
        isVoice: true,
        voiceFileId: voice.file_id,
        voiceDurationSeconds: voice.duration,
      });
      
      await processEntry(entry.id, result.analysis.result);
      
      await logUsage({
        userId: dbUser.id,
        entryId: entry.id,
        serviceType: 'whisper_1',
        modelName: 'whisper-1',
        durationSeconds: voice.duration,
        costUsd: result.transcription.usage.costUsd,
      });
      
      await logUsage({
        userId: dbUser.id,
        entryId: entry.id,
        serviceType: 'gpt_4o_mini',
        modelName: 'gpt-4o-mini',
        inputTokens: result.analysis.usage.inputTokens,
        outputTokens: result.analysis.usage.outputTokens,
        costUsd: result.analysis.usage.costUsd,
      });
      
      await statusMsg.delete().catch(() => {});
      
      const moodEmoji = getMoodEmoji(result.analysis.result.moodScore);
      const tags = result.analysis.result.tags.map(t => `#${t}`).join(' ');
      
      await ctx.reply(
        `${moodEmoji} *Настроение: ${result.analysis.result.moodScore}/10* (${result.analysis.result.moodLabel})\n\n` +
        `🎤 _"${truncate(result.transcription.text, 200)}"_\n\n` +
        `📝 ${result.analysis.result.summary}\n\n` +
        `💡 ${result.analysis.result.suggestions}\n\n` +
        `${tags}`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      botLogger.error({ error }, 'Failed to process voice message');
      await statusMsg.delete().catch(() => {});
      const errorMessage = await getMessage('msg.error_generic');
      await ctx.reply(errorMessage);
    }
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    
    botLogger.error({ error: e, update: ctx.update }, 'Bot error');
    
    if (e instanceof GrammyError) {
      botLogger.error(`Grammy error: ${e.description}`);
    } else if (e instanceof HttpError) {
      botLogger.error(`HTTP error: ${e}`);
    }
  });
  
  return bot;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function getMoodEmoji(score: number): string {
  if (score >= 9) return '🤩';
  if (score >= 7) return '😊';
  if (score >= 5) return '😐';
  if (score >= 3) return '😔';
  return '😢';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// ============================================
// ЭКСПОРТ
// ============================================

export function getBot(): Bot<MyContext> | null {
  return botInstance;
}

export function initBot(): Bot<MyContext> | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    botLogger.warn('TELEGRAM_BOT_TOKEN not set, bot disabled');
    return null;
  }
  
  botInstance = createBot(token);
  return botInstance;
}

export { botInstance as bot };
