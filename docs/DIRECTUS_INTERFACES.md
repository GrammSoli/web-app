# 🎨 Рекомендуемые интерфейсы для Directus

> Настройка UI компонентов для удобной работы с данными

---

## 📋 app_config

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden (скрыто) |
| `key` | Input | **Font:** Monospace, **Placeholder:** `feature.maintenance_mode` |
| `value` | JSON | Code Editor, **Language:** JSON, **Line Numbers:** ✅ |
| `description` | Textarea | **Rows:** 3, **Placeholder:** Описание для других администраторов |
| `date_created` | DateTime | Display: Read-only, Format: YYYY-MM-DD HH:mm |
| `date_updated` | DateTime | Display: Read-only, Format: YYYY-MM-DD HH:mm |

**Display Template:**
```
{{key}}
```

**Icon:** `settings`

---

## 📋 app_settings

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `key` | Input | **Font:** Monospace, **Unique:** ✅, **Required:** ✅ |
| `value` | JSON | Code Editor, **Language:** JSON, **Template:** `{"example": "value"}` |
| `description` | WYSIWYG | **Toolbar:** minimal (bold, italic, link) |
| `date_created` | DateTime | Read-only, Auto-fill on create |
| `date_updated` | DateTime | Read-only, Auto-fill on update |

**Display Template:**
```
{{key}} — {{description}}
```

**Icon:** `tune`

**Sort Field:** `key` (ASC)

---

## 📢 broadcasts

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `title` | Input | **Placeholder:** "Новогодняя акция 2025", **Required:** ✅ |
| `message_text` | WYSIWYG | **Toolbar:** full, **Max length:** 4096 |
| `message_photo_url` | Input (URL) | **Placeholder:** `https://example.com/image.jpg`, **Icon Prefix:** 🖼️ |
| `target_audience` | Dropdown | **Choices:** `all`, `premium`, `free`, **Default:** `all`, **Icon:** `group` |
| `scheduled_at` | DateTime | **Include seconds:** ❌, **24h format:** ✅ |
| `status` | Dropdown | **Choices:** `draft` 📝, `scheduled` ⏰, `sending` 📤, `sent` ✅, `failed` ❌ |
| `started_at` | DateTime | Read-only, Auto-filled by Flow |
| `completed_at` | DateTime | Read-only, Auto-filled by Flow |
| `total_recipients` | Input (Integer) | Read-only, Display: Badge |
| `sent_count` | Input (Integer) | Read-only, Display: Badge (green) |
| `failed_count` | Input (Integer) | Read-only, Display: Badge (red) |
| `last_error` | Textarea | Read-only, **Font:** Monospace, **Rows:** 5 |
| `date_created` | DateTime | Read-only |
| `date_updated` | DateTime | Read-only |
| `user_created` | User | Read-only, Display: Avatar + Name |
| `user_updated` | User | Read-only, Display: Avatar + Name |

**Display Template:**
```
{{title}} — {{status}} ({{sent_count}}/{{total_recipients}})
```

**Icon:** `campaign`

**Color Coding by Status:**
- `draft` → Gray
- `scheduled` → Blue
- `sending` → Yellow
- `sent` → Green
- `failed` → Red

**Conditional Formatting:**
- Show `last_error` только если `status` = `failed`
- Show `message_photo_url` preview (Image Preview)

---

## 📝 journal_entries

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `user_id` | Many-to-One Relationship | **Related collection:** `users`, **Display:** `{{first_name}} (@{{username}})` |
| `text_content` | Textarea | **Rows:** 5, **Max length:** 2000, **Character counter:** ✅ |
| `mood_score` | Slider | **Min:** 1, **Max:** 10, **Step:** 1, **Display:** Emoji + Number |
| `mood_label` | Dropdown | **Choices:** happy 😊, sad 😢, anxious 😰, calm 😌, angry 😠, excited 🤩, tired 😴, neutral 😐 |
| `ai_tags` | Tags | **Placeholder:** "работа, семья, здоровье", **Lowercase:** ✅, **Max tags:** 10 |
| `is_voice` | Toggle | **Label:** Голосовое сообщение, **Icon:** 🎤 |
| `summary` | Textarea | **Rows:** 3, Read-only (AI generated) |
| `suggestions` | Textarea | **Rows:** 3, Read-only (AI generated) |
| `date_created` | DateTime | Read-only, **Display:** Relative (2 часа назад) |
| `date_updated` | DateTime | Read-only |

