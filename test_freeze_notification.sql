-- Test freeze notification for user 437257453
-- Set freeze data to trigger notification

UPDATE app.users 
SET 
  last_freeze_notification_date = CURRENT_DATE - INTERVAL '1 day',
  last_freeze_streak = 12,
  last_freeze_habit_id = (SELECT id FROM app.habits WHERE user_id = (SELECT id FROM app.users WHERE telegram_id = 437257453) LIMIT 1)
WHERE telegram_id = 437257453;

-- Verify
SELECT telegram_id, timezone, last_freeze_notification_date, last_freeze_streak, last_freeze_habit_id
FROM app.users WHERE telegram_id = 437257453;
