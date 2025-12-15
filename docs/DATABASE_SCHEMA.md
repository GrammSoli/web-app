# 📊 Схема базы данных

> Документация PostgreSQL схемы для AI Mindful Journal (Prisma ORM)

---

## 📋 Обзор

База данных использует **PostgreSQL 15** с **Prisma ORM** для типобезопасного доступа к данным. Схема также доступна для визуального редактирования через **Directus CMS**.

**Расположение схемы:** `server/prisma/schema.prisma`

---

## 🗺️ ER-диаграмма (отношения)

```
┌─────────────────┐
│      User       │
│─────────────────│
│ id (PK)         │
│ telegramId      │◄────────────────────────────────────┐
│ username        │                                      │
│ timezone        │                                      │
│ subscriptionTier│                                      │
│ balanceStars    │                                      │
└────────┬────────┘                                      │
         │                                               │
         │ 1:N                                           │
         ▼                                               │
┌─────────────────┐      ┌─────────────────┐            │
│  JournalEntry   │      │   Transaction   │            │
│─────────────────│      │─────────────────│            │
│ id (PK)         │      │ id (PK)         │            │
│ userId (FK)     │◄─────│ userId (FK)     │────────────┤
│ textContent     │      │ transactionType │            │
│ moodScore       │      │ amountStars     │            │
│ aiTags          │      │ amountUsd       │            │
│ isVoice         │      └────────┬────────┘            │
└────────┬────────┘               │                     │
         │                        │ 1:1                 │
         │ 1:N                    ▼                     │
         ▼              ┌─────────────────┐             │
┌─────────────────┐     │  Subscription   │             │
│    UsageLog     │     │─────────────────│             │
│─────────────────│     │ id (PK)         │             │
│ id (PK)         │     │ userId (FK)     │─────────────┘
│ userId (FK)     │     │ transactionId   │
│ entryId (FK)?   │     │ tier            │
│ serviceType     │     │ expiresAt       │
│ costUsd         │     └─────────────────┘
└─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│   Broadcast     │     │   AppSetting    │
│─────────────────│     │─────────────────│
│ id (PK)         │     │ id (PK)         │
│ title           │     │ key (UNIQUE)    │
│ messageText     │     │ value (JSONB)   │
│ targetAudience  │     │ description     │
│ status          │     └─────────────────┘
└─────────────────┘
```

---

## 📦 Enums (Перечисления)

### UserStatus
```prisma
enum UserStatus {
  active    // Активный пользователь
  banned    // Заблокирован
  deleted   // Удалён (soft delete)
}
```

### SubscriptionTier
```prisma
enum SubscriptionTier {
  free      // Бесплатный тариф
  basic     // Базовый (50 ⭐/мес)
  premium   // Премиум (150 ⭐/мес)
}
```

### ServiceType
```prisma
enum ServiceType {
  gpt_4o_mini  @map("gpt-4o-mini")   // Анализ настроения
  whisper_1    @map("whisper-1")      // Транскрипция голоса
}
```

### TransactionType
```prisma
enum TransactionType {
  stars_payment   // Оплата Telegram Stars
  adsgram_reward  // Награда за просмотр рекламы
  refund          // Возврат
}
```

### BroadcastStatus
```prisma
enum BroadcastStatus {
  draft       // Черновик
  scheduled   // Запланирована
  sending     // Отправляется
  sent        // Отправлена
  failed      // Ошибка
}
```

### BroadcastAudience
```prisma
enum BroadcastAudience {
  all       // Все пользователи
  premium   // Только Premium
  free      // Только Free
}
```

---

## 👤 User (Пользователь)

Основная таблица пользователей с данными из Telegram.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `telegramId` | BigInt | Telegram User ID (уникальный) |
| `username` | String? | @username |
| `firstName` | String? | Имя |
| `lastName` | String? | Фамилия |
| `languageCode` | String | Язык (default: "ru") |
| `timezone` | String | Часовой пояс IANA (default: "UTC") |
| `subscriptionTier` | Enum | Тариф подписки |
| `subscriptionExpiresAt` | DateTime? | Дата окончания подписки |
| `balanceStars` | Int | Баланс звёзд |
| `totalEntriesCount` | Int | Счётчик записей (денормализация) |
| `totalVoiceCount` | Int | Счётчик голосовых |
| `totalSpendUsd` | Decimal | Суммарные расходы API |
| `status` | Enum | Статус пользователя |
| `isAdmin` | Boolean | Флаг администратора |
| `dateCreated` | DateTime | Дата регистрации |
| `dateUpdated` | DateTime | Дата обновления |

