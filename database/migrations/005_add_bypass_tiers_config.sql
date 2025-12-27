-- Migration: Add bypass_tiers feature flag and limits
-- Date: 2025-12-27
-- Description: Adds feature flag for bypassing subscription tiers (for testing)

-- Feature flag for bypass tiers
INSERT INTO app.app_config (id, key, value, value_type, category, description, default_value, is_secret, is_active, date_created, date_updated)
VALUES (
    gen_random_uuid(),
    'feature.bypass_tiers',
    'false',
    'boolean',
    'feature',
    'When enabled, all users get unified limits regardless of subscription tier. Useful for testing.',
    'false',
    false,
    true,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

-- Bypass limits
INSERT INTO app.app_config (id, key, value, value_type, category, description, default_value, is_secret, is_active, date_created, date_updated)
VALUES (
    gen_random_uuid(),
    'limits.bypass.daily_entries',
    '5',
    'number',
    'limits',
    'Daily entry limit when bypass_tiers is enabled',
    '5',
    false,
    true,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

INSERT INTO app.app_config (id, key, value, value_type, category, description, default_value, is_secret, is_active, date_created, date_updated)
VALUES (
    gen_random_uuid(),
    'limits.bypass.voice_allowed',
    'true',
    'boolean',
    'limits',
    'Allow voice messages when bypass_tiers is enabled',
    'true',
    false,
    true,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;

INSERT INTO app.app_config (id, key, value, value_type, category, description, default_value, is_secret, is_active, date_created, date_updated)
VALUES (
    gen_random_uuid(),
    'limits.bypass.voice_minutes_daily',
    '1',
    'number',
    'limits',
    'Daily voice minutes limit when bypass_tiers is enabled',
    '1',
    false,
    true,
    NOW(),
    NOW()
) ON CONFLICT (key) DO NOTHING;
