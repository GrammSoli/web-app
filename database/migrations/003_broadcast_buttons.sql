-- Добавление поддержки inline-кнопок для рассылок
-- Выполнить на сервере: psql -U postgres -d mood_tracker -f 003_broadcast_buttons.sql

ALTER TABLE broadcasts 
ADD COLUMN IF NOT EXISTS button_text VARCHAR(64),
ADD COLUMN IF NOT EXISTS button_url VARCHAR(512);

COMMENT ON COLUMN broadcasts.button_text IS 'Текст inline-кнопки под сообщением';
COMMENT ON COLUMN broadcasts.button_url IS 'URL для inline-кнопки';
