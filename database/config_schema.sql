-- ============================================
-- APP CONFIG TABLE FOR DIRECTUS
-- Dynamic configuration with caching support
-- ============================================

-- Создаём в схеме app (рядом с остальными таблицами приложения)
SET search_path TO app;

-- Типы значений конфигурации
CREATE TYPE config_value_type AS ENUM ('string', 'number', 'boolean', 'json');

-- Категории конфигурации
CREATE TYPE config_category AS ENUM (
  'pricing',      -- OpenAI цены, курсы валют
  'limits',       -- Лимиты по тарифам
  'subscription', -- Цены подписок
  'ai',           -- AI настройки (промпты, модели)
  'messages',     -- UI тексты и сообщения
  'features',     -- Feature flags
  'rate_limit'    -- Rate limiting
);

-- Основная таблица конфигурации
CREATE TABLE IF NOT EXISTS app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ключ и значение
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  value_type config_value_type NOT NULL DEFAULT 'string',
  
  -- Метаданные
  category config_category NOT NULL,
  description TEXT,
  
  -- Fallback значение (на случай если value некорректное)
  default_value TEXT NOT NULL,
  
  -- Флаги
  is_secret BOOLEAN DEFAULT FALSE,  -- Скрывать ли в API (для ключей, токенов)
  is_active BOOLEAN DEFAULT TRUE,   -- Активна ли настройка
  
  -- Аудит
  date_created TIMESTAMPTZ DEFAULT NOW(),
  date_updated TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(255)
);

-- Индексы
CREATE INDEX idx_app_config_category ON app_config(category);
CREATE INDEX idx_app_config_active ON app_config(is_active) WHERE is_active = TRUE;

-- Триггер обновления даты
CREATE OR REPLACE FUNCTION update_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.date_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_config_updated
  BEFORE UPDATE ON app_config
  FOR EACH ROW
  EXECUTE FUNCTION update_config_timestamp();

-- ============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- ============================================

INSERT INTO app_config (key, value, value_type, category, description, default_value) VALUES

-- === PRICING: OpenAI ===
('openai.gpt4o_mini.input', '0.15', 'number', 'pricing', 'GPT-4o-mini input price per 1M tokens (USD)', '0.15'),
('openai.gpt4o_mini.output', '0.60', 'number', 'pricing', 'GPT-4o-mini output price per 1M tokens (USD)', '0.60'),
('openai.gpt4o.input', '2.50', 'number', 'pricing', 'GPT-4o input price per 1M tokens (USD)', '2.50'),
('openai.gpt4o.output', '10.00', 'number', 'pricing', 'GPT-4o output price per 1M tokens (USD)', '10.00'),
('openai.whisper.per_minute', '0.006', 'number', 'pricing', 'Whisper price per minute (USD)', '0.006'),

-- === PRICING: Stars ===
('stars_to_usd_rate', '0.02', 'number', 'pricing', 'Telegram Stars to USD conversion rate', '0.02'),

-- === SUBSCRIPTION ===
('subscription.basic.stars', '50', 'number', 'subscription', 'Basic subscription price in Stars', '50'),
('subscription.basic.duration_days', '30', 'number', 'subscription', 'Basic subscription duration in days', '30'),
('subscription.premium.stars', '150', 'number', 'subscription', 'Premium subscription price in Stars', '150'),
('subscription.premium.duration_days', '30', 'number', 'subscription', 'Premium subscription duration in days', '30'),

-- === LIMITS: Free tier ===
('limits.free.daily_entries', '5', 'number', 'limits', 'Free tier daily entries limit', '5'),
('limits.free.voice_allowed', 'false', 'boolean', 'limits', 'Free tier voice messages allowed', 'false'),
('limits.free.voice_daily', '0', 'number', 'limits', 'Free tier daily voice limit', '0'),

-- === LIMITS: Basic tier ===
('limits.basic.daily_entries', '20', 'number', 'limits', 'Basic tier daily entries limit', '20'),
('limits.basic.voice_allowed', 'true', 'boolean', 'limits', 'Basic tier voice messages allowed', 'true'),
('limits.basic.voice_daily', '5', 'number', 'limits', 'Basic tier daily voice limit', '5'),

-- === LIMITS: Premium tier ===
('limits.premium.daily_entries', '-1', 'number', 'limits', 'Premium tier daily entries limit (-1 = unlimited)', '-1'),
('limits.premium.voice_allowed', 'true', 'boolean', 'limits', 'Premium tier voice messages allowed', 'true'),
('limits.premium.voice_daily', '-1', 'number', 'limits', 'Premium tier daily voice limit (-1 = unlimited)', '-1'),

