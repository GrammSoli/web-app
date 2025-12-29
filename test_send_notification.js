// Test script to send freeze notification immediately
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN || '7692552054:AAE5AqxLKZAQ2xEeFFiJ20VH8i4cWDX3m8o';
const TELEGRAM_ID = '437257453';

const bot = new Telegraf(BOT_TOKEN);

const habitName = 'Зал';
const streak = 12;
const freezesRemaining = 1;

const message = `❄️ Вчера был трудный день? Я использовал заморозку, чтобы сохранить твой прогресс в привычке "${habitName}" (🔥 ${streak} дней). Осталось заморозок: ${freezesRemaining}.`;

bot.telegram.sendMessage(TELEGRAM_ID, message, {
  reply_markup: {
    inline_keyboard: [[
      { text: '📊 Открыть трекер', web_app: { url: 'https://mindful-journal.com/habits' } }
    ]]
  }
}).then(() => {
  console.log('✅ Test notification sent!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
