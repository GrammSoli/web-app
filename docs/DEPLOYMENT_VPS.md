# Deployment на собственный сервер (VPS)

## Требования

- Ubuntu 22.04+ / Debian 12+
- Node.js 20+
- PostgreSQL 15+
- Nginx
- Certbot (SSL)
- PM2 (process manager)

---

## Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка необходимых пакетов
sudo apt install -y curl git nginx certbot python3-certbot-nginx

# Установка Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2
sudo npm install -g pm2

# Установка PostgreSQL
sudo apt install -y postgresql postgresql-contrib
```

---

## Шаг 2: Настройка PostgreSQL

```bash
# Вход под пользователем postgres
sudo -u postgres psql

# Создание базы и пользователя
CREATE USER mindful WITH PASSWORD 'your_secure_password';
CREATE DATABASE mindful_journal OWNER mindful;
GRANT ALL PRIVILEGES ON DATABASE mindful_journal TO mindful;

# Создание схемы app
\c mindful_journal
CREATE SCHEMA app AUTHORIZATION mindful;
ALTER USER mindful SET search_path TO app, public;

\q
```

---

## Шаг 3: Клонирование проекта

```bash
# Создание директории
sudo mkdir -p /var/www/mindful-journal
sudo chown $USER:$USER /var/www/mindful-journal

# Клонирование
cd /var/www/mindful-journal
git clone https://github.com/YOUR_USERNAME/web-app.git .

# Или копирование с локальной машины
# scp -r ./web-app/* user@your-server:/var/www/mindful-journal/
```

---

## Шаг 4: Настройка Backend

```bash
cd /var/www/mindful-journal/server

# Установка зависимостей
npm install

# Создание .env файла
cat > .env << 'EOF'
# Database
DATABASE_URL=postgresql://mindful:your_secure_password@localhost:5432/mindful_journal?schema=app

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=production

# WebApp URL
WEBAPP_URL=https://your-domain.com

# JWT
JWT_SECRET=your-random-secret-key-32-chars

# Logging
LOG_LEVEL=info
EOF

# Применение схемы БД
psql "postgresql://mindful:your_secure_password@localhost:5432/mindful_journal" -f ../database/schema.sql
psql "postgresql://mindful:your_secure_password@localhost:5432/mindful_journal" -f ../database/config_schema.sql

# Генерация Prisma клиента
npx prisma generate

# Сборка TypeScript
npm run build
```

---

## Шаг 5: Настройка Frontend

```bash
cd /var/www/mindful-journal/client

# Установка зависимостей
npm install

# Создание .env
cat > .env << 'EOF'
VITE_API_URL=https://your-domain.com/api
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
EOF

# Сборка
npm run build
```

---

## Шаг 6: Настройка PM2

```bash
cd /var/www/mindful-journal

# Создание конфигурации PM2
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'mindful-journal-api',
    cwd: './server',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/mindful-journal/error.log',
    out_file: '/var/log/mindful-journal/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Создание директории для логов
sudo mkdir -p /var/log/mindful-journal
sudo chown $USER:$USER /var/log/mindful-journal

# Запуск через PM2
pm2 start ecosystem.config.js

# Автозапуск при перезагрузке
pm2 startup
pm2 save
```

---

## Шаг 7: Настройка Nginx

```bash
# Создание конфигурации
sudo cat > /etc/nginx/sites-available/mindful-journal << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    # Frontend (статика)
    root /var/www/mindful-journal/client/dist;
    index index.html;
    
    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    # API Proxy
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
    
    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
    }
    
    # Bot webhook
    location /bot {
        proxy_pass http://127.0.0.1:3000/bot;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

# Активация сайта
sudo ln -sf /etc/nginx/sites-available/mindful-journal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезапуск Nginx
sudo systemctl reload nginx
```

---

## Шаг 8: SSL сертификат (Let's Encrypt)

```bash
# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автообновление (уже настроено автоматически)
sudo certbot renew --dry-run
```

---

## Шаг 9: Настройка Telegram Webhook

```bash
# Замените значения
BOT_TOKEN="your_bot_token"
DOMAIN="your-domain.com"

# Установка webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"https://${DOMAIN}/bot/webhook\"}"

# Проверка
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

---

## Шаг 10: Firewall

```bash
# Настройка UFW
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Полезные команды

### PM2
```bash
pm2 status                  # Статус процессов
pm2 logs mindful-journal-api # Логи
pm2 restart all             # Перезапуск
pm2 reload all              # Graceful reload
```

### Обновление проекта
```bash
cd /var/www/mindful-journal
git pull origin main

# Backend
cd server && npm install && npm run build && cd ..

# Frontend
cd client && npm install && npm run build && cd ..

# Перезапуск
pm2 reload all
```

### Логи
```bash
# PM2 логи
pm2 logs

# Nginx логи
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# PostgreSQL логи
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

---

## Автоматизация деплоя

Создайте скрипт на сервере:

```bash
cat > /var/www/mindful-journal/deploy.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

cd /var/www/mindful-journal

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing backend dependencies..."
cd server && npm install

echo "🔨 Building backend..."
npm run build
cd ..

echo "📦 Installing frontend dependencies..."
cd client && npm install

echo "🔨 Building frontend..."
npm run build
cd ..

echo "🔄 Reloading PM2..."
pm2 reload all

echo "✅ Deployment complete!"
EOF

chmod +x /var/www/mindful-journal/deploy.sh
```

Запуск: `./deploy.sh`
