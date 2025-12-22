-- Migration: User Segments for Broadcasts
-- Date: 2025-12-22
-- Description: Adds user_segments table for flexible broadcast targeting
-- BACKWARD COMPATIBLE: existing broadcasts continue to work via target_audience

-- ============================================
-- ENUM: Segment Type
-- ============================================
DO $$ BEGIN
  CREATE TYPE segment_type AS ENUM ('system', 'dynamic', 'static');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- TABLE: User Segments
-- ============================================
CREATE TABLE IF NOT EXISTS user_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic info
  name VARCHAR(100) NOT NULL,
  description TEXT,
  slug VARCHAR(50) UNIQUE NOT NULL,  -- для программного доступа: 'all', 'premium', 'new_week'
  
  -- Segment type
  segment_type segment_type NOT NULL DEFAULT 'dynamic',
  is_system BOOLEAN NOT NULL DEFAULT false,  -- системные нельзя удалять
  
  -- Dynamic filter (JSON)
  -- Примеры:
  -- {"subscription_tier": ["premium", "basic"]}
  -- {"date_created": {"gte": "-7 days"}}
  -- {"last_entry_at": {"lt": "-30 days"}}
  filter_rules JSONB,
  
  -- Static user list (для ручного выбора)
  static_user_ids UUID[],
  
  -- Cached stats (обновляются при запросе)
  cached_user_count INT DEFAULT 0,
  cache_updated_at TIMESTAMPTZ,
  
  -- Timestamps
  date_created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_segment CHECK (
    -- Либо filter_rules, либо static_user_ids, либо оба NULL (для системных all/premium/free)
    (filter_rules IS NOT NULL) OR 
    (static_user_ids IS NOT NULL AND array_length(static_user_ids, 1) > 0) OR
    (is_system = true)
  )
);

-- ============================================
-- INDEX
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_segments_slug ON user_segments(slug);
CREATE INDEX IF NOT EXISTS idx_user_segments_type ON user_segments(segment_type);

-- ============================================
-- ADD segment_id TO broadcasts (nullable for backward compatibility)
-- ============================================
ALTER TABLE broadcasts 
ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES user_segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_broadcasts_segment ON broadcasts(segment_id);

-- ============================================
-- SEED: Predefined Segments
-- ============================================

-- System segments (replace old target_audience enum)
INSERT INTO user_segments (slug, name, description, segment_type, is_system, filter_rules) VALUES
  ('all', 'Все пользователи', 'Все активные пользователи', 'system', true, '{"status": "active"}'),
  ('premium', 'Premium подписчики', 'Пользователи с платной подпиской (Basic или Premium)', 'system', true, '{"subscription_tier": ["basic", "premium"]}'),
  ('free', 'Бесплатные пользователи', 'Пользователи без подписки', 'system', true, '{"subscription_tier": ["free"]}')
ON CONFLICT (slug) DO NOTHING;

-- Dynamic segments by registration time
INSERT INTO user_segments (slug, name, description, segment_type, is_system, filter_rules) VALUES
  ('new_day', 'Новые за день', 'Зарегистрировались за последние 24 часа', 'dynamic', false, '{"date_created": {"gte": "-1 day"}}'),
  ('new_week', 'Новые за неделю', 'Зарегистрировались за последние 7 дней', 'dynamic', false, '{"date_created": {"gte": "-7 days"}}'),
  ('new_month', 'Новые за месяц', 'Зарегистрировались за последние 30 дней', 'dynamic', false, '{"date_created": {"gte": "-30 days"}}')
ON CONFLICT (slug) DO NOTHING;

-- Dynamic segments by activity
INSERT INTO user_segments (slug, name, description, segment_type, is_system, filter_rules) VALUES
  ('inactive_7d', 'Неактивные 7 дней', 'Нет записей более 7 дней', 'dynamic', false, '{"last_entry_at": {"lt": "-7 days"}}'),
  ('inactive_30d', 'Неактивные 30 дней', 'Нет записей более 30 дней', 'dynamic', false, '{"last_entry_at": {"lt": "-30 days"}}'),
  ('active_writers', 'Активные писатели', 'Создали 10 или более записей', 'dynamic', false, '{"entries_count": {"gte": 10}}'),
  ('voice_users', 'Пробовали голос', 'Отправляли голосовые сообщения', 'dynamic', false, '{"has_voice_entries": true}')
ON CONFLICT (slug) DO NOTHING;

-- Static segment for testing
INSERT INTO user_segments (slug, name, description, segment_type, is_system, static_user_ids) VALUES
  ('test_group', 'Тестовая группа', 'Ручной список пользователей для тестирования рассылок', 'static', false, '{}')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- COMMENT
-- ============================================
COMMENT ON TABLE user_segments IS 'Сегменты пользователей для таргетированных рассылок';
COMMENT ON COLUMN user_segments.filter_rules IS 'JSON правила фильтрации: {"field": "value"} или {"field": {"gte": "-7 days"}}';
COMMENT ON COLUMN user_segments.static_user_ids IS 'Массив UUID пользователей для статических сегментов';
