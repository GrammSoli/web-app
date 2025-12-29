-- Add freeze limits config to app.app_config
INSERT INTO app.app_config (key, value, value_type, category, description, default_value) VALUES 
('limits.free.habit_freezes', '1', 'number', 'limits', 'Streak freezes per month for free tier', '1'),
('limits.basic.habit_freezes', '2', 'number', 'limits', 'Streak freezes per month for basic tier', '2'),
('limits.premium.habit_freezes', '3', 'number', 'limits', 'Streak freezes per month for premium tier', '3')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
