import { Bot, InlineKeyboard } from 'grammy';

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_ID = '437257453';

const bot = new Bot(BOT_TOKEN);

const message = `❄️ Вчера был трудный день? Я использовал заморозку, чтобы сохранить твой прогресс в привычке "Зал" (🔥 12 дней). Осталось заморозок: 1.`;

const keyboard = new InlineKeyboard()
  .webApp('📊 Открыть трекер', 'https://mindful-journal.com/habits');

bot.api.sendMessage(TELEGRAM_ID, message, {
  reply_markup: keyboard
}).then(() => {
  console.log('Sent!');
  process.exit(0);
}).catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
