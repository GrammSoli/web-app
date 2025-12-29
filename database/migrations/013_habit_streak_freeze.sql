-- Migration: Add Habit Streak Freeze Feature
-- Date: 2024-12-29
-- Description: Adds streak freeze counters to users table for habit tracker

-- Add freeze fields to users table
ALTER TABLE app.users 
ADD COLUMN IF NOT EXISTS habit_freezes_available INT NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS habit_freezes_used INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS habit_freezes_reset_month DATE DEFAULT (date_trunc('month', CURRENT_DATE)::date);

-- Comment
COMMENT ON COLUMN app.users.habit_freezes_available IS 'Max freezes per month based on tier: free=1, basic=2, premium=3';
COMMENT ON COLUMN app.users.habit_freezes_used IS 'Freezes used this month';
COMMENT ON COLUMN app.users.habit_freezes_reset_month IS 'First day of current month for reset tracking';

-- Config for freeze limits per tier
INSERT INTO app.config (key, value, description, is_public)
VALUES 
  ('limits.free.habit_freezes', '1', 'Max habit streak freezes per month for free tier', false),
  ('limits.basic.habit_freezes', '2', 'Max habit streak freezes per month for basic tier', false),
  ('limits.premium.habit_freezes', '3', 'Max habit streak freezes per month for premium tier', false),
  ('limits.bypass.habit_freezes', '3', 'Max habit streak freezes when bypass_tiers is enabled', false)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