**Display Template:**
```
{{mood_label}} {{mood_score}}/10 — {{text_content|truncate(50)}}
```

**Icon:** `edit_note`

**Sort:** `date_created DESC`

**Filters (Quick):**
- Mood Score (Range slider)
- Is Voice (Toggle)
- Created Date (Date range)
- User (Dropdown)

---

## 💳 subscriptions

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `user_id` | Many-to-One Relationship | **Related:** `users`, **Required:** ✅ |
| `tier` | Dropdown | **Choices:** free 🆓, basic ⭐, premium 💎, **Default:** `free` |
| `started_at` | DateTime | Auto-filled on create |
| `expires_at` | DateTime | **Note:** Null = вечная подписка |
| `is_active` | Toggle | **Label:** Активна, **Color:** Green (on), Red (off) |
| `auto_renew` | Toggle | **Label:** Автопродление |
| `invoice_id` | Input | Read-only, **Font:** Monospace |
| `date_created` | DateTime | Read-only |
| `date_updated` | DateTime | Read-only |

**Display Template:**
```
{{tier}} — {{user_id.username}} (до {{expires_at|date('DD.MM.YYYY')}})
```

**Icon:** `card_membership`

**Conditional Display:**
- Highlight expired subscriptions (Red border)
- Show "Вечная" badge если `expires_at` = null

---

## 💰 transactions

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `user_id` | Many-to-One Relationship | **Related:** `users` |
| `transaction_type` | Dropdown | **Choices:** stars_payment 💫, adsgram_reward 📺, refund 🔄 |
| `amount_stars` | Input (Integer) | **Min:** 0, **Icon Right:** ⭐ |
| `amount_usd` | Input (Decimal) | Read-only, **Prefix:** $, **Precision:** 4 |
| `invoice_id` | Input | Read-only, **Font:** Monospace |
| `is_successful` | Toggle | **Label:** Успешно, **Color:** Green/Red |
| `error_message` | Textarea | Read-only, Show only if `is_successful` = false |
| `telegram_payment_charge_id` | Input | Read-only, **Font:** Monospace |
| `provider_payment_charge_id` | Input | Read-only, **Font:** Monospace |
| `date_created` | DateTime | Read-only, **Display:** DD.MM.YYYY HH:mm |

**Display Template:**
```
{{transaction_type}} — {{amount_stars}}⭐ (${{amount_usd}}) — {{user_id.username}}
```

**Icon:** `payments`

**Color by Status:**
- Success → Green background
- Failed → Red background

**Sort:** `date_created DESC`

---

## 📊 usage_logs

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `user_id` | Many-to-One Relationship | **Related:** `users` |
| `entry_id` | Many-to-One Relationship | **Related:** `journal_entries`, **Optional:** ✅ |
| `service_type` | Dropdown | **Choices:** gpt-4o-mini 🤖, whisper-1 🎤 |
| `model_name` | Input | Read-only, **Font:** Monospace |
| `input_tokens` | Input (Integer) | Read-only, Display: Badge |
| `output_tokens` | Input (Integer) | Read-only, Display: Badge |
| `duration_seconds` | Input (Decimal) | Read-only, **Suffix:** sec |
| `cost_usd` | Input (Decimal) | Read-only, **Prefix:** $, **Precision:** 6, **Color:** Red |
| `request_id` | Input | Read-only, **Font:** Monospace |
| `date_created` | DateTime | Read-only, **Display:** Relative time |

**Display Template:**
```
{{service_type}} — ${{cost_usd}} — {{user_id.username}}
```

**Icon:** `receipt_long`

**Aggregation (Dashboard):**
- Total cost today (Sum)
- Total tokens used (Sum)
- Average cost per request