-- === AI SETTINGS ===
('ai.default_model', 'gpt-4o-mini', 'string', 'ai', 'Default AI model for mood analysis', 'gpt-4o-mini'),
('ai.temperature', '0.7', 'number', 'ai', 'AI temperature (0.0-2.0)', '0.7'),
('ai.max_tokens', '500', 'number', 'ai', 'Maximum tokens in AI response', '500'),
('ai.system_prompt', 'Ты — эмпатичный психолог-аналитик. Твоя задача — анализировать записи дневника и определять эмоциональное состояние человека.

Отвечай ТОЛЬКО в формате JSON (без markdown):
{
  "moodScore": <число от 1 до 10, где 1 = очень плохо, 5 = нейтрально, 10 = отлично>,
  "moodLabel": "<одно слово: радость/грусть/тревога/спокойствие/злость/усталость/воодушевление/апатия>",
  "tags": ["<тег1>", "<тег2>", "<тег3>"],
  "summary": "<краткое резюме записи в 1-2 предложениях>",
  "suggestions": "<мягкая рекомендация или поддержка в 1-2 предложениях>"
}

Правила:
- Теги должны отражать ключевые эмоции и темы (максимум 5 тегов)
- Рекомендации должны быть тёплыми и поддерживающими, не навязчивыми
- Если запись слишком короткая для анализа, всё равно постарайся дать оценку
- Отвечай на русском языке', 'string', 'ai', 'System prompt for mood analysis', ''),

-- === RATE LIMITING ===
('rate_limit.api.window_ms', '60000', 'number', 'rate_limit', 'API rate limit window in milliseconds', '60000'),
('rate_limit.api.max_requests', '60', 'number', 'rate_limit', 'API max requests per window', '60'),
('rate_limit.ai.max_requests', '10', 'number', 'rate_limit', 'AI endpoints max requests per minute', '10'),

-- === FEATURE FLAGS ===
('feature.voice_enabled', 'true', 'boolean', 'features', 'Enable voice message processing globally', 'true'),
('feature.adsgram_enabled', 'false', 'boolean', 'features', 'Enable Adsgram ads integration', 'false'),
('feature.maintenance_mode', 'false', 'boolean', 'features', 'Enable maintenance mode (disable new entries)', 'false'),

-- === UI MESSAGES ===
('msg.welcome', '👋 Привет, {name}!

Я — твой AI-дневник настроения. Просто отправь мне сообщение о том, как прошёл твой день, и я помогу проанализировать твои эмоции.

📝 *Что я умею:*
• Анализировать текстовые записи
• Распознавать голосовые сообщения (Premium)
• Отслеживать динамику настроения
• Давать мягкие рекомендации

Начни прямо сейчас — напиши, как ты себя чувствуешь!', 'string', 'messages', 'Welcome message template. Use {name} for user name', ''),

('msg.help', '📖 *Как пользоваться дневником:*

1️⃣ Просто отправь мне сообщение о своих мыслях и чувствах
2️⃣ Я проанализирую твоё настроение и сохраню запись
3️⃣ Открой веб-приложение, чтобы увидеть статистику

*Команды:*
/start — начать сначала
/stats — краткая статистика
/premium — информация о подписке
/help — эта справка', 'string', 'messages', 'Help command message', ''),

('msg.limit_exceeded', '⚠️ {reason}

Оформи подписку, чтобы увеличить лимиты! /premium', 'string', 'messages', 'Limit exceeded message template', ''),

('msg.error_generic', '😔 Не удалось обработать запрос. Попробуй ещё раз позже.', 'string', 'messages', 'Generic error message', ''),

('msg.voice_processing', '🎤 Расшифровываю голосовое сообщение...', 'string', 'messages', 'Voice processing status message', ''),

('msg.payment_success', '✅ Спасибо за покупку!

Твоя подписка активирована. Наслаждайся всеми возможностями! 🎉', 'string', 'messages', 'Successful payment message', '')

ON CONFLICT (key) DO NOTHING;

-- ============================================
-- VIEW ДЛЯ DIRECTUS
-- ============================================

-- Вью для удобного просмотра конфига в Directus
CREATE OR REPLACE VIEW config_summary AS
SELECT 
  category,
  COUNT(*) as total_keys,
  COUNT(*) FILTER (WHERE is_active = TRUE) as active_keys
FROM app_config
GROUP BY category
ORDER BY category;

COMMENT ON TABLE app_config IS 'Dynamic application configuration for Directus CMS';
COMMENT ON COLUMN app_config.key IS 'Unique configuration key (dot notation for hierarchy)';
COMMENT ON COLUMN app_config.value IS 'Configuration value (will be parsed according to value_type)';
COMMENT ON COLUMN app_config.default_value IS 'Fallback value if parsing fails or service unavailable';
