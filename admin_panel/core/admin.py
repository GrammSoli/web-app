"""
Регистрация моделей в Django Admin с использованием Unfold темы.

Этот файл определяет, как модели отображаются в админ-панели:
- Какие поля показывать в списке
- Какие поля доступны для поиска и фильтрации
- Какие действия (actions) доступны
"""

from django.contrib import admin
from unfold.admin import ModelAdmin
from unfold.decorators import display

from .models import User, JournalEntry, Transaction, Subscription, Broadcast, UsageLog, AppConfig
from .actions import send_broadcast, send_welcome_message


@admin.register(User)
class UserAdmin(ModelAdmin):
    """
    Админ-класс для управления пользователями.
    Наследуется от unfold.admin.ModelAdmin для красивого UI.
    """
    
    # Поля, отображаемые в списке пользователей
    list_display = [
        'id',
        'display_telegram_id',
        'username',
        'first_name',
        'display_subscription',
        'total_entries_count',
        'date_created',
    ]
    
    # Поля для поиска
    search_fields = [
        'telegram_id',
        'username',
        'first_name',
        'last_name',
    ]
    
    # Фильтры в боковой панели
    list_filter = [
        'subscription_tier',
        'status',
        'is_admin',
        'language_code',
        'date_created',
    ]
    
    # Поля только для чтения (нельзя редактировать)
    readonly_fields = [
        'id',
        'telegram_id',
        'total_entries_count',
        'total_voice_count',
        'total_spend_usd',
        'date_created',
        'date_updated',
    ]
    
    # Сортировка по умолчанию
    ordering = ['-date_created']
    
    # Количество записей на странице
    list_per_page = 50
    
    # Кастомные действия
    actions = [send_broadcast, send_welcome_message]
    
    # Группировка полей при редактировании
    fieldsets = (
        ('Основная информация', {
            'fields': ('telegram_id', 'username', 'first_name', 'last_name')
        }),
        ('Подписка', {
            'fields': ('subscription_tier', 'subscription_expires_at', 'balance_stars')
        }),
        ('Статистика', {
            'fields': ('total_entries_count', 'total_voice_count', 'total_spend_usd')
        }),
        ('Настройки', {
            'fields': ('language_code', 'timezone', 'status', 'is_admin', 'reminder_enabled', 'reminder_time')
        }),
        ('Даты', {
            'fields': ('date_created', 'date_updated'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Telegram ID", ordering="telegram_id")
    def display_telegram_id(self, obj):
        """Отображение Telegram ID с форматированием."""
        return f"🆔 {obj.telegram_id}"
    
    @display(description="Подписка")
    def display_subscription(self, obj):
        """Отображение типа подписки."""
        tier_labels = {
            'free': '🆓 Free',
            'premium': '⭐ Premium',
            'pro': '💎 Pro',
        }
        return tier_labels.get(obj.subscription_tier, obj.subscription_tier or '🆓 Free')


@admin.register(JournalEntry)
class JournalEntryAdmin(ModelAdmin):
    """
    Админ-класс для управления записями дневника.
    """
    
    # Поля, отображаемые в списке
    list_display = [
        'id',
        'user',
        'display_mood',
        'mood_score',
        'display_voice_badge',
        'short_content_display',
        'date_created',
    ]
    
    # Поля для поиска
    search_fields = [
        'text_content',
        'user__telegram_id',
        'user__username',
    ]
    
    # Фильтры
    list_filter = [
        'mood_label',
        'is_voice',
        'is_processed',
        'date_created',
    ]
    
    # Поля только для чтения
    readonly_fields = [
        'id',
        'user',
        'date_created',
        'date_updated',
        'ai_summary',
        'ai_suggestions',
        'ai_tags',
    ]
    
    # Сортировка
    ordering = ['-date_created']
    
    # Записей на странице
    list_per_page = 50
    
    # Группировка полей
    fieldsets = (
        ('Запись', {
            'fields': ('user', 'text_content', 'mood_label', 'mood_score')
        }),
        ('Голосовое сообщение', {
            'fields': ('is_voice', 'voice_duration_seconds', 'voice_file_id'),
            'classes': ('collapse',),
        }),
        ('AI анализ', {
            'fields': ('ai_summary', 'ai_suggestions', 'ai_tags', 'is_processed', 'processing_error'),
            'classes': ('collapse',),
        }),
        ('Метаданные', {
            'fields': ('date_created', 'date_updated'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Настроение")
    def display_mood(self, obj):
        """Отображение настроения с эмодзи."""
        if obj.mood_score:
            if obj.mood_score >= 8:
                return f"😊 {obj.mood_score}/10"
            elif obj.mood_score >= 5:
                return f"😐 {obj.mood_score}/10"
            else:
                return f"😢 {obj.mood_score}/10"
        return obj.mood_label or '—'
    
    @display(
        description="Голос",
        label={
            True: "info",
            False: "secondary",
        }
    )
    def display_voice_badge(self, obj):
        """Отображение метки голосового сообщения."""
        return obj.is_voice
    
    @display(description="Содержание")
    def short_content_display(self, obj):
        """Сокращённое содержание записи."""
        if obj.text_content:
            return obj.text_content[:80] + '...' if len(obj.text_content) > 80 else obj.text_content
        return '(пусто)'


@admin.register(Transaction)
class TransactionAdmin(ModelAdmin):
    """Админ-класс для транзакций."""
    
    list_display = [
        'id',
        'user',
        'transaction_type',
        'display_amount',
        'is_successful',
        'date_created',
    ]
    
    search_fields = [
        'user__telegram_id',
        'user__username',
        'telegram_payment_id',
        'invoice_id',
    ]
    
    list_filter = [
        'transaction_type',
        'is_successful',
        'date_created',
    ]
    
    readonly_fields = [
        'id',
        'user',
        'telegram_payment_id',
        'telegram_payment_charge_id',
        'invoice_id',
        'date_created',
    ]
    
    ordering = ['-date_created']
    list_per_page = 50
    
    @display(description="Сумма")
    def display_amount(self, obj):
        if obj.amount_stars:
            return f"⭐ {obj.amount_stars} (${obj.amount_usd})"
        return f"${obj.amount_usd}"


@admin.register(Subscription)
class SubscriptionAdmin(ModelAdmin):
    """Админ-класс для подписок."""
    
    list_display = [
        'id',
        'user',
        'tier',
        'display_price',
        'is_active',
        'expires_at',
        'date_created',
    ]
    
    search_fields = [
        'user__telegram_id',
        'user__username',
    ]
    
    list_filter = [
        'tier',
        'is_active',
        'date_created',
    ]
    
    readonly_fields = [
        'id',
        'user',
        'transaction',
        'date_created',
        'date_updated',
    ]
    
    ordering = ['-date_created']
    list_per_page = 50
    
    @display(description="Цена")
    def display_price(self, obj):
        return f"⭐ {obj.price_stars} (${obj.price_usd})"


@admin.register(Broadcast)
class BroadcastAdmin(ModelAdmin):
    """Админ-класс для рассылок."""
    
    list_display = [
        'id',
        'title',
        'target_audience',
        'display_status',
        'display_stats',
        'scheduled_at',
        'date_created',
    ]
    
    search_fields = [
        'title',
        'message_text',
    ]
    
    list_filter = [
        'status',
        'target_audience',
        'date_created',
    ]
    
    readonly_fields = [
        'id',
        'started_at',
        'completed_at',
        'sent_count',
        'failed_count',
        'total_recipients',
        'last_error',
        'date_created',
        'date_updated',
    ]
    
    ordering = ['-date_created']
    list_per_page = 50
    
    @display(description="Статус")
    def display_status(self, obj):
        status_icons = {
            'draft': '📝 Черновик',
            'scheduled': '⏰ Запланирована',
            'in_progress': '🚀 В процессе',
            'completed': '✅ Завершена',
            'failed': '❌ Ошибка',
        }
        return status_icons.get(obj.status, obj.status)
    
    @display(description="Статистика")
    def display_stats(self, obj):
        if obj.total_recipients:
            return f"✉️ {obj.sent_count}/{obj.total_recipients} (❌ {obj.failed_count})"
        return '—'


@admin.register(UsageLog)
class UsageLogAdmin(ModelAdmin):
    """Админ-класс для логов использования AI."""
    
    list_display = [
        'id',
        'user',
        'service_type',
        'model_name',
        'display_tokens',
        'cost_usd',
        'latency_ms',
        'date_created',
    ]
    
    search_fields = [
        'user__telegram_id',
        'user__username',
        'model_name',
        'request_id',
    ]
    
    list_filter = [
        'service_type',
        'model_name',
        'date_created',
    ]
    
    readonly_fields = [
        'id',
        'user',
        'entry',
        'date_created',
    ]
    
    ordering = ['-date_created']
    list_per_page = 100
    
    @display(description="Токены")
    def display_tokens(self, obj):
        return f"📥 {obj.input_tokens} / 📤 {obj.output_tokens}"


@admin.register(AppConfig)
class AppConfigAdmin(ModelAdmin):
    """Админ-класс для настроек приложения."""
    
    list_display = [
        'key',
        'category',
        'display_value',
        'value_type',
        'is_active',
        'date_updated',
    ]
    
    search_fields = [
        'key',
        'description',
        'value',
    ]
    
    list_filter = [
        'category',
        'value_type',
        'is_active',
        'is_secret',
    ]
    
    readonly_fields = [
        'id',
        'date_created',
        'date_updated',
    ]
    
    ordering = ['category', 'key']
    list_per_page = 50
    
    fieldsets = (
        ('Ключ', {
            'fields': ('key', 'category', 'description')
        }),
        ('Значение', {
            'fields': ('value', 'value_type', 'default_value')
        }),
        ('Настройки', {
            'fields': ('is_active', 'is_secret')
        }),
        ('Метаданные', {
            'fields': ('updated_by', 'date_created', 'date_updated'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Значение")
    def display_value(self, obj):
        if obj.is_secret:
            return "🔒 [скрыто]"
        value = str(obj.value)
        return value[:50] + '...' if len(value) > 50 else value
