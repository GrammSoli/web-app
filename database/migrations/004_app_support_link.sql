#!/bin/bash
# Add app.support_link to config

export PGPASSWORD='Lvg4B84EmYw1cLUCJ4ciurVn7X80absS'

psql -h localhost -U mindful -d mindful_journal << 'EOF'
-- Add 'app' category if not exists
DO $$ 
BEGIN
    ALTER TYPE app.config_category ADD VALUE IF NOT EXISTS 'app';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add support link config
INSERT INTO app.app_config (key, value, value_type, category, description, default_value)
VALUES 
('app.support_link', 'https://t.me/mindful_support', 'string', 'app', 'Ссылка на поддержку (отображается в WebApp профиле)', 'https://t.me/mindful_support')
ON CONFLICT (key) DO NOTHING;
EOF

echo "app.support_link added!"
