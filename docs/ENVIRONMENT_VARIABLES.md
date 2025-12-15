# 🔐 Переменные окружения

> Полный справочник всех переменных окружения для AI Mindful Journal

---

## 📋 Обзор

Приложение использует переменные окружения для настройки сервера, подключения к базе данных, интеграции с внешними сервисами и конфигурации rate limiting.

**Рекомендация:** Создайте файл `.env` в корне проекта на основе `.env.example`.

---

## 🚨 Обязательные переменные (REQUIRED)

Без этих переменных сервер **не запустится** и завершит работу с ошибкой.

| Переменная | Описание | Пример | Секрет? |
|------------|----------|--------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/mindful` | 🔒 Да |
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather | `123456789:ABCdefGHI...` | 🔒 Да |
| `OPENAI_API_KEY` | API ключ OpenAI | `sk-proj-...` | 🔒 Да |

### Примеры значений

```bash
# PostgreSQL (Docker)
DATABASE_URL="postgresql://postgres:your-secure-password@localhost:5432/mindful_journal"

# PostgreSQL (Production с SSL)
DATABASE_URL="postgresql://user:pass@db.example.com:5432/mindful?sslmode=require"

# Telegram Bot
TELEGRAM_BOT_TOKEN="7123456789:AAHbYx..."

# OpenAI
OPENAI_API_KEY="sk-proj-abcdefghijklmnop..."
```

---

## ⚙️ Серверные переменные

| Переменная | Описание | По умолчанию | Секрет? |
|------------|----------|--------------|---------|
| `PORT` | Порт HTTP сервера | `3000` | ❌ |
| `NODE_ENV` | Окружение (`development` / `production`) | `development` | ❌ |
| `LOG_LEVEL` | Уровень логирования Pino | `debug` (dev) / `info` (prod) | ❌ |
| `CORS_ORIGIN` | Разрешённые origins для CORS | `*` | ❌ |

```bash
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN="https://your-domain.com"
```

---

## 🤖 Telegram интеграция

| Переменная | Описание | По умолчанию | Секрет? |
|------------|----------|--------------|---------|
| `TELEGRAM_BOT_TOKEN` | Токен бота (обязательный) | — | 🔒 Да |
| `WEBAPP_URL` | URL Mini App для inline кнопок | — | ❌ |
| `WEBHOOK_URL` | URL для Telegram webhook (production) | — | ❌ |
| `ADMIN_TELEGRAM_IDS` | ID администраторов (через запятую) | — | ❌ |

```bash
TELEGRAM_BOT_TOKEN="7123456789:AAHbYx..."
WEBAPP_URL="https://your-app.com"
WEBHOOK_URL="https://your-api.com"
ADMIN_TELEGRAM_IDS="123456789,987654321"
```

### Как получить токен бота

1. Открой [@BotFather](https://t.me/BotFather) в Telegram
2. Отправь команду `/newbot`
3. Выбери имя и username для бота
4. Скопируй токен

### Как узнать свой Telegram ID

1. Открой [@userinfobot](https://t.me/userinfobot)
2. Отправь любое сообщение
3. Бот покажет твой ID

---

## 🧠 OpenAI конфигурация

| Переменная | Описание | По умолчанию | Секрет? |
|------------|----------|--------------|---------|
| `OPENAI_API_KEY` | API ключ (обязательный) | — | 🔒 Да |

```bash
OPENAI_API_KEY="sk-proj-..."
```

### Как получить ключ

1. Зарегистрируйся на [platform.openai.com](https://platform.openai.com)
2. Перейди в Settings → API Keys
3. Создай новый ключ и скопируй его

> ⚠️ **Важно:** Убедись, что у ключа есть доступ к моделям `gpt-4o-mini` и `whisper-1`

---

## 🛡️ Rate Limiting

### Общий API лимит

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `RATE_LIMIT_WINDOW_MS` | Окно времени (мс) | `60000` (1 мин) |
| `RATE_LIMIT_MAX_REQUESTS` | Макс. запросов в окне | `60` |

### AI запросы (более строгий)

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `AI_RATE_LIMIT_WINDOW_MS` | Окно времени для AI (мс) | `60000` |
| `AI_RATE_LIMIT_MAX_REQUESTS` | Макс. AI запросов в окне | `10` |

### Внутренний API

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `INTERNAL_RATE_LIMIT_WINDOW_MS` | Окно для internal API | `60000` |
| `INTERNAL_RATE_LIMIT_MAX_REQUESTS` | Макс. запросов | `100` |

```bash
# API: 60 запросов в минуту
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# AI: 10 запросов в минуту (дороже)
AI_RATE_LIMIT_WINDOW_MS=60000
AI_RATE_LIMIT_MAX_REQUESTS=10

