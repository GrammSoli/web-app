-- ============================================
-- AI Mindful Journal - PostgreSQL Schema
-- Compatible with Directus CMS
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_status AS ENUM ('active', 'banned', 'deleted');
CREATE TYPE subscription_tier AS ENUM ('free', 'basic', 'premium');
CREATE TYPE service_type AS ENUM ('gpt-4o-mini', 'whisper-1');
CREATE TYPE broadcast_status AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed');
CREATE TYPE broadcast_audience AS ENUM ('all', 'premium', 'free');
CREATE TYPE transaction_type AS ENUM ('stars_payment', 'adsgram_reward', 'refund');

-- ============================================
-- USERS TABLE
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    language_code VARCHAR(10) DEFAULT 'ru',
    
    -- Subscription & Balance
    subscription_tier subscription_tier DEFAULT 'free',
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    balance_stars INTEGER DEFAULT 0,
    
    -- Aggregated stats (updated via triggers/cron)
    total_entries_count INTEGER DEFAULT 0,
    total_voice_count INTEGER DEFAULT 0,
    total_spend_usd DECIMAL(10, 4) DEFAULT 0.0000,
    
    -- Status & Admin
    status user_status DEFAULT 'active',
    is_admin BOOLEAN DEFAULT FALSE,
    
    -- Directus standard fields
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes hint
    CONSTRAINT telegram_id_positive CHECK (telegram_id > 0)
);

-- Index for fast Telegram ID lookups
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_subscription ON users(subscription_tier);

-- ============================================
-- JOURNAL ENTRIES TABLE
-- ============================================

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Content
    text_content TEXT NOT NULL,
    voice_file_id VARCHAR(255),  -- Telegram file_id for voice
    voice_duration_seconds INTEGER,
    is_voice BOOLEAN DEFAULT FALSE,
    
    -- AI Analysis Results
    mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 10),
    mood_label VARCHAR(50),  -- "happy", "sad", "anxious", etc.
    ai_tags JSONB DEFAULT '[]',  -- ["радость", "благодарность", "усталость"]
    ai_summary TEXT,  -- Short AI-generated summary
    ai_suggestions TEXT,  -- AI recommendations
    
    -- Processing status
    is_processed BOOLEAN DEFAULT FALSE,
    processing_error TEXT,
    
    -- Directus standard fields
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for entries
CREATE INDEX idx_entries_user_id ON journal_entries(user_id);
CREATE INDEX idx_entries_date ON journal_entries(date_created DESC);
CREATE INDEX idx_entries_mood ON journal_entries(mood_score);
CREATE INDEX idx_entries_tags ON journal_entries USING GIN(ai_tags);

-- ============================================
-- USAGE LOGS TABLE (API Cost Tracking)
-- ============================================

CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    
    -- Service details
    service_type service_type NOT NULL,
    model_name VARCHAR(50) NOT NULL,  -- 'gpt-4o-mini', 'whisper-1'
    
    -- Usage metrics
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,  -- For audio
    
    -- Cost calculation (precise)
    cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.000000,
    
    -- Request metadata
    request_id VARCHAR(100),  -- OpenAI request ID for debugging
    latency_ms INTEGER,  -- Response time
    
    -- Directus standard fields
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for usage analytics
CREATE INDEX idx_usage_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_service ON usage_logs(service_type);
CREATE INDEX idx_usage_date ON usage_logs(date_created DESC);
CREATE INDEX idx_usage_cost ON usage_logs(cost_usd);

-- ============================================
-- TRANSACTIONS TABLE (Revenue Tracking)
-- ============================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type transaction_type NOT NULL,
    
    -- Amounts
    amount_stars INTEGER DEFAULT 0,
    amount_usd DECIMAL(10, 4) DEFAULT 0.0000,  -- Converted at time of transaction
    
    -- Telegram payment info
    telegram_payment_id VARCHAR(255),
    telegram_payment_charge_id VARCHAR(255),
    
    -- Status
    is_successful BOOLEAN DEFAULT TRUE,
    failure_reason TEXT,
    
    -- Directus standard fields
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_date ON transactions(date_created DESC);

-- ============================================
-- SUBSCRIPTIONS TABLE (History)
-- ============================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id),
    
    -- Subscription details
    tier subscription_tier NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Pricing at time of purchase
    price_stars INTEGER NOT NULL,
    price_usd DECIMAL(10, 4) NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Directus standard fields
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(is_active, expires_at);

-- ============================================
-- BROADCASTS TABLE (Mass Messaging)
-- ============================================

CREATE TABLE broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Content
    title VARCHAR(255) NOT NULL,  -- Internal name
    message_text TEXT NOT NULL,   -- What users see
    message_photo_url TEXT,       -- Optional image
    
    -- Targeting
    target_audience broadcast_audience DEFAULT 'all',
    
    -- Scheduling
    scheduled_at TIMESTAMP WITH TIME ZONE,
    
    -- Execution status
    status broadcast_status DEFAULT 'draft',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Stats (updated during/after sending)
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    
    -- Error tracking
    last_error TEXT,
    
    -- Directus standard fields
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_created UUID,  -- Directus admin who created
    user_updated UUID   -- Directus admin who last updated
);

CREATE INDEX idx_broadcasts_status ON broadcasts(status);
CREATE INDEX idx_broadcasts_scheduled ON broadcasts(scheduled_at) WHERE status = 'scheduled';

-- ============================================
-- APP SETTINGS TABLE (Key-Value Config)
-- ============================================

