"""
Конфигурация Celery для Django Admin Panel.

Celery используется для асинхронных задач:
- Массовые рассылки с rate limiting
- Отложенные задачи (scheduled broadcasts)
- Фоновая обработка
"""

import os
from celery import Celery

# Устанавливаем настройки Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'admin_panel.settings')

# Создаём приложение Celery
app = Celery('admin_panel')

# Загружаем настройки из Django settings с префиксом CELERY_
app.config_from_object('django.conf:settings', namespace='CELERY')

# Автоматически находим tasks.py во всех приложениях
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Отладочная задача для проверки работы Celery."""
    print(f'Request: {self.request!r}')