# Internal: 100 запросов в минуту
INTERNAL_RATE_LIMIT_WINDOW_MS=60000
INTERNAL_RATE_LIMIT_MAX_REQUESTS=100
```

---

## 🔑 Внутренний API

| Переменная | Описание | По умолчанию | Секрет? |
|------------|----------|--------------|---------|
| `INTERNAL_API_KEY` | Ключ для `/api/internal/*` эндпоинтов | — | 🔒 Да |

```bash
INTERNAL_API_KEY="your-secure-internal-key"
```

> 💡 Используется для вызовов из Directus Flows (broadcast, analytics)

---

## 🐳 Docker / Directus

Эти переменные используются в `docker-compose.yml`:

| Переменная | Описание | Пример | Секрет? |
|------------|----------|--------|---------|
| `DB_PASSWORD` | Пароль PostgreSQL | `your-secure-password` | 🔒 Да |
| `DIRECTUS_KEY` | Уникальный ключ Directus | UUID v4 | 🔒 Да |
| `DIRECTUS_SECRET` | Секрет для подписи токенов | случайная строка | 🔒 Да |
| `ADMIN_EMAIL` | Email админа Directus | `admin@example.com` | ❌ |
| `ADMIN_PASSWORD` | Пароль админа Directus | — | 🔒 Да |

```bash
# PostgreSQL
DB_PASSWORD="super-secure-db-password-123"

# Directus
DIRECTUS_KEY="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
DIRECTUS_SECRET="your-256-bit-secret-key-here"
ADMIN_EMAIL="admin@mindfuljournal.app"
ADMIN_PASSWORD="super-admin-password"
```

### Генерация безопасных значений

```bash
# Генерация UUID для DIRECTUS_KEY
uuidgen
# или онлайн: https://www.uuidgenerator.net/

# Генерация SECRET
openssl rand -base64 32
```

---

## 📁 Полный пример .env

```bash
# ============================================
# 🚨 REQUIRED - Сервер не запустится без них
# ============================================
DATABASE_URL="postgresql://postgres:your-password@localhost:5432/mindful_journal"
TELEGRAM_BOT_TOKEN="7123456789:AAHbYxJKL..."
OPENAI_API_KEY="sk-proj-abcdef123456..."

# ============================================
# ⚙️ SERVER
# ============================================
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN="*"

# ============================================
# 🤖 TELEGRAM
# ============================================
WEBAPP_URL="https://your-app.telegram.com"
WEBHOOK_URL="https://your-api.com"
ADMIN_TELEGRAM_IDS="123456789"

# ============================================
# 🛡️ RATE LIMITING
# ============================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
AI_RATE_LIMIT_WINDOW_MS=60000
AI_RATE_LIMIT_MAX_REQUESTS=10

# ============================================
# 🔑 INTERNAL API
# ============================================
INTERNAL_API_KEY="secure-random-key-for-directus"

# ============================================
# 🐳 DOCKER / DIRECTUS
# ============================================
DB_PASSWORD="super-secure-db-password"
DIRECTUS_KEY="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
DIRECTUS_SECRET="$(openssl rand -base64 32)"
ADMIN_EMAIL="admin@mindfuljournal.app"
ADMIN_PASSWORD="admin-password-123"
```

---

## ⚠️ Безопасность

### DO ✅

- Храни `.env` файл локально, **никогда** не коммить в git
- Используй разные пароли для dev и production
- Регулярно ротируй API ключи
- Используй менеджер секретов в production (Vault, AWS Secrets Manager)

### DON'T ❌

- Не коммить `.env` в репозиторий
- Не использовать один и тот же пароль везде
- Не шарить API ключи в чатах/документах
- Не хардкодить секреты в коде

### .gitignore

Убедись, что `.env` добавлен в `.gitignore`:

```gitignore
# Environment
.env
.env.local
.env.*.local
```

---

## 🔗 Связанные документы

- [README.md](../README.md) — Обзор проекта
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — Схема базы данных
- [DIRECTUS_SETUP.md](./DIRECTUS_SETUP.md) — Настройка CMS
