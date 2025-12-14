# AI Mindful Journal 🧠📝

Telegram Mini App для трекинга настроения с AI-анализом.

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM MINI APP                        │
├─────────────────────────────────────────────────────────────┤
│  Client (React + Vite)    │    Server (Node.js + grammY)    │
│  ├── Konsta UI            │    ├── Express API              │
│  ├── Tailwind CSS         │    ├── Telegram Bot             │
│  ├── Zustand              │    ├── OpenAI Integration       │
│  └── Recharts             │    └── Prisma ORM               │
├─────────────────────────────────────────────────────────────┤
│                      PostgreSQL                             │
├─────────────────────────────────────────────────────────────┤
│                   Directus (Admin Panel)                    │
│  ├── Insights Dashboard (Revenue vs Costs)                  │
│  ├── Flows (Broadcast automation)                           │
│  └── User Management                                        │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Быстрый старт

### 1. Клонирование и настройка

```bash
git clone <repo-url>
cd web-app
cp .env.example .env
# Заполни .env своими ключами
```

### 2. Запуск через Docker

```bash
docker-compose up -d
```

Это запустит:
- PostgreSQL на порту `5432`
- Directus на порту `8055`
- Redis на порту `6379`

### 3. Настройка Directus

1. Открой http://localhost:8055
2. Войди с credentials из `.env`
3. Следуй инструкции в [docs/DIRECTUS_SETUP.md](docs/DIRECTUS_SETUP.md)

## 📁 Структура проекта

```
web-app/
├── client/                 # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/     # UI компоненты
│   │   ├── pages/          # Страницы
│   │   ├── stores/         # Zustand stores
│   │   ├── services/       # API клиент
│   │   └── hooks/          # Кастомные хуки
│   └── ...
│
├── server/                 # Backend (Node.js)
│   ├── src/
│   │   ├── bot/            # grammY bot
│   │   ├── api/            # Express routes
│   │   ├── services/       # Бизнес-логика
│   │   └── utils/          # Утилиты
│   └── prisma/             # Схема БД
│
├── database/               # SQL схемы
│   └── schema.sql          # Основная схема
│
├── docs/                   # Документация
│   └── DIRECTUS_SETUP.md   # Настройка админки
│
├── docker-compose.yml      # Docker конфигурация
└── .env.example            # Пример переменных окружения
```

## 💰 Монетизация

| Тариф | Цена | Возможности |
|-------|------|-------------|
| Free | 0 ⭐ | 5 записей/день, только текст |
| Basic | 50 ⭐/мес | 20 записей/день, 5 голосовых |
| Premium | 150 ⭐/мес | Безлимит, все функции |

## 📊 Admin Dashboard

Доступен через Directus:
- 💰 Расходы API в реальном времени
- 💵 Доходы от подписок
- 📈 Графики использования
- 👥 Управление пользователями
- 📢 Рассылки

## 🔒 Безопасность

- Все AI запросы через backend
- API ключи только на сервере
- Telegram initData валидация
- Rate limiting

## 📝 TODO

- [ ] Настроить Directus
- [ ] Создать backend (grammY + Express)
- [ ] Создать frontend (React + Vite)
- [ ] Интеграция OpenAI
- [ ] Telegram Stars payments
- [ ] Adsgram интеграция
- [ ] Deploy

## 📄 Лицензия

MIT