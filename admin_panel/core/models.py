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


class Transaction(models.Model):
    """
    Модель транзакции.
    Соответствует таблице app.transactions.
    """
    TRANSACTION_TYPES = [
        ('subscription', 'Подписка'),
        ('stars_purchase', 'Покупка звёзд'),
        ('refund', 'Возврат'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='transactions',
        verbose_name='Пользователь'
    )
    transaction_type = models.CharField(max_length=50, verbose_name='Тип транзакции')
    amount_stars = models.IntegerField(default=0, verbose_name='Сумма (звёзды)')
    amount_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0, verbose_name='Сумма USD')
    currency = models.CharField(max_length=10, blank=True, null=True, verbose_name='Валюта')
    
    # Telegram Payment
    telegram_payment_id = models.CharField(max_length=255, blank=True, null=True, verbose_name='Telegram Payment ID')
    telegram_payment_charge_id = models.CharField(max_length=255, blank=True, null=True, verbose_name='Charge ID')
    invoice_id = models.CharField(max_length=255, blank=True, null=True, unique=True, verbose_name='Invoice ID')
    
    # Статус
    is_successful = models.BooleanField(default=True, verbose_name='Успешно')
    failure_reason = models.TextField(blank=True, null=True, verbose_name='Причина ошибки')
    metadata = models.JSONField(blank=True, null=True, verbose_name='Метаданные')
    
    date_created = models.DateTimeField(auto_now_add=True, verbose_name='Дата')

    class Meta:
        managed = False
        db_table = 'transactions'
        verbose_name = 'Транзакция'
        verbose_name_plural = 'Транзакции'
        ordering = ['-date_created']

    def __str__(self):
        return f"{self.transaction_type} - {self.amount_stars}⭐ ({self.user})"


