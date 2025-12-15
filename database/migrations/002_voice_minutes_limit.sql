-- Migration: Change voice limits from count-based to minutes-based
-- Date: 2024-12-15
-- Description: Refactor voice quotas to be based on total duration (minutes) instead of message count

-- ============================================
-- UPDATE EXISTING CONFIG KEYS
-- ============================================

-- Rename keys from voice_daily to voice_minutes_daily
UPDATE app.app_config 
SET 
  key = 'limits.free.voice_minutes_daily',
  description = 'Free tier daily voice limit in minutes',
  date_updated = NOW()
WHERE key = 'limits.free.voice_daily';

UPDATE app.app_config 
SET 
  key = 'limits.basic.voice_minutes_daily',
  description = 'Basic tier daily voice limit in minutes',
  date_updated = NOW()
WHERE key = 'limits.basic.voice_daily';

UPDATE app.app_config 
SET 
  key = 'limits.premium.voice_minutes_daily',
  description = 'Premium tier daily voice limit in minutes',
  date_updated = NOW()
WHERE key = 'limits.premium.voice_daily';

-- ============================================
-- UPDATE app_settings JSON (if exists)
-- ============================================

UPDATE app.app_settings
SET value = jsonb_set(
  value::jsonb - 'voice_daily',
  '{voice_minutes_daily}',
  COALESCE((value::jsonb->>'voice_daily')::jsonb, '0')
)
WHERE key IN ('limits_free', 'limits_basic', 'limits_premium')
  AND value::jsonb ? 'voice_daily';

-- ============================================
-- INSERT NEW KEYS IF NOT EXISTS
-- ============================================

INSERT INTO app.app_config (key, value, value_type, category, description, default_value)
VALUES
  ('limits.free.voice_minutes_daily', '0', 'number', 'limits', 'Free tier daily voice limit in minutes', '0'),
  ('limits.basic.voice_minutes_daily', '5', 'number', 'limits', 'Basic tier daily voice limit in minutes', '5'),
  ('limits.premium.voice_minutes_daily', '-1', 'number', 'limits', 'Premium tier daily voice limit in minutes (-1 = unlimited)', '-1')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- CLEANUP OLD KEYS (optional, run after verification)
-- ============================================

-- Uncomment after verifying the migration worked:
-- DELETE FROM app.app_config WHERE key IN (
--   'limits.free.voice_daily',
--   'limits.basic.voice_daily', 
--   'limits.premium.voice_daily'
-- );
