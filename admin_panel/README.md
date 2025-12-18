# Django Admin Panel

Современная админ-панель для AI Mindful Journal.

## Быстрый старт (локально)

```bash
cd admin_panel

# Виртуальное окружение
python -m venv venv
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate     # Linux/Mac

# Зависимости
pip install -r requirements.txt

# Настройки
cp .env.example .env
# Заполни .env

# Миграции Django (только системные таблицы)
python manage.py migrate

# Суперпользователь
python manage.py createsuperuser

# Запуск
python manage.py runserver 8000
```

## Celery (для рассылок)

```bash
# Worker (в отдельном терминале)
celery -A admin_panel worker -l info

# Beat (в отдельном терминале)
celery -A admin_panel beat -l info
```

## Структура

```
admin_panel/
├── admin_panel/       # Django project
│   ├── settings.py
│   ├── celery.py
│   └── urls.py
├── core/              # Main app
│   ├── models.py      # 8 моделей (managed=False)
│   ├── admin.py       # Admin registration
│   ├── views.py       # Dashboard + Broadcasts
│   ├── tasks.py       # Celery tasks
│   └── templates/
├── requirements.txt
└── manage.py
```

## Модели

Все модели работают с существующей PostgreSQL схемой `app`.
`managed = False` — Django не создаёт миграции для этих таблиц.

## Рассылки

- WYSIWYG редактор с форматированием
- Rate limiting (25 msg/sec)
- Inline кнопки
- Загрузка изображений
- Планирование по времени
- Фильтр аудитории
