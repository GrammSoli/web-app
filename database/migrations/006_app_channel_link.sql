-- Migration: Add app.channel_link config
-- Run: psql -h localhost -U mindful -d mindful_journal -f 006_app_channel_link.sql

INSERT INTO app.app_config (key, value, value_type, category, description, default_value)
VALUES (
    'app.channel_link',
    'https://t.me/mindful_journal_channel',
    'string',
    'app',
    'Ссылка на Telegram-канал (отображается в WebApp профиле)',
    'https://t.me/mindful_journal_channel'
)
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description,
    default_value = EXCLUDED.default_value;
