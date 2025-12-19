#!/bin/bash
# Add msg.welcome_back to config

export PGPASSWORD='Lvg4B84EmYw1cLUCJ4ciurVn7X80absS'

psql -h localhost -U mindful -d mindful_journal << 'EOF'
INSERT INTO app.app_config (key, value, value_type, category, description, default_value)
VALUES 
('msg.welcome_back', 'Рад тебя видеть! 🌿

Можешь писать мысли или отправлять голосовые прямо сюда. Я всё сохраню. Или открой приложение, чтобы увидеть аналитику.', 'string', 'messages', 'Сообщение для вернувшихся пользователей (команда /start)', 'Рад тебя видеть! 🌿

Можешь писать мысли или отправлять голосовые прямо сюда. Я всё сохраню. Или открой приложение, чтобы увидеть аналитику.')
ON CONFLICT (key) DO NOTHING;
EOF

echo "msg.welcome_back added!"
