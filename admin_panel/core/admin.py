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

from .models import User, JournalEntry
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
        'display_premium_status',
        'display_blocked_status',
        'created_at',
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
        'is_premium',
        'is_blocked',
        'language_code',
        'created_at',
    ]
    
    # Поля только для чтения (нельзя редактировать)
    readonly_fields = [
        'id',
        'telegram_id',
        'created_at',
        'updated_at',
    ]
    
    # Сортировка по умолчанию
    ordering = ['-created_at']
    
    # Количество записей на странице
    list_per_page = 50
    
    # Кастомные действия
    actions = [send_broadcast, send_welcome_message]
    
    # Группировка полей при редактировании
    fieldsets = (
        ('Основная информация', {
            'fields': ('telegram_id', 'username', 'first_name', 'last_name')
        }),
        ('Настройки', {
            'fields': ('language_code', 'timezone', 'is_premium', 'is_blocked')
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Telegram ID", ordering="telegram_id")
    def display_telegram_id(self, obj):
        """Отображение Telegram ID с форматированием."""
        return f"🆔 {obj.telegram_id}"
    
    @display(
        description="Premium",
        ordering="is_premium",
        label={
            True: "success",
            False: "warning",
        }
    )
    def display_premium_status(self, obj):
        """Отображение Premium статуса с цветной меткой."""
        return obj.is_premium
    
    @display(
        description="Заблокирован",
        ordering="is_blocked",
        label={
            True: "danger",
            False: "success",
        }
    )
    def display_blocked_status(self, obj):
        """Отображение статуса блокировки с цветной меткой."""
        return obj.is_blocked


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
        'created_at',
    ]
    
    # Поля для поиска
    search_fields = [
        'content',
        'user__telegram_id',
        'user__username',
    ]
    
    # Фильтры
    list_filter = [
        'mood',
        'is_voice',
        'created_at',
    ]
    
    # Поля только для чтения
    readonly_fields = [
        'id',
        'user',
        'created_at',
        'updated_at',
        'ai_analysis',
    ]
    
    # Сортировка
    ordering = ['-created_at']
    
    # Записей на странице
    list_per_page = 50
    
    # Группировка полей
    fieldsets = (
        ('Запись', {
            'fields': ('user', 'content', 'mood', 'mood_score')
        }),
        ('Голосовое сообщение', {
            'fields': ('is_voice', 'voice_duration'),
            'classes': ('collapse',),
        }),
        ('AI анализ', {
            'fields': ('ai_analysis',),
            'classes': ('collapse',),
        }),
        ('Метаданные', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )
    
    @display(description="Настроение")
    def display_mood(self, obj):
        """Отображение настроения с эмодзи."""
        mood_emojis = {
            'happy': '😊 Счастливый',
            'sad': '😢 Грустный',
            'anxious': '😰 Тревожный',
            'calm': '😌 Спокойный',
            'angry': '😠 Злой',
            'excited': '🎉 Возбуждённый',
            'neutral': '😐 Нейтральный',
        }
        return mood_emojis.get(obj.mood, obj.mood or '—')
    
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
        if obj.content:
            return obj.content[:80] + '...' if len(obj.content) > 80 else obj.content
        return '(пусто)'
