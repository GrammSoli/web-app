-- Migration: Add habits tracker tables
-- Date: 2025-12-28
-- Description: Tables for habit tracking feature

-- Create habit_frequency enum
DO $$ BEGIN
    CREATE TYPE app.habit_frequency AS ENUM ('daily', 'weekdays', 'weekends', 'custom');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create habits table
CREATE TABLE IF NOT EXISTS app.habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    
    -- Habit details
    name VARCHAR(100) NOT NULL,
    emoji VARCHAR(10) DEFAULT '✨',
    color VARCHAR(20) DEFAULT '#6366f1',
    
    -- Schedule
    frequency app.habit_frequency DEFAULT 'daily',
    custom_days INTEGER[] DEFAULT '{}',
    reminder_time VARCHAR(5),
    
    -- Stats (cached)
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    
    -- Order & Status
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_archived BOOLEAN DEFAULT false,
    
    -- Timestamps
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Create habit_completions table
CREATE TABLE IF NOT EXISTS app.habit_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES app.habits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    -- Completion date (without time)
    completed_date DATE NOT NULL,
    
    -- Optional note
    note VARCHAR(500),
    
    -- Timestamp
    date_created TIMESTAMPTZ DEFAULT NOW(),
    
    -- One completion per habit per day
    CONSTRAINT habit_completions_unique UNIQUE (habit_id, completed_date)
);

-- Indexes for habits
CREATE INDEX IF NOT EXISTS idx_habits_user_active ON app.habits(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_habits_user_archived ON app.habits(user_id, is_archived);

-- Indexes for habit_completions
CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_date ON app.habit_completions(habit_id, completed_date);
CREATE INDEX IF NOT EXISTS idx_habit_completions_user_date ON app.habit_completions(user_id, completed_date);

-- Add limits config for habits
INSERT INTO app.app_config (id, key, value, value_type, category, description, default_value, is_secret, is_active, date_created, date_updated)
VALUES 
    (gen_random_uuid(), 'limits.free.max_habits', '3', 'number', 'limits', 'Maximum habits for free users', '3', false, true, NOW(), NOW()),
    (gen_random_uuid(), 'limits.basic.max_habits', '6', 'number', 'limits', 'Maximum habits for basic users', '6', false, true, NOW(), NOW()),
    (gen_random_uuid(), 'limits.premium.max_habits', '50', 'number', 'limits', 'Maximum habits for premium users (effectively unlimited)', '50', false, true, NOW(), NOW()),
    (gen_random_uuid(), 'limits.bypass.max_habits', '6', 'number', 'limits', 'Maximum habits when bypass_tiers is enabled', '6', false, true, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
