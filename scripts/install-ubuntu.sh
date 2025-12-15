#!/bin/bash
# ==============================================
# AI Mindful Journal - Auto Install Script
# Ubuntu 22.04+ / Debian 12+
# ==============================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ==============================================
# КОНФИГУРАЦИЯ - ИЗМЕНИТЕ ЭТИ ЗНАЧЕНИЯ!
# ==============================================

DOMAIN="your-domain.com"              # Ваш домен
TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"   # Токен от @BotFather
OPENAI_API_KEY="sk-..."               # OpenAI API ключ
DB_PASSWORD="$(openssl rand -base64 24)"  # Автогенерация пароля
JWT_SECRET="$(openssl rand -base64 32)"   # Автогенерация секрета
GIT_REPO="https://github.com/YOUR_USERNAME/web-app.git"  # Ваш репозиторий

APP_DIR="/var/www/mindful-journal"
LOG_DIR="/var/log/mindful-journal"

# ==============================================
# ПРОВЕРКИ
# ==============================================

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║      AI Mindful Journal - Installation Script         ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Проверка root
if [ "$EUID" -ne 0 ]; then
    log_error "Запустите скрипт с sudo: sudo bash install.sh"
fi

# Проверка конфигурации
if [ "$DOMAIN" = "your-domain.com" ]; then
    log_error "Отредактируйте скрипт и укажите ваш домен!"
fi

if [ "$TELEGRAM_BOT_TOKEN" = "YOUR_BOT_TOKEN" ]; then
    log_error "Отредактируйте скрипт и укажите токен Telegram бота!"
fi

if [ "$OPENAI_API_KEY" = "sk-..." ]; then
    log_error "Отредактируйте скрипт и укажите OpenAI API ключ!"
fi

log_info "Домен: $DOMAIN"
log_info "Директория: $APP_DIR"

read -p "Продолжить установку? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# ==============================================
# УСТАНОВКА ПАКЕТОВ
# ==============================================

log_info "Обновление системы..."
apt update && apt upgrade -y

log_info "Установка базовых пакетов..."
apt install -y curl git nginx certbot python3-certbot-nginx ufw

# Node.js 20
log_info "Установка Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
log_success "Node.js $(node -v) установлен"

# PM2
log_info "Установка PM2..."
npm install -g pm2
log_success "PM2 установлен"

# PostgreSQL
log_info "Установка PostgreSQL..."
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
log_success "PostgreSQL установлен"

# ==============================================
# НАСТРОЙКА POSTGRESQL
# ==============================================

log_info "Настройка базы данных..."

sudo -u postgres psql << EOF
CREATE USER mindful WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE mindful_journal OWNER mindful;
GRANT ALL PRIVILEGES ON DATABASE mindful_journal TO mindful;
\c mindful_journal
CREATE SCHEMA app AUTHORIZATION mindful;
ALTER USER mindful SET search_path TO app, public;
EOF

log_success "База данных создана"
echo -e "${YELLOW}Сохраните пароль БД: $DB_PASSWORD${NC}"

# ==============================================
# КЛОНИРОВАНИЕ ПРОЕКТА
# ==============================================

log_info "Клонирование проекта..."
mkdir -p $APP_DIR
cd $APP_DIR

if [ -d ".git" ]; then
    git pull origin main
else
    git clone $GIT_REPO .
fi

log_success "Проект загружен"

# ==============================================
# НАСТРОЙКА BACKEND
# ==============================================

log_info "Настройка Backend..."
cd $APP_DIR/server

# Создание .env
cat > .env << EOF
# Database
DATABASE_URL=postgresql://mindful:$DB_PASSWORD@localhost:5432/mindful_journal?schema=app

# Telegram
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN

# OpenAI
OPENAI_API_KEY=$OPENAI_API_KEY

# Server
PORT=3000
NODE_ENV=production

# WebApp URL
WEBAPP_URL=https://$DOMAIN

# JWT
JWT_SECRET=$JWT_SECRET

# Logging
LOG_LEVEL=info
EOF

