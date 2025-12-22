"""
Кастомные действия (actions) для Django Admin.

Включает:
- Массовая рассылка через Celery с rate limiting
- Приветственные сообщения через очередь
- Действия для пользователей
"""

from django.contrib import admin, messages


@admin.action(description="📢 Отправить рассылку выбранным пользователям")
def send_broadcast_action(modeladmin, request, queryset):
    """
    Django Admin Action для создания рассылки выбранным пользователям.
    
    Создаёт новую рассылку в таблице broadcasts и запускает через Celery.
    Rate limiting: 25 сообщений/сек (лимит Telegram: 30/сек).
    
    Использование:
        1. Выберите пользователей в списке
        2. В выпадающем меню "Действия" выберите "Отправить рассылку"
        3. Нажмите "Выполнить"
    """
    from .models import Broadcast
    from .tasks import execute_broadcast
    
    # Получаем telegram_id выбранных пользователей
    telegram_ids = list(queryset.values_list('telegram_id', flat=True))
    
    if not telegram_ids:
        modeladmin.message_user(
            request,
            "❌ Выберите хотя бы одного пользователя",
            messages.ERROR
        )
        return
    
    # Создаём рассылку
    broadcast = Broadcast.objects.create(
        title=f"Рассылка из админки ({len(telegram_ids)} получателей)",
        message_text="""Привет! 👋

Это сообщение из админ-панели.

<i>Отправлено через Django Admin + Celery</i>""",
        target_audience='all',
        status='scheduled',
        total_recipients=len(telegram_ids),
    )
    
    # Запускаем через Celery с rate limiting
    execute_broadcast.delay(str(broadcast.id))
    
    modeladmin.message_user(
        request,
        f"🚀 Рассылка создана и запущена! ID: {broadcast.id}. "
        f"Отслеживайте прогресс в разделе 'Рассылки'.",
        messages.SUCCESS
    )


@admin.action(description="⭐ Установить подписку: Premium")
def set_subscription_premium(modeladmin, request, queryset):
    """Массово установить Premium подписку выбранным пользователям."""
    from datetime import datetime, timedelta
    from django.utils import timezone
    
    expires_at = timezone.now() + timedelta(days=30)
    updated = queryset.update(
        subscription_tier='premium',
        subscription_expires_at=expires_at
    )
    modeladmin.message_user(
        request,
        f"⭐ Premium подписка установлена для {updated} пользователей (на 30 дней)",
        messages.SUCCESS
    )


@admin.action(description="💎 Установить подписку: Basic")
def set_subscription_basic(modeladmin, request, queryset):
    """Массово установить Basic подписку выбранным пользователям."""
    from datetime import datetime, timedelta
    from django.utils import timezone
    
    expires_at = timezone.now() + timedelta(days=30)
    updated = queryset.update(
        subscription_tier='basic',
        subscription_expires_at=expires_at
    )
    modeladmin.message_user(
        request,
        f"💎 Pro подписка установлена для {updated} пользователей (на 30 дней)",
        messages.SUCCESS
    )


@admin.action(description="🆓 Сбросить на Free")
def set_subscription_free(modeladmin, request, queryset):
    """Массово сбросить подписку на Free."""
    updated = queryset.update(
        subscription_tier='free',
        subscription_expires_at=None
    )
    modeladmin.message_user(
        request,
        f"🆓 Подписка сброшена на Free для {updated} пользователей",
        messages.SUCCESS
    )


@admin.action(description="🚫 Заблокировать пользователей")
def block_users(modeladmin, request, queryset):
    """Массово заблокировать пользователей."""
    updated = queryset.update(status='blocked')
    modeladmin.message_user(
        request,
        f"🚫 Заблокировано {updated} пользователей",
        messages.WARNING
    )


@admin.action(description="✅ Разблокировать пользователей")
def unblock_users(modeladmin, request, queryset):
    """Массово разблокировать пользователей."""
    updated = queryset.update(status='active')
    modeladmin.message_user(
        request,
        f"✅ Разблокировано {updated} пользователей",
        messages.SUCCESS
    )


@admin.action(description="📨 Отправить приветственное сообщение")
def send_welcome_message(modeladmin, request, queryset):
    """
    Отправляет приветственное сообщение выбранным пользователям через Celery.
    Сообщения добавляются в очередь и отправляются с rate limiting.
    """
    from .tasks import send_single_message
    
    queued = 0
    
    for user in queryset:
        welcome_text = f"""🎉 Привет{', ' + user.first_name if user.first_name else ''}!

Спасибо, что выбрали наше приложение.

Если у вас есть вопросы — напишите нам!"""
        
        # Отправляем через очередь Celery
        send_single_message.delay(
            telegram_id=user.telegram_id,
            text=welcome_text
        )
        queued += 1
    
    modeladmin.message_user(
        request,
        f"✅ Приветствие добавлено в очередь: {queued} пользователям",
        messages.SUCCESS
    )
