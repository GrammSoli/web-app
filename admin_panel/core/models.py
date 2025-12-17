"""
Модели для существующей PostgreSQL базы данных (схема app).

⚠️ ВАЖНО: Эти модели настроены как `managed = False`, чтобы Django 
НЕ создавал миграции и не ломал существующую схему!
"""

import uuid
from django.db import models


class User(models.Model):
    """
    Модель пользователя приложения.
    Соответствует таблице app.users.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    telegram_id = models.BigIntegerField(unique=True, verbose_name='Telegram ID')
    username = models.CharField(max_length=255, blank=True, null=True, verbose_name='Username')
    first_name = models.CharField(max_length=255, blank=True, null=True, verbose_name='Имя')
    last_name = models.CharField(max_length=255, blank=True, null=True, verbose_name='Фамилия')
    language_code = models.CharField(max_length=10, blank=True, null=True, default='ru', verbose_name='Язык')
    
    # Подписка
    subscription_tier = models.CharField(max_length=20, blank=True, null=True, verbose_name='Тип подписки')
    subscription_expires_at = models.DateTimeField(blank=True, null=True, verbose_name='Подписка до')
    balance_stars = models.IntegerField(default=0, verbose_name='Баланс звёзд')
    
    # Статистика
    total_entries_count = models.IntegerField(default=0, verbose_name='Всего записей')
    total_voice_count = models.IntegerField(default=0, verbose_name='Голосовых записей')
    total_spend_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0, verbose_name='Потрачено USD')
    
    # Настройки
    is_admin = models.BooleanField(default=False, verbose_name='Админ')
    timezone = models.CharField(max_length=50, default='UTC', verbose_name='Часовой пояс')
    reminder_enabled = models.BooleanField(default=False, verbose_name='Напоминания')
    reminder_time = models.CharField(max_length=5, blank=True, null=True, verbose_name='Время напоминания')
    privacy_blur_default = models.BooleanField(default=False, verbose_name='Размытие по умолчанию')
    status = models.CharField(max_length=20, default='active', verbose_name='Статус')
    
    # Даты
    date_created = models.DateTimeField(auto_now_add=True, verbose_name='Дата регистрации')
    date_updated = models.DateTimeField(auto_now=True, verbose_name='Обновлено')

    class Meta:
        managed = False
        db_table = 'users'
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'
        ordering = ['-date_created']

    def __str__(self):
        if self.username:
            return f"@{self.username} ({self.telegram_id})"
        return str(self.telegram_id)


class JournalEntry(models.Model):
    """
    Модель записи в дневнике.
    Соответствует таблице app.journal_entries.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='entries',
        verbose_name='Пользователь'
    )
    text_content = models.TextField(verbose_name='Содержание')
    
    # Голосовое сообщение
    voice_file_id = models.CharField(max_length=255, blank=True, null=True, verbose_name='ID голосового файла')
    voice_duration_seconds = models.IntegerField(blank=True, null=True, verbose_name='Длительность (сек)')
    is_voice = models.BooleanField(default=False, verbose_name='Голосовая запись')
    
    # Настроение
    mood_score = models.IntegerField(blank=True, null=True, verbose_name='Оценка настроения')
    mood_label = models.CharField(max_length=50, blank=True, null=True, verbose_name='Метка настроения')
    
    # AI анализ
    ai_tags = models.JSONField(default=list, blank=True, verbose_name='AI теги')
    ai_summary = models.TextField(blank=True, null=True, verbose_name='AI резюме')
    ai_suggestions = models.TextField(blank=True, null=True, verbose_name='AI рекомендации')
    
    # Статус обработки
    is_processed = models.BooleanField(default=False, verbose_name='Обработано')
    processing_error = models.TextField(blank=True, null=True, verbose_name='Ошибка обработки')
    
    # Даты
    date_created = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    date_updated = models.DateTimeField(auto_now=True, verbose_name='Обновлено')

    class Meta:
        managed = False
        db_table = 'journal_entries'
        verbose_name = 'Запись дневника'
        verbose_name_plural = 'Записи дневника'
        ordering = ['-date_created']

    def __str__(self):
        return f"Запись от {self.date_created.strftime('%d.%m.%Y') if self.date_created else 'N/A'}"

    @property
    def short_content(self):
        """Возвращает сокращённое содержание для отображения в списке."""
        if self.text_content:
            return self.text_content[:100] + '...' if len(self.text_content) > 100 else self.text_content
        return '(пусто)'