**Sort:** `date_created DESC`

---

## 👥 users

### Основные поля

| Поле | Интерфейс | Настройки |
|------|-----------|-----------|
| `id` | UUID | Hidden |
| `telegram_id` | Input (Integer) | **Required:** ✅, **Unique:** ✅, **Font:** Monospace |
| `username` | Input | **Prefix:** @, **Placeholder:** username |
| `first_name` | Input | **Placeholder:** Имя |
| `last_name` | Input | **Placeholder:** Фамилия |
| `language_code` | Dropdown | **Choices:** ru 🇷🇺, en 🇬🇧, uk 🇺🇦, **Default:** ru |
| `timezone` | Dropdown | **Use:** Timezone list (Europe/Moscow, UTC, etc.) |
| `subscription_tier` | Dropdown | **Choices:** free, basic, premium, **Badge colors** |
| `subscription_expires_at` | DateTime | **Note:** Null = Free tier |
| `balance_stars` | Input (Integer) | **Min:** 0, **Icon Right:** ⭐, **Default:** 0 |
| `total_entries_count` | Input (Integer) | Read-only, Display: Badge |
| `total_voice_count` | Input (Integer) | Read-only, Display: Badge |
| `total_spend_usd` | Input (Decimal) | Read-only, **Prefix:** $, **Precision:** 4, **Color:** Red |
| `status` | Dropdown | **Choices:** active ✅, banned ⛔, deleted 🗑️ |
| `is_admin` | Toggle | **Label:** Администратор, **Icon:** 👑 |
| `date_created` | DateTime | Read-only |
| `date_updated` | DateTime | Read-only |

**Display Template:**
```
{{first_name}} {{last_name}} (@{{username}}) — {{subscription_tier}}
```

**Icon:** `person`

**Conditional Formatting:**
- Admin users → Gold border
- Banned users → Red background
- Premium users → Purple badge

**Quick Filters:**
- Status (Dropdown)
- Subscription tier (Dropdown)
- Is Admin (Toggle)

---

## 🎨 Общие рекомендации

### Display Density
```
Compact — для таблиц с большим количеством данных (usage_logs, transactions)
Comfortable — для основных коллекций (users, journal_entries)
Spacious — для контента (broadcasts)
```

### Insights Dashboards
```
📊 Overview:
- Total Users (Metric)
- Active Subscriptions (Metric)
- Revenue Today (Metric)
- API Cost Today (Metric)

📈 Analytics:
- Mood Distribution (Bar Chart)
- Usage by Day (Time Series)
- Revenue vs Cost (Line Chart)
```

### Translations (i18n)
```
Интерфейс на русском:
Settings → Project Settings → Languages
Add Russian (ru-RU) и установить как Default
```

### Color Palette
```
Primary: #6366F1 (Indigo)
Success: #10B981 (Green)
Warning: #F59E0B (Amber)
Error: #EF4444 (Red)
Info: #3B82F6 (Blue)
```

---

## 📱 Мобильная оптимизация

### Скрыть на мобильных:
- UUID поля
- Technical fields (request_id, charge_id)
- Read-only aggregates

### Показать приоритетные:
- Display name / title
- Status badges
- Action buttons
- Date created (relative)

---

## 🔐 Permissions Tips

### API Backend Role:
- Users: CRUD (Create, Read, Update)
- Journal Entries: CRUD
- Usage Logs: CR (Create, Read only)
- Transactions: CR
- Subscriptions: CRUD
- Broadcasts: R, U (status, counts only)
- App Settings: R (Read only)

### Admin Role:
- Full access to all collections
- Can delete records
- Can manage users
- Can see all analytics

---

## 📝 Notes

- **Всегда используйте Display Templates** — облегчает навигацию
- **Настраивайте иконки** — визуальная идентификация коллекций
- **Группируйте связанные поля** — используйте разделители (Divider)
- **Добавляйте подсказки** — поле `Note` с описанием
- **Используйте Conditional Rules** — показывайте поля по условию
- **Настройте Search Fields** — для быстрого поиска по коллекции

