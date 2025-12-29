-- Migration: Fix freeze logic - move to daily batch processing
-- Date: 2025-12-29

-- Add field to track when freeze was last applied (per user per day)
ALTER TABLE app.users 
ADD COLUMN IF NOT EXISTS last_freeze_applied_date DATE;

-- Add frozen_dates to habit_completions to mark frozen days
-- Instead of completion, we track it as a "frozen" entry
ALTER TABLE app.habit_completions
ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT false;

COMMENT ON COLUMN app.users.last_freeze_applied_date IS 'Date when freeze was last applied (prevents multiple applications per day)';
COMMENT ON COLUMN app.habit_completions.is_frozen IS 'True if this day was saved by freeze (no actual completion)';

-- Index for faster freeze queries
CREATE INDEX IF NOT EXISTS idx_users_freeze_date ON app.users(last_freeze_applied_date) WHERE last_freeze_applied_date IS NOT NULL;