class Subscription(models.Model):
    """
    Модель подписки.
    Соответствует таблице app.subscriptions.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='subscriptions',
        verbose_name='Пользователь'
    )
    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.SET_NULL,
        db_column='transaction_id',
        null=True,
        blank=True,
        verbose_name='Транзакция'
    )
    tier = models.CharField(max_length=255, default='free', verbose_name='Тариф')
    starts_at = models.DateTimeField(verbose_name='Начало')
    expires_at = models.DateTimeField(verbose_name='Окончание')
    price_stars = models.IntegerField(verbose_name='Цена (звёзды)')
    price_usd = models.DecimalField(max_digits=10, decimal_places=4, verbose_name='Цена USD')
    is_active = models.BooleanField(default=True, verbose_name='Активна')
    cancelled_at = models.DateTimeField(blank=True, null=True, verbose_name='Отменена')
    
    date_created = models.DateTimeField(auto_now_add=True, verbose_name='Создана')
    date_updated = models.DateTimeField(auto_now=True, verbose_name='Обновлена')

    class Meta:
        managed = False
        db_table = 'subscriptions'
        verbose_name = 'Подписка'
        verbose_name_plural = 'Подписки'
        ordering = ['-date_created']

    def __str__(self):
        return f"{self.tier} - {self.user} (до {self.expires_at.strftime('%d.%m.%Y') if self.expires_at else 'N/A'})"


class Broadcast(models.Model):
    """
    Модель рассылки.
    Соответствует таблице app.broadcasts.
    """
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('scheduled', 'Запланирована'),
        ('in_progress', 'В процессе'),
        ('completed', 'Завершена'),
        ('failed', 'Ошибка'),
    ]
    
    AUDIENCE_CHOICES = [
        ('all', 'Все'),
        ('premium', 'Premium'),
        ('free', 'Бесплатные'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, verbose_name='Название')
    message_text = models.TextField(verbose_name='Текст сообщения')
    message_photo_url = models.TextField(blank=True, null=True, verbose_name='URL фото')
    
    target_audience = models.CharField(
        max_length=20, 
        choices=AUDIENCE_CHOICES,
        default='all', 
        blank=True,
        null=True,
        verbose_name='Аудитория'
    )
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES,
        default='draft', 
        blank=True,
        null=True,
        verbose_name='Статус'
    )
    
    scheduled_at = models.DateTimeField(blank=True, null=True, verbose_name='Запланировано на')
    started_at = models.DateTimeField(blank=True, null=True, verbose_name='Начало')
    completed_at = models.DateTimeField(blank=True, null=True, verbose_name='Завершено')
    
    total_recipients = models.IntegerField(default=0, blank=True, null=True, verbose_name='Всего получателей')
    sent_count = models.IntegerField(default=0, blank=True, null=True, verbose_name='Отправлено')
    failed_count = models.IntegerField(default=0, blank=True, null=True, verbose_name='Ошибок')
    last_error = models.TextField(blank=True, null=True, verbose_name='Последняя ошибка')
    
    date_created = models.DateTimeField(blank=True, null=True, verbose_name='Создана')
    date_updated = models.DateTimeField(blank=True, null=True, verbose_name='Обновлена')

    class Meta:
        managed = False
        db_table = 'broadcasts'
        verbose_name = 'Рассылка'
        verbose_name_plural = 'Рассылки'
        ordering = ['-date_created']

    def save(self, *args, **kwargs):
        """Генерируем UUID если не задан и устанавливаем даты."""
        from django.utils import timezone
        if not self.id:
            self.id = uuid.uuid4()
        if not self.date_created:
            self.date_created = timezone.now()
        self.date_updated = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.status})"


class UsageLog(models.Model):
    """
    Модель логов использования AI.
    Соответствует таблице app.usage_logs.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='usage_logs',
        verbose_name='Пользователь'
    )
    entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.SET_NULL,
        db_column='entry_id',
        null=True,
        blank=True,
        verbose_name='Запись'
    )
    service_type = models.CharField(max_length=50, verbose_name='Сервис')
    model_name = models.CharField(max_length=50, verbose_name='Модель')
    input_tokens = models.IntegerField(default=0, verbose_name='Входные токены')
    output_tokens = models.IntegerField(default=0, verbose_name='Выходные токены')
    duration_seconds = models.IntegerField(default=0, verbose_name='Длительность (сек)')
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0, verbose_name='Стоимость USD')
    latency_ms = models.IntegerField(blank=True, null=True, verbose_name='Задержка (мс)')
    request_id = models.CharField(max_length=100, blank=True, null=True, verbose_name='Request ID')
    
    date_created = models.DateTimeField(auto_now_add=True, verbose_name='Дата')

    class Meta:
        managed = False
        db_table = 'usage_logs'
        verbose_name = 'Лог использования'
        verbose_name_plural = 'Логи использования'
        ordering = ['-date_created']

    def __str__(self):
        return f"{self.model_name} - {self.cost_usd}$ ({self.user})"


class AppConfig(models.Model):
    """
    Модель конфигурации приложения.
    Соответствует таблице app.app_config.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=100, unique=True, verbose_name='Ключ')
    value = models.TextField(verbose_name='Значение')
    value_type = models.CharField(max_length=20, default='string', verbose_name='Тип')
    category = models.CharField(max_length=50, verbose_name='Категория')
    description = models.TextField(blank=True, null=True, verbose_name='Описание')
    default_value = models.TextField(verbose_name='Значение по умолчанию')
    is_secret = models.BooleanField(default=False, verbose_name='Секретный')
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    updated_by = models.CharField(max_length=255, blank=True, null=True, verbose_name='Обновил')
    
    date_created = models.DateTimeField(auto_now_add=True, verbose_name='Создан')
    date_updated = models.DateTimeField(auto_now=True, verbose_name='Обновлён')

    class Meta:
        managed = False
        db_table = 'app_config'
        verbose_name = 'Настройка'
        verbose_name_plural = 'Настройки приложения'
        ordering = ['category', 'key']

    def __str__(self):
        return f"{self.category}.{self.key}"