### SQL таблица
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  language_code VARCHAR(10) DEFAULT 'ru',
  timezone VARCHAR(50) DEFAULT 'UTC',
  subscription_tier subscription_tier DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  balance_stars INTEGER DEFAULT 0,
  total_entries_count INTEGER DEFAULT 0,
  total_voice_count INTEGER DEFAULT 0,
  total_spend_usd DECIMAL(10,4) DEFAULT 0,
  status user_status DEFAULT 'active',
  is_admin BOOLEAN DEFAULT FALSE,
  date_created TIMESTAMPTZ DEFAULT NOW(),
  date_updated TIMESTAMPTZ DEFAULT NOW()
);
```

### Индексы
- `telegramId` — уникальный индекс для быстрого поиска

---

## 📝 JournalEntry (Запись дневника)

Записи пользователей с AI-анализом.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `userId` | UUID | FK на User |
| `textContent` | Text | Текст записи |
| `voiceFileId` | String? | Telegram file_id голосового |
| `voiceDurationSeconds` | Int? | Длительность голосового (сек) |
| `isVoice` | Boolean | Флаг голосовой записи |
| `moodScore` | Int? | Оценка настроения (1-10) |
| `moodLabel` | String? | Метка настроения |
| `aiTags` | JSONB | Теги от AI (["тег1", "тег2"]) |
| `aiSummary` | Text? | Краткое резюме от AI |
| `aiSuggestions` | Text? | Рекомендации от AI |
| `isProcessed` | Boolean | Обработано AI |
| `processingError` | Text? | Ошибка обработки |
| `dateCreated` | DateTime | Дата создания |
| `dateUpdated` | DateTime | Дата обновления |

### Пример aiTags
```json
["работа", "усталость", "продуктивность"]
```

### SQL таблица
```sql
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text_content TEXT NOT NULL,
  voice_file_id VARCHAR(255),
  voice_duration_seconds INTEGER,
  is_voice BOOLEAN DEFAULT FALSE,
  mood_score INTEGER CHECK (mood_score >= 1 AND mood_score <= 10),
  mood_label VARCHAR(50),
  ai_tags JSONB DEFAULT '[]',
  ai_summary TEXT,
  ai_suggestions TEXT,
  is_processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  date_created TIMESTAMPTZ DEFAULT NOW(),
  date_updated TIMESTAMPTZ DEFAULT NOW()
);
```

### Индексы
- `userId` — для фильтрации по пользователю
- `dateCreated DESC` — для сортировки по дате
- `moodScore` — для аналитики

---

## 💰 UsageLog (Лог использования API)

Трекинг расходов на OpenAI для финансовой отчётности.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `userId` | UUID | FK на User |
| `entryId` | UUID? | FK на JournalEntry (опционально) |
| `serviceType` | Enum | Тип сервиса (gpt-4o-mini / whisper-1) |
| `modelName` | String | Название модели |
| `inputTokens` | Int | Токены на вход |
| `outputTokens` | Int | Токены на выход |
| `durationSeconds` | Int | Длительность (для whisper) |
| `costUsd` | Decimal(10,6) | Стоимость в USD |
| `requestId` | String? | ID запроса (для дебага) |
| `latencyMs` | Int? | Время ответа (мс) |
| `dateCreated` | DateTime | Дата |

### Расчёт стоимости
```
GPT-4o-mini:
  input:  $0.15 / 1M tokens
  output: $0.60 / 1M tokens

Whisper:
  $0.006 / minute
