# Deployment Guide: AI Mindful Journal

## Архитектура развёртывания

```
┌─────────────────────────────────────────────────────────────┐
│                         VERCEL                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Frontend (Vite + React)                 │    │
│  │              https://your-app.vercel.app             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    RAILWAY / RENDER                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │     Backend (Express + Telegram Bot + Prisma)        │    │
│  │     https://your-api.railway.app                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE / NEON                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              PostgreSQL Database                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

> ⚠️ **Важно**: Telegram Bot требует постоянно работающий сервер (long-polling) или webhook. Vercel Serverless Functions не подходят для бота из-за timeout ограничений. Рекомендуется: **Frontend на Vercel + Backend на Railway**.

---

## Шаг 1: База данных (Supabase или Neon)

### Вариант A: Supabase (рекомендуется)

1. Создайте проект на [supabase.com](https://supabase.com)
2. Скопируйте Connection String:
   - Settings → Database → Connection string → URI
   - Формат: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`

3. Примените схему:
```bash
# Локально через psql
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" -f database/schema.sql
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" -f database/config_schema.sql
```

### Вариант B: Neon

1. Создайте проект на [neon.tech](https://neon.tech)
2. Скопируйте Connection String из Dashboard

---

## Шаг 2: Backend на Railway

### 2.1. Подготовка

1. Зарегистрируйтесь на [railway.app](https://railway.app)
2. Подключите GitHub репозиторий

### 2.2. Создание сервиса

```bash
# Установите Railway CLI
npm install -g @railway/cli

# Авторизуйтесь
railway login

# Инициализируйте проект (из корня репозитория)
railway init
```

### 2.3. Настройка переменных окружения

В Railway Dashboard → Variables добавьте:

```env
# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=production

# WebApp URL (будет после деплоя Vercel)
WEBAPP_URL=https://your-app.vercel.app

# JWT Secret (генерируем)
JWT_SECRET=your-random-secret-key-here

# Logging
LOG_LEVEL=info
```

### 2.4. Настройка Railway для монорепо

Создайте файл `railway.json` в корне:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "cd server && npm run start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### 2.5. Деплой

```bash
# Из корня репозитория
railway up
```

Или настройте автодеплой из GitHub в Railway Dashboard.

---

## Шаг 3: Frontend на Vercel

### 3.1. Настройка Vercel

1. Перейдите на [vercel.com](https://vercel.com)
2. Import Git Repository → выберите ваш репозиторий
3. Настройте:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3.2. Переменные окружения в Vercel

Settings → Environment Variables:

```env
VITE_API_URL=https://your-api.railway.app
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
```

### 3.3. vercel.json (уже должен быть в client/)

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

### 3.4. Деплой

```bash
# Установите Vercel CLI
npm install -g vercel

# Деплой
cd client
vercel --prod
```

---

## Шаг 4: Настройка Telegram Bot Webhook

После деплоя backend, настройте webhook:

```bash
# Замените значения
BOT_TOKEN="your_bot_token"
WEBHOOK_URL="https://your-api.railway.app/bot/webhook"

# Установите webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${WEBHOOK_URL}\"}"

# Проверьте статус
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

---

## Шаг 5: Финальная конфигурация

### 5.1. Обновите WEBAPP_URL в Railway

После деплоя Vercel, обновите переменную:
```
WEBAPP_URL=https://your-app.vercel.app
```

### 5.2. Настройте Telegram WebApp

В @BotFather:
```
/mybots → Ваш бот → Bot Settings → Menu Button → Configure menu button
URL: https://your-app.vercel.app
```

---

## Скрипты для быстрого деплоя

### deploy.ps1 (Windows PowerShell)

```powershell
# Деплой всего проекта
param(
    [switch]$Frontend,
    [switch]$Backend,
    [switch]$All
)

if ($All -or $Backend) {
    Write-Host "🚀 Deploying Backend to Railway..." -ForegroundColor Cyan
    railway up
}

if ($All -or $Frontend) {
    Write-Host "🚀 Deploying Frontend to Vercel..." -ForegroundColor Cyan
    Set-Location client
    vercel --prod
    Set-Location ..
}

Write-Host "✅ Deployment complete!" -ForegroundColor Green
```

### deploy.sh (Linux/Mac)

```bash
#!/bin/bash

deploy_backend() {
    echo "🚀 Deploying Backend to Railway..."
    railway up
}

deploy_frontend() {
    echo "🚀 Deploying Frontend to Vercel..."
    cd client && vercel --prod && cd ..
}

case "$1" in
    backend) deploy_backend ;;
    frontend) deploy_frontend ;;
    all|"") deploy_backend && deploy_frontend ;;
    *) echo "Usage: ./deploy.sh [backend|frontend|all]" ;;
esac

echo "✅ Deployment complete!"
```

---

## Мониторинг и логи

### Railway
```bash
# Логи в реальном времени
railway logs

# Статус сервиса
railway status
```

### Vercel
```bash
# Логи
vercel logs your-app.vercel.app

# Статус
vercel ls
```

---

## Troubleshooting

### Бот не отвечает
1. Проверьте webhook: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
2. Проверьте логи Railway: `railway logs`
3. Убедитесь что `TELEGRAM_BOT_TOKEN` корректный

### WebApp не открывается
1. Проверьте что URL начинается с `https://`
2. Убедитесь что домен добавлен в BotFather

### Ошибки базы данных
1. Проверьте `DATABASE_URL` в Railway
2. Запустите миграции: `npx prisma migrate deploy`

### CORS ошибки
Добавьте домен Vercel в CORS на backend:
```typescript
app.use(cors({
  origin: ['https://your-app.vercel.app'],
  credentials: true
}));
```

---

## Стоимость

| Сервис | Free Tier | Примечание |
|--------|-----------|------------|
| Vercel | 100GB bandwidth/мес | Достаточно для старта |
| Railway | $5 credit/мес | ~500 часов работы |
| Supabase | 500MB DB, 1GB storage | Достаточно для MVP |
| Neon | 3GB storage | Альтернатива Supabase |

**Итого для MVP: ~$0-5/месяц**