CREATE TABLE app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
    ('pricing_stars', '{"basic_monthly": 50, "premium_monthly": 150}', 'Subscription prices in Telegram Stars'),
    ('pricing_usd_rate', '{"stars_to_usd": 0.02}', 'Conversion rate: 1 Star = $0.02'),
    ('ai_pricing', '{"gpt4o_mini_input": 0.00000015, "gpt4o_mini_output": 0.0000006, "whisper_per_minute": 0.006}', 'OpenAI API pricing'),
    ('limits_free', '{"daily_entries": 5, "voice_allowed": false, "voice_minutes_daily": 0}', 'Free tier limits'),
    ('limits_basic', '{"daily_entries": 20, "voice_allowed": true, "voice_minutes_daily": 5}', 'Basic tier limits'),
    ('limits_premium', '{"daily_entries": -1, "voice_allowed": true, "voice_minutes_daily": -1}', 'Premium tier limits (-1 = unlimited)'),
    ('maintenance_mode', 'false', 'Enable maintenance mode'),
    ('admin_telegram_ids', '[437257453]', 'List of admin Telegram IDs');

-- ============================================
-- VIEWS FOR DIRECTUS INSIGHTS
-- ============================================

-- Daily API costs view
CREATE OR REPLACE VIEW v_daily_api_costs AS
SELECT 
    DATE(date_created) as date,
    service_type,
    COUNT(*) as requests_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(duration_seconds) as total_audio_seconds,
    SUM(cost_usd) as total_cost_usd
FROM usage_logs
GROUP BY DATE(date_created), service_type
ORDER BY date DESC;

-- Daily revenue view
CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT 
    DATE(date_created) as date,
    transaction_type,
    COUNT(*) as transactions_count,
    SUM(amount_stars) as total_stars,
    SUM(amount_usd) as total_usd
FROM transactions
WHERE is_successful = TRUE
GROUP BY DATE(date_created), transaction_type
ORDER BY date DESC;

-- Profit/Loss view (expenses vs revenue)
CREATE OR REPLACE VIEW v_daily_profit AS
SELECT 
    COALESCE(c.date, r.date) as date,
    COALESCE(c.total_cost_usd, 0) as expenses_usd,
    COALESCE(r.total_usd, 0) as revenue_usd,
    COALESCE(r.total_usd, 0) - COALESCE(c.total_cost_usd, 0) as profit_usd
FROM 
    (SELECT DATE(date_created) as date, SUM(cost_usd) as total_cost_usd 
     FROM usage_logs GROUP BY DATE(date_created)) c
FULL OUTER JOIN 
    (SELECT DATE(date_created) as date, SUM(amount_usd) as total_usd 
     FROM transactions WHERE is_successful = TRUE GROUP BY DATE(date_created)) r
ON c.date = r.date
ORDER BY date DESC;

-- User stats view
CREATE OR REPLACE VIEW v_user_stats AS
SELECT 
    subscription_tier,
    status,
    COUNT(*) as users_count,
    SUM(total_entries_count) as total_entries,
    SUM(balance_stars) as total_balance_stars
FROM users
GROUP BY subscription_tier, status;

-- Today's summary view
CREATE OR REPLACE VIEW v_today_summary AS
SELECT 
    (SELECT COUNT(*) FROM users WHERE DATE(date_created) = CURRENT_DATE) as new_users_today,
    (SELECT COUNT(*) FROM journal_entries WHERE DATE(date_created) = CURRENT_DATE) as entries_today,
    (SELECT COALESCE(SUM(cost_usd), 0) FROM usage_logs WHERE DATE(date_created) = CURRENT_DATE) as api_cost_today,
    (SELECT COALESCE(SUM(amount_usd), 0) FROM transactions WHERE DATE(date_created) = CURRENT_DATE AND is_successful = TRUE) as revenue_today;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update user stats after new entry
CREATE OR REPLACE FUNCTION update_user_entry_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users 
    SET 
        total_entries_count = total_entries_count + 1,
        total_voice_count = total_voice_count + CASE WHEN NEW.is_voice THEN 1 ELSE 0 END,
        date_updated = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_user_entry_stats
AFTER INSERT ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION update_user_entry_stats();

-- Function to update user total spend after usage log
CREATE OR REPLACE FUNCTION update_user_spend()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users 
    SET 
        total_spend_usd = total_spend_usd + NEW.cost_usd,
        date_updated = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_user_spend
AFTER INSERT ON usage_logs
FOR EACH ROW
EXECUTE FUNCTION update_user_spend();

-- Function to auto-update date_updated
CREATE OR REPLACE FUNCTION update_date_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.date_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with date_updated
CREATE TRIGGER trg_users_date_updated
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_date_updated();

CREATE TRIGGER trg_entries_date_updated
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION update_date_updated();

CREATE TRIGGER trg_subscriptions_date_updated
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION update_date_updated();

CREATE TRIGGER trg_broadcasts_date_updated
BEFORE UPDATE ON broadcasts
FOR EACH ROW EXECUTE FUNCTION update_date_updated();

CREATE TRIGGER trg_settings_date_updated
BEFORE UPDATE ON app_settings
FOR EACH ROW EXECUTE FUNCTION update_date_updated();

-- ============================================
-- SEED ADMIN USER
-- ============================================

INSERT INTO users (telegram_id, username, first_name, is_admin, subscription_tier, status)
VALUES (437257453, 'admin', 'Mikhail', TRUE, 'premium', 'active')
ON CONFLICT (telegram_id) DO UPDATE SET is_admin = TRUE;
