-- Subscription Plan Features Configuration
-- Run this SQL to add editable plan features

-- Basic plan features (JSON array of strings)
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('subscription.basic.features', '["20 записей в день", "5 голосовых в день", "Расширенный анализ", "Теги и рекомендации"]', 'json', 'Basic plan feature list', 'subscription', 'system', '["20 записей в день", "5 голосовых в день", "Расширенный анализ", "Теги и рекомендации"]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Premium plan features (JSON array of strings)
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('subscription.premium.features', '["Безлимитные записи", "Безлимитные голосовые", "Глубокий анализ с ИИ", "Персональные инсайты", "Приоритетная поддержка"]', 'json', 'Premium plan feature list', 'subscription', 'system', '["Безлимитные записи", "Безлимитные голосовые", "Глубокий анализ с ИИ", "Персональные инсайты", "Приоритетная поддержка"]')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Plan names (optional customization)
INSERT INTO app.app_config (key, value, value_type, description, category, updated_by, default_value) VALUES
('subscription.basic.name', 'Basic', 'string', 'Basic plan display name', 'subscription', 'system', 'Basic'),
('subscription.premium.name', 'Premium', 'string', 'Premium plan display name', 'subscription', 'system', 'Premium')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
