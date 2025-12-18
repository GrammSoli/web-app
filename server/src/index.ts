import 'dotenv/config';
// Sentry MUST be initialized first
import { initSentry } from './utils/sentry.js';
initSentry();

import { initBot, getBot } from './bot/index.js';
import { createApp } from './api/index.js';
import { prisma } from './services/database.js';
import { configService } from './services/config.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { logger } from './utils/logger.js';
// AdminJS импортируется динамически ниже

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
];

for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    logger.fatal({ envVar }, `❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
  logger.info({ NODE_ENV }, '🚀 Starting AI Mindful Journal Server...');
  
  // Проверяем подключение к базе данных
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error({ error }, '❌ Failed to connect to database');
    process.exit(1);
  }
  
  // Preload configuration from database
  try {
    await configService.preload();
    logger.info(configService.getStats(), '✅ Configuration loaded');
  } catch (error) {
    logger.warn({ error }, '⚠️ Failed to preload config, using defaults');
  }
  
  // Запускаем Express API
  const app = createApp();
  
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `✅ API server running on port ${PORT}`);
  });
  
  // Запускаем Telegram бота
  const bot = initBot();
  
  if (bot) {
    try {
      // В production используем webhook, в dev — polling
      if (NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
        // Инициализируем бота (получаем botInfo от Telegram)
        await bot.init();
        
        const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
        await bot.api.setWebhook(webhookUrl);
        logger.info({ webhookUrl }, '✅ Bot webhook set');
        // Webhook handler уже зарегистрирован в api/index.ts
      } else {
        // Polling для разработки
        await bot.api.deleteWebhook();
        bot.start({
          onStart: (botInfo) => {
            logger.info({ username: botInfo.username }, '✅ Bot started (polling mode)');
          },
        });
      }
      
      // Запускаем scheduler для напоминаний
      startScheduler();
    } catch (error) {
      logger.error({ error }, '❌ Failed to start bot');
    }
  } else {
    logger.warn('⚠️ Bot disabled (no token)');
  }
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '🛑 Shutting down...');
    
    // Останавливаем scheduler
    stopScheduler();
    
    const currentBot = getBot();
    if (currentBot) {
      await currentBot.stop();
    }
    await prisma.$disconnect();
    
    logger.info('👋 Goodbye!');
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error({ error }, '💥 Fatal error');
  process.exit(1);
});