# Установка и сборка
npm install
npx prisma generate
npm run build

log_success "Backend настроен"

# ==============================================
# ПРИМЕНЕНИЕ СХЕМЫ БД
# ==============================================

log_info "Применение схемы БД..."
export PGPASSWORD=$DB_PASSWORD
psql -U mindful -h localhost -d mindful_journal -f $APP_DIR/database/schema.sql || true
psql -U mindful -h localhost -d mindful_journal -f $APP_DIR/database/config_schema.sql || true
unset PGPASSWORD

log_success "Схема БД применена"

# ==============================================
# НАСТРОЙКА FRONTEND
# ==============================================

log_info "Настройка Frontend..."
cd $APP_DIR/client

# Создание .env
cat > .env << EOF
VITE_API_URL=https://$DOMAIN/api
VITE_TELEGRAM_BOT_USERNAME=${TELEGRAM_BOT_TOKEN%%:*}
EOF

npm install
npm run build

log_success "Frontend собран"

# ==============================================
# НАСТРОЙКА PM2
# ==============================================

log_info "Настройка PM2..."
cd $APP_DIR

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

mkdir -p $LOG_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

log_success "PM2 настроен"

# ==============================================
# НАСТРОЙКА NGINX
# ==============================================

log_info "Настройка Nginx..."

cat > /etc/nginx/sites-available/mindful-journal << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    root $APP_DIR/client/dist;
    index index.html;
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    # API Proxy
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
    
    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # Security
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
EOF

ln -sf /etc/nginx/sites-available/mindful-journal /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

log_success "Nginx настроен"

# ==============================================
# FIREWALL
# ==============================================

log_info "Настройка Firewall..."
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

log_success "Firewall настроен"

# ==============================================
# SSL СЕРТИФИКАТ
# ==============================================

log_info "Получение SSL сертификата..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || {
    log_warn "SSL не удалось получить автоматически. Запустите вручную:"
    echo "sudo certbot --nginx -d $DOMAIN"
}

# ==============================================
# TELEGRAM WEBHOOK
# ==============================================

log_info "Настройка Telegram Webhook..."
sleep 2

WEBHOOK_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"https://${DOMAIN}/bot/webhook\"}")

if echo "$WEBHOOK_RESPONSE" | grep -q '"ok":true'; then
    log_success "Webhook установлен"
else
    log_warn "Webhook не установлен: $WEBHOOK_RESPONSE"
fi

# ==============================================
# ГОТОВО!
# ==============================================

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              УСТАНОВКА ЗАВЕРШЕНА!                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "🌐 Сайт:     ${CYAN}https://$DOMAIN${NC}"
echo -e "🤖 Бот:      ${CYAN}https://t.me/YOUR_BOT_USERNAME${NC}"
echo -e "📁 Путь:     ${CYAN}$APP_DIR${NC}"
echo ""
echo -e "${YELLOW}Сохраните эти данные:${NC}"
echo -e "  DB Password: $DB_PASSWORD"
echo -e "  JWT Secret:  $JWT_SECRET"
echo ""
echo -e "Полезные команды:"
echo -e "  ${CYAN}pm2 status${NC}         - Статус сервера"
echo -e "  ${CYAN}pm2 logs${NC}           - Логи"
echo -e "  ${CYAN}pm2 restart all${NC}    - Перезапуск"
echo -e "  ${CYAN}cd $APP_DIR && ./deploy.sh${NC} - Обновление"
echo ""

# Создание скрипта обновления
cat > $APP_DIR/deploy.sh << 'DEPLOY'
#!/bin/bash
set -e
cd /var/www/mindful-journal
echo "📥 Pulling..."
git pull origin main
echo "📦 Backend..."
cd server && npm install && npm run build && cd ..
echo "📦 Frontend..."
cd client && npm install && npm run build && cd ..
echo "🔄 Reloading..."
pm2 reload all
echo "✅ Done!"
DEPLOY
chmod +x $APP_DIR/deploy.sh

log_success "Скрипт обновления создан: $APP_DIR/deploy.sh"
