-- Migration: Add last freeze notification tracking
-- Date: 2025-12-29

-- Add last_freeze_notification_date to track when we last notified about freeze usage
ALTER TABLE app.users 
ADD COLUMN IF NOT EXISTS last_freeze_notification_date DATE;

-- Add last_freeze_habit_id to track which habit triggered the freeze
ALTER TABLE app.users 
ADD COLUMN IF NOT EXISTS last_freeze_habit_id UUID REFERENCES app.habits(id) ON DELETE SET NULL;

-- Add last_freeze_streak to track what streak was saved
ALTER TABLE app.users 
ADD COLUMN IF NOT EXISTS last_freeze_streak INTEGER DEFAULT 0;

COMMENT ON COLUMN app.users.last_freeze_notification_date IS 'Date when user was last notified about freeze usage';
COMMENT ON COLUMN app.users.last_freeze_habit_id IS 'Habit that triggered the last freeze';
COMMENT ON COLUMN app.users.last_freeze_streak IS 'Streak value that was saved by the last freeze';
