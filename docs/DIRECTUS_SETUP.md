# 🎛️ Настройка Directus для AI Mindful Journal

## Содержание
1. [Установка Directus](#1-установка-directus)
2. [Подключение к БД](#2-подключение-к-бд)
3. [Настройка коллекций](#3-настройка-коллекций)
4. [Настройка Insights (Дашборд)](#4-настройка-insights-дашборд)
5. [Настройка Flows (Автоматизации)](#5-настройка-flows-автоматизации)
6. [Безопасность и роли](#6-безопасность-и-роли)
7. [Интеграция с Node.js](#7-интеграция-с-nodejs)

---

## 1. Установка Directus

### Вариант A: Docker (Рекомендуется)

```yaml
# docker-compose.yml
version: '3'

services:
  directus:
    image: directus/directus:latest
    ports:
      - "8055:8055"
    volumes:
      - ./directus/uploads:/directus/uploads
      - ./directus/extensions:/directus/extensions
    environment:
      KEY: "your-random-secret-key-here"
      SECRET: "your-random-secret-here"
      
      # Подключение к PostgreSQL
      DB_CLIENT: "pg"
      DB_HOST: "host.docker.internal"  # или IP твоего PostgreSQL
      DB_PORT: "5432"
      DB_DATABASE: "mindful_journal"
      DB_USER: "postgres"
      DB_PASSWORD: "your-password"
      
      # Админ аккаунт
      ADMIN_EMAIL: "admin@example.com"
      ADMIN_PASSWORD: "your-admin-password"
      
      # Webhook для интеграции с ботом
      FLOWS_EXEC_ALLOWED_MODULES: "axios,node-fetch"

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: mindful_journal
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your-password
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    ports:
      - "5432:5432"
```

```bash
# Запуск
docker-compose up -d
```

### Вариант B: NPM (Локально)

```bash
npx create-directus-project mindful-admin
cd mindful-admin
npx directus start
```

---

## 2. Подключение к БД

После запуска Directus:

1. Открой `http://localhost:8055`
2. Войди с admin credentials
3. Directus автоматически обнаружит таблицы из `schema.sql`

### Импорт существующих таблиц

Если таблицы уже созданы:

1. **Settings → Data Model**
2. Нажми **"+"** → **"Import Existing Table"**
3. Выбери все таблицы:
   - `users`
   - `journal_entries`
   - `usage_logs`
   - `transactions`
   - `subscriptions`
   - `broadcasts`
   - `app_settings`

---

## 3. Настройка коллекций

### 3.1 Users (Пользователи)

**Settings → Data Model → users**

| Поле | Тип в Directus | Настройки |
|------|----------------|-----------|
| `telegram_id` | Integer | Required, Unique |
| `username` | String | - |
| `subscription_tier` | Dropdown | `free`, `basic`, `premium` |
| `balance_stars` | Integer | Default: 0 |
| `status` | Dropdown | `active`, `banned`, `deleted` |
| `is_admin` | Toggle | Default: false |

**Display Template:** `{{ first_name }} (@{{ username }})`

### 3.2 Journal Entries (Записи дневника)

| Поле | Тип в Directus | Настройки |
|------|----------------|-----------|
| `user_id` | Many-to-One (users) | Required |
| `text_content` | Textarea | Required |
| `mood_score` | Slider | Min: 1, Max: 10 |
| `mood_label` | Dropdown | happy, sad, anxious, calm, etc. |
| `ai_tags` | Tags | JSON Array |
| `is_voice` | Toggle | - |

### 3.3 Usage Logs (Логи API)

| Поле | Тип в Directus | Настройки |
|------|----------------|-----------|
| `service_type` | Dropdown | `gpt-4o-mini`, `whisper-1` |
| `cost_usd` | Decimal | Precision: 10, Scale: 6 |
| `input_tokens` | Integer | - |
| `output_tokens` | Integer | - |

### 3.4 Broadcasts (Рассылки)

| Поле | Тип в Directus | Настройки |
|------|----------------|-----------|
| `title` | String | Required |
| `message_text` | WYSIWYG | Required |
| `target_audience` | Dropdown | `all`, `premium`, `free` |
| `status` | Dropdown | `draft`, `scheduled`, `sending`, `sent`, `failed` |
| `scheduled_at` | DateTime | - |
| `sent_count` | Integer | Read-only |

### 3.5 App Settings (Конфигурация приложения)

Таблица `app_settings` хранит динамическую конфигурацию, которую сервер загружает с кэшированием (TTL 5 минут).

| Поле | Тип в Directus | Настройки |
|------|----------------|-----------|
| `key` | String | Required, Unique |
| `value` | JSON | Required |
| `description` | Textarea | Описание для админа |

#### 🚨 Обязательные ключи конфигурации

Эти ключи **ДОЛЖНЫ** быть созданы в `app_settings` для корректной работы приложения:

##### Pricing (Цены OpenAI)

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `openai.gpt4o_mini.input` | number | `0.15` | Цена за 1M input tokens ($) |
| `openai.gpt4o_mini.output` | number | `0.60` | Цена за 1M output tokens ($) |
| `openai.whisper.per_minute` | number | `0.006` | Цена Whisper за минуту ($) |
| `stars_to_usd_rate` | number | `0.02` | Курс 1 Star в USD |

##### Subscription (Подписки)

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `subscription.basic.stars` | number | `50` | Цена Basic в Stars |
| `subscription.basic.duration_days` | number | `30` | Длительность Basic (дни) |
| `subscription.premium.stars` | number | `150` | Цена Premium в Stars |
| `subscription.premium.duration_days` | number | `30` | Длительность Premium (дни) |

##### Limits - Free

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `limits.free.daily_entries` | number | `5` | Записей в день |
| `limits.free.voice_allowed` | boolean | `false` | Голосовые разрешены |
| `limits.free.voice_minutes_daily` | number | `0` | Минут голосовых в день |

##### Limits - Basic

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `limits.basic.daily_entries` | number | `20` | Записей в день |
| `limits.basic.voice_allowed` | boolean | `true` | Голосовые разрешены |
| `limits.basic.voice_minutes_daily` | number | `5` | Минут голосовых в день |

##### Limits - Premium

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `limits.premium.daily_entries` | number | `-1` | Записей в день (-1 = безлимит) |
| `limits.premium.voice_allowed` | boolean | `true` | Голосовые разрешены |
| `limits.premium.voice_minutes_daily` | number | `-1` | Минут голосовых в день (-1 = безлимит) |

##### AI Settings

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `ai.default_model` | string | `"gpt-4o-mini"` | Модель по умолчанию |
| `ai.temperature` | number | `0.7` | Temperature для GPT |
| `ai.max_tokens` | number | `500` | Макс. токенов ответа |
| `ai.system_prompt` | string | (см. ниже) | Системный промпт |

##### Feature Flags

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `feature.voice_enabled` | boolean | `true` | Голосовые сообщения вкл |
| `feature.adsgram_enabled` | boolean | `false` | Adsgram интеграция |
| `feature.maintenance_mode` | boolean | `false` | Режим обслуживания |

##### Messages (Шаблоны сообщений)

| Ключ | Тип | Описание |
|------|-----|----------|
| `msg.welcome` | string | Приветствие при /start |
| `msg.help` | string | Справка при /help |
| `msg.limit_exceeded` | string | Сообщение о превышении лимита |
| `msg.error_generic` | string | Общая ошибка |
| `msg.payment_success` | string | Успешная оплата |

##### Rate Limiting

| Ключ | Тип | Значение по умолчанию | Описание |
|------|-----|----------------------|----------|
| `rate_limit.api.window_ms` | number | `60000` | Окно для API (мс) |
| `rate_limit.api.max_requests` | number | `60` | Макс. запросов API |
| `rate_limit.ai.max_requests` | number | `10` | Макс. AI запросов |

#### Пример системного промпта

```json
{
  "key": "ai.system_prompt",
  "value": "Ты — эмпатичный психолог-аналитик. Твоя задача — анализировать записи дневника и определять эмоциональное состояние человека.\n\nОтвечай ТОЛЬКО в формате JSON (без markdown):\n{\n  \"moodScore\": <число от 1 до 10>,\n  \"moodLabel\": \"<одно слово>\",\n  \"tags\": [\"<тег1>\", \"<тег2>\"],\n  \"summary\": \"<резюме>\",\n  \"suggestions\": \"<рекомендация>\"\n}",
  "description": "Системный промпт для анализа настроения"
}
```

#### Как добавить ключи

1. Перейди в **Content → App Settings**
2. Нажми **"+ Create Item"**
3. Заполни `key`, `value` (JSON), `description`
4. Сохрани

> 💡 **Fallback:** Если ключ не найден в БД, сервер использует значения по умолчанию из `server/src/services/config.ts`

---

## 4. Настройка Insights (Дашборд)

### Создание дашборда

1. **Insights** (левое меню) → **Create Dashboard**
2. Название: **"📊 Аналитика"**

### 4.1 Метрики (Карточки)

#### Карточка: "💰 Расходы API сегодня"

```
Panel Type: Metric
Collection: usage_logs
Aggregate: Sum
Field: cost_usd
Filter: 
  date_created >= $NOW(-1 day)
Format: ${{value}}
Color: Red
```

#### Карточка: "💵 Доход сегодня"

```
Panel Type: Metric
Collection: transactions
Aggregate: Sum
Field: amount_usd
Filter:
  date_created >= $NOW(-1 day)
  is_successful = true
Format: ${{value}}
Color: Green
```

#### Карточка: "📝 Записей сегодня"

```
Panel Type: Metric
Collection: journal_entries
Aggregate: Count
Filter:
  date_created >= $NOW(-1 day)
```

#### Карточка: "👥 Всего пользователей"

```
Panel Type: Metric
Collection: users
Aggregate: Count
Filter:
  status = 'active'
```

### 4.2 Графики

#### График: "Расходы vs Доходы (30 дней)"

```
Panel Type: Time Series
Collections: 
  - usage_logs (Sum of cost_usd) - Line: Red
  - transactions (Sum of amount_usd where is_successful=true) - Line: Green
Date Field: date_created
Range: Last 30 Days
Group By: Day
```

#### График: "Использование API по типам"

```
Panel Type: Pie Chart
Collection: usage_logs
Aggregate: Sum of cost_usd
Group By: service_type
Filter: Last 30 days
```

#### График: "Распределение настроения"

```
Panel Type: Bar Chart
Collection: journal_entries
Aggregate: Count
Group By: mood_score
Filter: Last 7 days
```

### 4.3 Таблицы

#### Таблица: "Последние транзакции"

```
Panel Type: List
Collection: transactions
Fields: user_id.username, transaction_type, amount_stars, amount_usd, date_created
Sort: date_created DESC
Limit: 10
```

#### Таблица: "Топ пользователи по тратам API"

```
Panel Type: List
Collection: users
Fields: username, subscription_tier, total_spend_usd, total_entries_count
Sort: total_spend_usd DESC
Limit: 10
```

---

## 5. Настройка Flows (Автоматизации)

### 5.1 Flow: Отправка рассылки

**Trigger:** Event Hook → `broadcasts.items.update`

**Condition:**
```javascript
// Запускать только когда статус изменился на 'sending'
module.exports = async function(data) {
  return data.payload.status === 'sending' && data.keys.length > 0;
}
```

**Actions:**

1. **Read Data** - Получить данные рассылки
   ```
   Collection: broadcasts
   Key: {{$trigger.keys[0]}}
   ```

2. **Webhook / Request URL** - Вызвать бота
   ```
   Method: POST
   URL: http://your-bot-server:3000/api/internal/broadcast
   Headers:
     Authorization: Bearer {{$env.INTERNAL_API_KEY}}
     Content-Type: application/json
   Body:
   {
     "broadcast_id": "{{$trigger.keys[0]}}",
     "message_text": "{{read_data.message_text}}",
     "target_audience": "{{read_data.target_audience}}"
   }
   ```

3. **Update Data** - Обновить статус
   ```
   Collection: broadcasts
   Key: {{$trigger.keys[0]}}
   Payload:
   {
     "started_at": "{{$now}}"
   }
   ```

### 5.2 Flow: Уведомление о высоких расходах

**Trigger:** Schedule → Каждый час

**Actions:**

1. **Run Script:**
   ```javascript
   module.exports = async function({ services, database }) {
     const { ItemsService } = services;
     
     const usageService = new ItemsService('usage_logs', {
       schema: await database.getSchema(),
       accountability: { admin: true }
     });
     
     // Получить расходы за последний час
     const now = new Date();
     const hourAgo = new Date(now - 60 * 60 * 1000);
     
     const logs = await usageService.readByQuery({
       filter: {
         date_created: { _gte: hourAgo.toISOString() }
       },
       aggregate: {
         sum: ['cost_usd']
       }
     });
     
     const hourlySpend = logs[0]?.sum?.cost_usd || 0;
     
     // Порог: $5 в час
     if (hourlySpend > 5) {
       return {
         alert: true,
         amount: hourlySpend
       };
     }
     
     return { alert: false };
   }
   ```

2. **Condition:** `{{run_script.alert}} == true`

3. **Webhook** - Отправить в Telegram
   ```
   Method: POST
   URL: https://api.telegram.org/bot{{$env.BOT_TOKEN}}/sendMessage
   Body:
   {
     "chat_id": 437257453,
     "text": "⚠️ Высокие расходы API!\n\nЗа последний час: ${{run_script.amount}}\n\nПроверь usage_logs в админке."
   }
   ```

### 5.3 Flow: Приветствие нового пользователя (опционально)

**Trigger:** Event Hook → `users.items.create`

**Action:** Webhook to bot → Send welcome message

---

## 6. Безопасность и роли

### 6.1 Создание роли для API

**Settings → Access Control → Create Role**

**Название:** `API Backend`

**Permissions:**

| Коллекция | Create | Read | Update | Delete |
|-----------|--------|------|--------|--------|
| users | ✅ All | ✅ All | ✅ All | ❌ |
| journal_entries | ✅ All | ✅ All | ✅ All | ❌ |
| usage_logs | ✅ All | ✅ All | ❌ | ❌ |
| transactions | ✅ All | ✅ All | ❌ | ❌ |
| subscriptions | ✅ All | ✅ All | ✅ All | ❌ |
| broadcasts | ❌ | ✅ All | ✅ (только status, sent_count) | ❌ |
| app_settings | ❌ | ✅ All | ❌ | ❌ |

### 6.2 Создание API токена

1. **Settings → Access Control → Users**
2. **Create User:**
   - Email: `api@internal.bot`
   - Role: `API Backend`
3. **Generate Static Token**
4. Сохрани токен в `.env` бота:
   ```
   DIRECTUS_TOKEN=your-static-token-here
   ```

### 6.3 Админская роль

**Role:** `Administrator` (встроенная)

- Полный доступ ко всем коллекциям
- Доступ к Insights
- Доступ к Flows
- Доступ к Settings

---

## 7. Интеграция с Node.js

### 7.1 Установка SDK

```bash
npm install @directus/sdk
```

### 7.2 Клиент для бота

```typescript
// server/src/services/directus.ts

import { createDirectus, rest, staticToken } from '@directus/sdk';

// Типы для коллекций
interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  subscription_tier: 'free' | 'basic' | 'premium';
  balance_stars: number;
  status: 'active' | 'banned' | 'deleted';
  is_admin: boolean;
}

interface JournalEntry {
  id: string;
  user_id: string;
  text_content: string;
  mood_score: number;
  mood_label: string;
  ai_tags: string[];
  is_voice: boolean;
  date_created: string;
}

interface UsageLog {
  id: string;
  user_id: string;
  service_type: 'gpt-4o-mini' | 'whisper-1';
  input_tokens: number;
  output_tokens: number;
  duration_seconds: number;
  cost_usd: number;
}

interface Schema {
  users: User[];
  journal_entries: JournalEntry[];
  usage_logs: UsageLog[];
  transactions: any[];
  broadcasts: any[];
  app_settings: any[];
}

// Создание клиента
const directus = createDirectus<Schema>(process.env.DIRECTUS_URL!)
  .with(staticToken(process.env.DIRECTUS_TOKEN!))
  .with(rest());

export default directus;

// Примеры использования:

// Получить или создать пользователя
export async function getOrCreateUser(telegramId: number, userData: Partial<User>) {
  const users = await directus.request(
    readItems('users', {
      filter: { telegram_id: { _eq: telegramId } },
      limit: 1
    })
  );
  
  if (users.length > 0) {
    return users[0];
  }
  
  return await directus.request(
    createItem('users', {
      telegram_id: telegramId,
      ...userData
    })
  );
}

// Создать запись дневника
export async function createEntry(userId: string, data: Partial<JournalEntry>) {
  return await directus.request(
    createItem('journal_entries', {
      user_id: userId,
      ...data
    })
  );
}

// Логировать использование API
export async function logUsage(data: Omit<UsageLog, 'id'>) {
  return await directus.request(
    createItem('usage_logs', data)
  );
}

// Получить настройки
export async function getSettings(key: string) {
  const settings = await directus.request(
    readItems('app_settings', {
      filter: { key: { _eq: key } },
      limit: 1
    })
  );
  
  return settings[0]?.value;
}
```

### 7.3 Webhook endpoint для рассылок

```typescript
// server/src/api/internal/broadcast.ts

import { Router } from 'express';
import { bot } from '../../bot';
import directus from '../../services/directus';

const router = Router();

// Middleware: проверка внутреннего ключа
router.use((req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.post('/broadcast', async (req, res) => {
  const { broadcast_id, message_text, target_audience } = req.body;
  
  try {
    // Получить список получателей
    let filter: any = { status: { _eq: 'active' } };
    
    if (target_audience === 'premium') {
      filter.subscription_tier = { _in: ['basic', 'premium'] };
    } else if (target_audience === 'free') {
      filter.subscription_tier = { _eq: 'free' };
    }
    
    const users = await directus.request(
      readItems('users', { filter, fields: ['telegram_id'] })
    );
    
    let sentCount = 0;
    let failedCount = 0;
    
    // Отправка сообщений (с задержкой для rate limiting)
    for (const user of users) {
      try {
        await bot.api.sendMessage(user.telegram_id, message_text, {
          parse_mode: 'HTML'
        });
        sentCount++;
      } catch (error) {
        failedCount++;
      }
      
      // Задержка 50ms между сообщениями (Telegram limit: 30 msg/sec)
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Обновить статус рассылки
    await directus.request(
      updateItem('broadcasts', broadcast_id, {
        status: 'sent',
        completed_at: new Date().toISOString(),
        total_recipients: users.length,
        sent_count: sentCount,
        failed_count: failedCount
      })
    );
    
    res.json({ success: true, sent: sentCount, failed: failedCount });
    
  } catch (error) {
    // Обновить статус на failed
    await directus.request(
      updateItem('broadcasts', broadcast_id, {
        status: 'failed',
        last_error: String(error)
      })
    );
    
    res.status(500).json({ error: String(error) });
  }
});

export default router;
```

---

## 📋 Чеклист настройки

- [ ] Установить Docker / PostgreSQL
- [ ] Запустить `schema.sql`
- [ ] Запустить Directus
- [ ] Импортировать таблицы в Directus
- [ ] Настроить отображение полей
- [ ] Создать Insights дашборд
- [ ] Настроить Flow для рассылок
- [ ] Настроить Flow для алертов
- [ ] Создать API роль и токен
- [ ] Добавить токен в `.env` бота
- [ ] Протестировать интеграцию

---

## 🔗 Полезные ссылки

- [Directus Docs](https://docs.directus.io/)
- [Directus Flows](https://docs.directus.io/app/flows.html)
- [Directus Insights](https://docs.directus.io/app/insights.html)
- [Directus SDK](https://docs.directus.io/reference/sdk.html)
