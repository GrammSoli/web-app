#!/bin/bash
# Apply migration for bot photo config

export PGPASSWORD='Lvg4B84EmYw1cLUCJ4ciurVn7X80absS'

# Add 'bot' category to enum
psql -h localhost -U mindful -d mindful_journal << 'EOF'
DO $$ 
BEGIN
    ALTER TYPE app.config_category ADD VALUE IF NOT EXISTS 'bot';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO app.app_config (key, value, value_type, category, description, default_value)
VALUES 
('bot.welcome_photo_url', '', 'string', 'bot', 'URL фото для приветствия новых пользователей (команда /start для пользователей без timezone)', ''),
('bot.start_photo_url', '', 'string', 'bot', 'URL фото для команды /start (для активных пользователей)', ''),
('bot.help_photo_url', '', 'string', 'bot', 'URL фото для команды /help', '')
ON CONFLICT (key) DO NOTHING;
EOF

echo "Migration applied successfully!"
