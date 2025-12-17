-- ============================================
-- Migration: Add broadcast image support
-- Date: 2025-12-17
-- ============================================

-- Add comment to message_photo_url field (already exists in schema)
COMMENT ON COLUMN broadcasts.message_photo_url IS 'URL изображения для рассылки. Поддерживаемые форматы: прямая ссылка (https://...), Directus asset, Telegram File ID';

-- Verify field exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'broadcasts' 
        AND column_name = 'message_photo_url'
    ) THEN
        RAISE EXCEPTION 'Field message_photo_url does not exist in broadcasts table. Please apply base schema first.';
    END IF;
END
$$;
