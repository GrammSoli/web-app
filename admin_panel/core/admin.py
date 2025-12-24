"""
Регистрация моделей в Django Admin с использованием Unfold темы.

Этот файл определяет, как модели отображаются в админ-панели:
- Какие поля показывать в списке
- Какие поля доступны для поиска и фильтрации
- Какие действия (actions) доступны
"""

from django.contrib import admin, messages
from unfold.admin import ModelAdmin
from unfold.decorators import display

from .models import User, JournalEntry, Transaction, Subscription, Broadcast, UsageLog, AppConfig, UserSegment, TrafficSource
from .actions import (
    send_broadcast_action, 
    send_welcome_message,
    set_subscription_premium,
    set_subscription_basic,
    set_subscription_free,
    block_users,
    unblock_users,
)


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
        'referral_source',
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
    actions = [
        set_subscription_premium,
        set_subscription_basic,
        set_subscription_free,
        block_users,
        unblock_users,
        send_broadcast_action, 
        send_welcome_message,
    ]
    
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


# Используем стандартный Django admin для Broadcast (Unfold имеет баг с UUID)
from django.contrib.admin import ModelAdmin as DjangoModelAdmin

@admin.register(Broadcast)
class BroadcastAdmin(DjangoModelAdmin):
    """
    Админ-класс для рассылок с интеграцией Celery.
    
    Профессиональная система рассылок:
    - Rate limiting (25 msg/sec)
    - Прогресс в реальном времени
    - Retry механизм
    """
    
    list_display = [
        'id',
        'title',
        'display_segment',
        'display_status',
        'display_stats',
        'scheduled_at',
        'date_created',
        'launch_button',
    ]
    
    search_fields = [
        'title',
        'message_text',
    ]
    
    list_filter = [
        'status',
        'segment',
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
    
    # Кастомные действия для рассылок
    actions = ['start_broadcast_action', 'cancel_broadcast_action']
    
    # Для создания новой рассылки показываем только основные поля
    add_fieldsets = (
        ('Содержание', {
            'fields': ('title', 'message_text', 'message_photo_url'),
            'description': 'Текст поддерживает HTML-теги: <b>, <i>, <a href="...">'
        }),
        ('Таргетинг', {
            'fields': ('segment', 'target_audience'),
            'description': '🎯 Выберите сегмент ИЛИ используйте аудиторию (legacy)'
        }),
        ('Настройки', {
            'fields': ('status', 'scheduled_at'),
        }),
    )
    
    fieldsets = (
        ('Содержание', {
            'fields': ('title', 'message_text', 'message_photo_url'),
            'description': 'Текст поддерживает HTML-теги: <b>, <i>, <a href="...">'
        }),
        ('Таргетинг', {
            'fields': ('segment', 'target_audience'),
            'description': '🎯 Если выбран сегмент, он имеет приоритет над аудиторией'
        }),
        ('Настройки', {
            'fields': ('status', 'scheduled_at'),
        }),
        ('Статистика', {
            'fields': ('total_recipients', 'sent_count', 'failed_count', 'last_error'),
            'classes': ('collapse',),
        }),
        ('Метаданные', {
            'fields': ('started_at', 'completed_at', 'date_created', 'date_updated'),
            'classes': ('collapse',),
        }),
    )
    
    def display_segment(self, obj):
        """Отображение сегмента или legacy аудитории."""
        if obj.segment:
            return f"🎯 {obj.segment.name}"
        return f"📢 {obj.get_target_audience_display()}"
    display_segment.short_description = 'Сегмент'
    
    def get_fieldsets(self, request, obj=None):
        """Разные fieldsets для создания и редактирования."""
        if obj is None:
            return self.add_fieldsets
        return super().get_fieldsets(request, obj)
    
    def get_readonly_fields(self, request, obj=None):
        """При создании нет readonly полей."""
        if obj is None:
            return []
        return self.readonly_fields

    def add_view(self, request, form_url='', extra_context=None):
        """Переопределяем add_view для корректной работы с UUID."""
        return super().add_view(request, form_url, extra_context)

    def response_add(self, request, obj, post_url_continue=None):
        """После создания редиректим на список, а не на change view."""
        from django.http import HttpResponseRedirect
        from django.urls import reverse
        
        # Всегда редирект на список после создания
        if "_continue" not in request.POST and "_addanother" not in request.POST:
            return HttpResponseRedirect(reverse('admin:core_broadcast_changelist'))
        
        return super().response_add(request, obj, post_url_continue)
    
    def launch_button(self, obj):
        """Кнопка для запуска рассылки."""
        from django.utils.html import format_html
        
        if obj.status in ('draft', 'scheduled', 'failed'):
            return format_html(
                '<a class="button" href="/admin/core/broadcast/{}/launch/" style="'
                'background: #28a745; color: white; padding: 5px 12px; '
                'border-radius: 5px; text-decoration: none; font-size: 12px;'
                '">🚀 Запустить</a>',
                obj.id
            )
        elif obj.status == 'sending':
            return format_html('<span style="color: #ffc107;">⏳ В процессе...</span>')
        else:
            return format_html('<span style="color: #6c757d;">✅ Завершено</span>')
    launch_button.short_description = "Действие"
    launch_button.allow_tags = True
    
    def display_status(self, obj):
        status_icons = {
            'draft': '📝 Черновик',
            'scheduled': '⏰ Запланирована',
            'sending': '🚀 В процессе',
            'sent': '✅ Завершена',
            'failed': '❌ Ошибка',
        }
        return status_icons.get(obj.status, obj.status)
    display_status.short_description = "Статус"
    
    def display_stats(self, obj):
        if obj.total_recipients:
            percent = round(obj.sent_count / obj.total_recipients * 100, 1) if obj.total_recipients > 0 else 0
            return f"✉️ {obj.sent_count}/{obj.total_recipients} ({percent}%) • ❌ {obj.failed_count}"
        return '—'
    display_stats.short_description = "Статистика"
    
    @admin.action(description="🚀 Запустить рассылку")
    def start_broadcast_action(self, request, queryset):
        """Запускает выбранные рассылки через Celery."""
        from .tasks import execute_broadcast
        
        started = 0
        skipped = 0
        
        for broadcast in queryset:
            if broadcast.status in ('draft', 'scheduled', 'failed'):
                # Обновляем статус
                Broadcast.objects.filter(id=broadcast.id).update(status='scheduled')
                # Запускаем задачу Celery
                execute_broadcast.delay(str(broadcast.id))
                started += 1
            else:
                skipped += 1
        
        if started > 0:
            self.message_user(
                request,
                f"🚀 Запущено рассылок: {started}. Прогресс можно отслеживать в списке.",
                messages.SUCCESS
            )
        
        if skipped > 0:
            self.message_user(
                request,
                f"⚠️ Пропущено: {skipped} (уже выполняются или завершены)",
                messages.WARNING
            )
    
    @admin.action(description="⏹️ Отменить рассылку")
    def cancel_broadcast_action(self, request, queryset):
        """Отменяет запланированные рассылки."""
        cancelled = queryset.filter(status__in=('draft', 'scheduled')).update(status='draft')
        self.message_user(
            request,
            f"⏹️ Отменено рассылок: {cancelled}",
            messages.SUCCESS
        )


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


@admin.register(UserSegment)
class UserSegmentAdmin(ModelAdmin):
    """
    Админ-класс для управления сегментами пользователей.
    """
    
    list_display = [
        'name',
        'slug',
        'display_type',
        'cached_user_count',
        'is_system',
        'cache_updated_at',
    ]
    
    search_fields = [
        'name',
        'slug',
        'description',
    ]
    
    list_filter = [
        'segment_type',
        'is_system',
    ]
    
    readonly_fields = [
        'id',
        'cached_user_count',
        'cache_updated_at',
        'date_created',
        'date_updated',
    ]
    
    ordering = ['-is_system', 'name']
    list_per_page = 50
    
    actions = ['recalculate_user_count']
    
    @admin.action(description="🔄 Пересчитать количество пользователей")
    def recalculate_user_count(self, request, queryset):
        """Пересчитывает cached_user_count для выбранных сегментов."""
        from .tasks import update_segment_user_counts
        
        # Запускаем через Celery
        update_segment_user_counts.delay()
        
        self.message_user(
            request,
            f"🔄 Пересчёт запущен для всех сегментов. Обновите страницу через несколько секунд.",
            messages.SUCCESS
        )
    
    fieldsets = (
        ('Основное', {
            'fields': ('name', 'slug', 'description', 'segment_type', 'is_system')
        }),
        ('Правила (для динамических)', {
            'fields': ('filter_rules',),
            'description': 'JSON-правила фильтрации. Примеры: {"subscription_tier": ["premium"]}, {"date_created": {"gte": "-7 days"}}'
        }),
        ('Статический список (для static)', {
            'fields': ('static_user_ids',),
            'description': 'Список UUID пользователей для статических сегментов'
        }),
        ('Статистика', {
            'fields': ('cached_user_count', 'cache_updated_at'),
            'classes': ('collapse',),
        }),
        ('Метаданные', {
            'fields': ('date_created', 'date_updated'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Тип")
    def display_type(self, obj):
        type_icons = {
            'system': '⚙️ Системный',
            'dynamic': '🔄 Динамический',
            'static': '📌 Статический',
        }
        return type_icons.get(obj.segment_type, obj.segment_type)
    
    def has_delete_permission(self, request, obj=None):
        """Системные сегменты нельзя удалять."""
        if obj and obj.is_system:
            return False
        return super().has_delete_permission(request, obj)
    
    def get_readonly_fields(self, request, obj=None):
        """Для системных сегментов больше полей readonly."""
        readonly = list(self.readonly_fields)
        if obj and obj.is_system:
            readonly.extend(['slug', 'segment_type', 'is_system', 'filter_rules'])
        return readonly


@admin.register(TrafficSource)
class TrafficSourceAdmin(ModelAdmin):
    """
    Админ-класс для управления источниками трафика.
    """
    
    list_display = [
        'name',
        'slug',
        'display_type',
        'display_users',
        'display_paying',
        'display_conversion',
        'display_revenue',
        'display_arpu',
        'display_link',
        'is_active',
    ]
    
    list_filter = [
        'source_type',
        'is_active',
    ]
    
    search_fields = [
        'slug',
        'name',
        'description',
    ]
    
    readonly_fields = [
        'id',
        'total_users',
        'total_paying_users',
        'total_revenue_usd',
        'date_created',
        'date_updated',
    ]
    
    ordering = ['-total_users']
    list_per_page = 50
    
    actions = ['recalculate_stats']
    
    fieldsets = (
        ('Основное', {
            'fields': ('name', 'slug', 'description', 'source_type', 'is_active')
        }),
        ('UTM параметры', {
            'fields': ('utm_source', 'utm_medium', 'utm_campaign'),
            'classes': ('collapse',),
        }),
        ('Статистика (обновляется автоматически)', {
            'fields': ('total_users', 'total_paying_users', 'total_revenue_usd'),
        }),
        ('Метаданные', {
            'fields': ('date_created', 'date_updated'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Тип")
    def display_type(self, obj):
        type_icons = {
            'utm': '🔗 UTM',
            'campaign': '📢 Кампания',
            'referral': '👥 Реферал',
            'organic': '🌱 Органика',
        }
        return type_icons.get(obj.source_type, obj.source_type)
    
    @display(description="Пользователей")
    def display_users(self, obj):
        return obj.total_users
    
    @display(description="Платящих")
    def display_paying(self, obj):
        return obj.total_paying_users
    
    @display(description="Конверсия")
    def display_conversion(self, obj):
        if obj.total_users == 0:
            return "—"
        rate = obj.total_paying_users / obj.total_users * 100
        return f"{rate:.1f}%"
    
    @display(description="Доход")
    def display_revenue(self, obj):
        return f"${obj.total_revenue_usd:.2f}"
    
    @display(description="ARPU")
    def display_arpu(self, obj):
        if obj.total_users == 0:
            return "—"
        arpu = float(obj.total_revenue_usd) / obj.total_users
        return f"${arpu:.2f}"
    
    @display(description="Ссылка")
    def display_link(self, obj):
        return f"t.me/MindfulJournalBot?start={obj.slug}"
    
    @admin.action(description="🔄 Пересчитать статистику")
    def recalculate_stats(self, request, queryset):
        """Пересчитать статистику для выбранных источников."""
        from django.db import connection
        
        updated = 0
        for source in queryset:
            with connection.cursor() as cursor:
                # Подсчитываем пользователей
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(*) FILTER (WHERE subscription_tier != 'free' OR total_spend_usd > 0) as paying,
                        COALESCE(SUM(total_spend_usd), 0) as revenue
                    FROM app.users 
                    WHERE referral_source = %s
                """, [source.slug])
                row = cursor.fetchone()
                
                if row:
                    source.total_users = row[0]
                    source.total_paying_users = row[1]
                    source.total_revenue_usd = row[2]
                    source.save()
                    updated += 1
        
        self.message_user(request, f"✅ Обновлено источников: {updated}", messages.SUCCESS)