```

### SQL таблица
```sql
CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  service_type service_type NOT NULL,
  model_name VARCHAR(50) NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  cost_usd DECIMAL(10,6) NOT NULL,
  request_id VARCHAR(100),
  latency_ms INTEGER,
  date_created TIMESTAMPTZ DEFAULT NOW()
);
```

### Индексы
- `userId` — для отчётов по пользователю
- `serviceType` — для агрегации по сервисам
- `dateCreated DESC` — для временных отчётов

---

## 💳 Transaction (Транзакция)

Финансовые операции (оплаты, возвраты).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `userId` | UUID | FK на User |
| `transactionType` | Enum | Тип операции |
| `amountStars` | Int | Сумма в звёздах |
| `amountUsd` | Decimal | Сумма в USD |
| `telegramPaymentId` | String? | ID платежа Telegram |
| `telegramPaymentChargeId` | String? | Charge ID |
| `isSuccessful` | Boolean | Успешна ли |
| `failureReason` | Text? | Причина ошибки |
| `dateCreated` | DateTime | Дата |

---

## 📅 Subscription (Подписка)

История подписок пользователей.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `userId` | UUID | FK на User |
| `transactionId` | UUID? | FK на Transaction (1:1) |
| `tier` | Enum | Уровень подписки |
| `startsAt` | DateTime | Дата начала |
| `expiresAt` | DateTime | Дата окончания |
| `priceStars` | Int | Цена в момент покупки |
| `priceUsd` | Decimal | Цена в USD |
| `isActive` | Boolean | Активна ли |
| `cancelledAt` | DateTime? | Дата отмены |
| `dateCreated` | DateTime | Дата создания |
| `dateUpdated` | DateTime | Дата обновления |

---

## 📢 Broadcast (Рассылка)

Массовые рассылки через бота.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `title` | String | Название (для админки) |
| `messageText` | Text | Текст сообщения (Markdown) |
| `messagePhotoUrl` | Text? | URL картинки |
| `targetAudience` | Enum | Целевая аудитория |
| `scheduledAt` | DateTime? | Время отправки |
| `status` | Enum | Статус рассылки |
| `startedAt` | DateTime? | Начало отправки |
| `completedAt` | DateTime? | Завершение |
| `totalRecipients` | Int | Всего получателей |
| `sentCount` | Int | Отправлено |
| `failedCount` | Int | Ошибок |
| `lastError` | Text? | Последняя ошибка |
| `dateCreated` | DateTime | Создано |
| `userCreated` | UUID? | Кем создано (Directus) |

---

## ⚙️ AppSetting (Настройки)

Динамическая конфигурация приложения (управляется через Directus).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `key` | String | Уникальный ключ настройки |
| `value` | JSONB | Значение (любой JSON) |
| `description` | Text? | Описание для админки |
| `dateCreated` | DateTime | Создано |
| `dateUpdated` | DateTime | Обновлено |

### Пример записей
| key | value | description |
|-----|-------|-------------|
| `limits.free.daily_entries` | `5` | Лимит записей для Free |
| `subscription.basic.stars` | `50` | Цена Basic в Stars |
| `ai.system_prompt` | `"Ты — эмпатичный..."` | Системный промпт |

> 📖 Полный список ключей — см. [DIRECTUS_SETUP.md](./DIRECTUS_SETUP.md)

---

## 🔄 Миграции

### Применение схемы (development)
```bash
cd server
npm run db:push
```

### Создание миграции (production)
```bash
cd server
npm run db:migrate
```

### Генерация Prisma Client
```bash
npm run db:generate
```

### Просмотр данных (Prisma Studio)
```bash
npm run db:studio
```

---

## 📊 Полезные SQL запросы

### Статистика по пользователям
```sql
SELECT 
  subscription_tier,
  COUNT(*) as count,
  AVG(total_entries_count) as avg_entries
FROM users
WHERE status = 'active'
GROUP BY subscription_tier;
```

### Расходы API за месяц
```sql
SELECT 
  service_type,
  SUM(cost_usd) as total_cost,
  COUNT(*) as requests
FROM usage_logs
WHERE date_created >= date_trunc('month', NOW())
GROUP BY service_type;
```

### Топ пользователей по записям
```sql
SELECT 
  u.telegram_id,
  u.first_name,
  u.total_entries_count,
  u.subscription_tier
FROM users u
ORDER BY u.total_entries_count DESC
LIMIT 10;
```

### Среднее настроение по дням
```sql
SELECT 
  date_trunc('day', date_created) as day,
  AVG(mood_score) as avg_mood,
  COUNT(*) as entries
FROM journal_entries
WHERE mood_score IS NOT NULL
GROUP BY day
ORDER BY day DESC
LIMIT 30;
```

---

## 🔗 Связанные документы

- [README.md](../README.md) — Обзор проекта
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) — Переменные окружения
- [DIRECTUS_SETUP.md](./DIRECTUS_SETUP.md) — Настройка CMS и ключей конфигурации
