"""
Кастомные действия (actions) для Django Admin.
Включает функционал рассылки сообщений через Telegram Bot API.
"""

import requests
from django.conf import settings
from django.contrib import admin, messages


def send_telegram_message(telegram_id: int, text: str, bot_token: str) -> bool:
    """
    Отправляет сообщение пользователю через Telegram Bot API.
    
    Args:
        telegram_id: ID пользователя в Telegram
        text: Текст сообщения
        bot_token: Токен бота
        
    Returns:
        True если сообщение отправлено, False если ошибка
    """
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    payload = {
        "chat_id": telegram_id,
        "text": text,
        "parse_mode": "HTML",
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException:
        return False


@admin.action(description="📢 Отправить рассылку выбранным пользователям")
def send_broadcast(modeladmin, request, queryset):
    """
    Django Admin Action для массовой рассылки сообщений через Telegram.
    
    Выбранные пользователи получат сообщение "Привет! 👋"
    через Telegram Bot API.
    
    Использование:
        1. Выберите пользователей в списке
        2. В выпадающем меню "Действия" выберите "Отправить рассылку"
        3. Нажмите "Выполнить"
    """
    # Получаем токен бота из настроек
    bot_token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    
    if not bot_token:
        modeladmin.message_user(
            request,
            "❌ Ошибка: TELEGRAM_BOT_TOKEN не настроен в settings.py!",
            messages.ERROR
        )
        return
    
    # Текст сообщения для рассылки
    broadcast_text = """Привет! 👋

Это тестовое сообщение из админ-панели.

<i>Отправлено через Django Admin</i>"""
    
    sent_count = 0
    failed_count = 0
    blocked_users = []
    
    for user in queryset:
        # Пропускаем заблокированных пользователей
        if hasattr(user, 'is_blocked') and user.is_blocked:
            failed_count += 1
            continue
            
        try:
            success = send_telegram_message(
                telegram_id=user.telegram_id,
                text=broadcast_text,
                bot_token=bot_token
            )
            
            if success:
                sent_count += 1
            else:
                failed_count += 1
                blocked_users.append(user.telegram_id)
                
        except Exception as e:
            failed_count += 1
            # Логируем ошибку, но продолжаем рассылку
            print(f"Ошибка отправки для {user.telegram_id}: {e}")
    
    # Формируем сообщение для администратора
    if sent_count > 0:
        modeladmin.message_user(
            request,
            f"✅ Успешно отправлено: {sent_count} пользователям",
            messages.SUCCESS
        )
    
    if failed_count > 0:
        modeladmin.message_user(
            request,
            f"⚠️ Не удалось отправить: {failed_count} (возможно, бот заблокирован)",
            messages.WARNING
        )


@admin.action(description="📨 Отправить приветственное сообщение")
def send_welcome_message(modeladmin, request, queryset):
    """
    Отправляет приветственное сообщение новым пользователям.
    """
    bot_token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    
    if not bot_token:
        modeladmin.message_user(
            request,
            "❌ Ошибка: TELEGRAM_BOT_TOKEN не настроен!",
            messages.ERROR
        )
        return
    
    welcome_text = """🎉 Добро пожаловать!

Спасибо, что выбрали наше приложение.

Если у вас есть вопросы — напишите нам!"""
    
    sent_count = 0
    
    for user in queryset:
        if send_telegram_message(user.telegram_id, welcome_text, bot_token):
            sent_count += 1
    
    modeladmin.message_user(
        request,
        f"✅ Приветствие отправлено: {sent_count} пользователям",
        messages.SUCCESS
    )
