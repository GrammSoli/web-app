"""
Модели для существующей PostgreSQL базы данных.

⚠️ ВАЖНО: Эти модели сгенерированы с помощью `python manage.py inspectdb`
и настроены как `managed = False`, чтобы Django НЕ создавал миграции
и не ломал существующую Prisma схему!

Для генерации моделей из вашей базы данных выполните:
    python manage.py inspectdb > core/models_generated.py

Затем скопируйте нужные модели сюда и убедитесь, что:
1. Каждая модель имеет `managed = False` в Meta классе
2. Имена таблиц в `db_table` соответствуют вашей схеме
"""

from django.db import models


class User(models.Model):
    """
    Модель пользователя приложения.
    Соответствует таблице User в Prisma схеме.
    """
    id = models.AutoField(primary_key=True)
    telegram_id = models.BigIntegerField(unique=True, verbose_name='Telegram ID')
    username = models.CharField(max_length=255, blank=True, null=True, verbose_name='Username')
    first_name = models.CharField(max_length=255, blank=True, null=True, verbose_name='Имя')
    last_name = models.CharField(max_length=255, blank=True, null=True, verbose_name='Фамилия')
    language_code = models.CharField(max_length=10, blank=True, null=True, verbose_name='Язык')
    is_premium = models.BooleanField(default=False, verbose_name='Premium')
    is_blocked = models.BooleanField(default=False, verbose_name='Заблокирован')
    timezone = models.CharField(max_length=50, blank=True, null=True, verbose_name='Часовой пояс')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата регистрации')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Обновлено')

    class Meta:
        # ⚠️ КРИТИЧНО: managed = False — Django не создаёт миграции!
        managed = False
        db_table = 'User'  # Имя таблицы в PostgreSQL (из Prisma)
        verbose_name = 'Пользователь'
        verbose_name_plural = 'Пользователи'
        ordering = ['-created_at']

    def __str__(self):
        if self.username:
            return f"@{self.username} ({self.telegram_id})"
        return str(self.telegram_id)


class JournalEntry(models.Model):
    """
    Модель записи в дневнике.
    Соответствует таблице JournalEntry в Prisma схеме.
    """
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        db_column='userId',
        related_name='entries',
        verbose_name='Пользователь'
    )
    content = models.TextField(blank=True, null=True, verbose_name='Содержание')
    mood = models.CharField(max_length=50, blank=True, null=True, verbose_name='Настроение')
    mood_score = models.IntegerField(blank=True, null=True, db_column='moodScore', verbose_name='Оценка настроения')
    ai_analysis = models.TextField(blank=True, null=True, db_column='aiAnalysis', verbose_name='AI анализ')
    is_voice = models.BooleanField(default=False, db_column='isVoice', verbose_name='Голосовая запись')
    voice_duration = models.IntegerField(blank=True, null=True, db_column='voiceDuration', verbose_name='Длительность (сек)')
    created_at = models.DateTimeField(auto_now_add=True, db_column='createdAt', verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, db_column='updatedAt', verbose_name='Обновлено')

    class Meta:
        # ⚠️ КРИТИЧНО: managed = False — Django не создаёт миграции!
        managed = False
        db_table = 'JournalEntry'  # Имя таблицы в PostgreSQL (из Prisma)
        verbose_name = 'Запись дневника'
        verbose_name_plural = 'Записи дневника'
        ordering = ['-created_at']

    def __str__(self):
        return f"Запись #{self.id} от {self.user}"

    @property
    def short_content(self):
        """Возвращает сокращённое содержание для отображения в списке."""
        if self.content:
            return self.content[:100] + '...' if len(self.content) > 100 else self.content
        return '(пусто)'
