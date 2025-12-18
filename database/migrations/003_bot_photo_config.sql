-- ============================================
-- MIGRATION 003: Add bot photo configuration
-- Фото для /start и /help сообщений бота
-- ============================================

-- Добавляем категорию 'bot' если её нет
-- Сначала проверяем, есть ли уже категория bot в enum
DO $$ 
BEGIN
    -- Попытаемся добавить категорию 'bot' в enum
    ALTER TYPE app.config_category ADD VALUE IF NOT EXISTS 'bot';
EXCEPTION
    WHEN duplicate_object THEN
        -- Категория уже существует
        NULL;
END $$;

-- Добавляем конфигурационные записи для фотографий бота
INSERT INTO app.app_config (key, value, value_type, category, description, default_value, is_secret, is_active)
VALUES 
-- Фото для приветствия новых пользователей
('bot.welcome_photo_url', '', 'string', 'bot', 'URL фото для приветствия новых пользователей (команда /start для пользователей без timezone)', ''),

-- Фото для /start существующих пользователей  
('bot.start_photo_url', '', 'string', 'bot', 'URL фото для команды /start (для активных пользователей)', ''),

-- Фото для /help
('bot.help_photo_url', '', 'string', 'bot', 'URL фото для команды /help', '')

ON CONFLICT (key) DO NOTHING;

-- Подсказка по использованию:
-- Можно использовать:
-- 1. Прямую ссылку на изображение (https://example.com/photo.jpg)
-- 2. file_id от Telegram (если фото уже загружено в Telegram)
-- 
-- Примеры URL:
-- https://i.imgur.com/abc123.jpg
-- AgACAgIAAxkBAAIBc2Z... (file_id от Telegram)
