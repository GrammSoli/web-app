-- Migration: Add referral tracking system
-- Date: 2025-12-24
-- Description: Track where users come from (UTM sources, referral links)

SET search_path TO app, public;

-- ============================================
-- ADD referral_source TO users
-- ============================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS referral_source VARCHAR(100) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_referral_source ON users(referral_source);

-- ============================================
-- CREATE traffic_sources TABLE for analytics
-- ============================================
CREATE TABLE IF NOT EXISTS traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source identification
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Type: utm, referral, campaign, organic
    source_type VARCHAR(50) DEFAULT 'utm',
    
    -- UTM parameters (optional)
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    -- Stats (cached, updated periodically)
    total_users INTEGER DEFAULT 0,
    total_paying_users INTEGER DEFAULT 0,
    total_revenue_usd DECIMAL(12, 4) DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traffic_sources_slug ON traffic_sources(slug);
CREATE INDEX IF NOT EXISTS idx_traffic_sources_active ON traffic_sources(is_active);

-- ============================================
-- SEED: Default sources
-- ============================================
INSERT INTO traffic_sources (slug, name, source_type, description) VALUES
    ('organic', 'Органика', 'organic', 'Пользователи без реферальной ссылки'),
    ('telegram_ads', 'Telegram Ads', 'campaign', 'Реклама в Telegram'),
    ('yandex', 'Яндекс Директ', 'utm', 'Реклама в Яндекс'),
    ('google', 'Google Ads', 'utm', 'Реклама в Google'),
    ('vk', 'VK Реклама', 'utm', 'Реклама ВКонтакте'),
    ('instagram', 'Instagram', 'utm', 'Реклама в Instagram'),
    ('youtube', 'YouTube', 'utm', 'YouTube блогеры'),
    ('friend', 'От друга', 'referral', 'Рекомендация от друзей'),
    ('test', 'Тест', 'campaign', 'Тестовые ссылки')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE traffic_sources IS 'Источники трафика для аналитики';
COMMENT ON COLUMN users.referral_source IS 'Slug источника трафика (из параметра /start)';
