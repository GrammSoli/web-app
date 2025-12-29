SELECT telegram_id, subscription_tier, habit_freezes_used, habit_freezes_reset_month 
FROM app.users 
ORDER BY habit_freezes_used DESC 
LIMIT 10;
