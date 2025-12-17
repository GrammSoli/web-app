"""
Django settings for admin_panel project.

Современная админ-панель с Unfold темой для управления PostgreSQL базой.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Загрузка переменных окружения из .env файла
load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-change-me-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '*']

# ============================================================================
# INSTALLED_APPS
# ⚠️ КРИТИЧЕСКИ ВАЖНО: unfold должен быть ПЕРЕД django.contrib.admin!
# ============================================================================
INSTALLED_APPS = [
    # Unfold theme (ДОЛЖЕН БЫТЬ ПЕРВЫМ!)
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "unfold.contrib.inlines",
    
    # Django стандартные приложения
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Наше приложение
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'admin_panel.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'admin_panel.wsgi.application'

# ============================================================================
# DATABASE CONFIGURATION
# Подключение к существующей PostgreSQL базе данных
# ============================================================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'your_database'),
        'USER': os.getenv('DB_USER', 'your_user'),
        'PASSWORD': os.getenv('DB_PASSWORD', 'your_password'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'OPTIONS': {
            'options': '-c search_path=app,public',
        },
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ============================================================================
# TELEGRAM BOT CONFIGURATION
# ============================================================================
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')

# ============================================================================
# UNFOLD CONFIGURATION
# Настройка современной темы админ-панели
# ============================================================================
UNFOLD = {
    "SITE_TITLE": "Admin Panel",
    "SITE_HEADER": "Управление приложением",
    "SITE_SYMBOL": "dashboard",
    "SITE_FAVICONS": [],
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "ENVIRONMENT": "admin_panel.utils.environment_callback",
    "COLORS": {
        "primary": {
            "50": "250 245 255",
            "100": "243 232 255",
            "200": "233 213 255",
            "300": "216 180 254",
            "400": "192 132 252",
            "500": "168 85 247",
            "600": "147 51 234",
            "700": "126 34 206",
            "800": "107 33 168",
            "900": "88 28 135",
            "950": "59 7 100",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": True,
        "navigation": [
            {
                "title": "Навигация",
                "separator": True,
                "items": [
                    {
                        "title": "Главная",
                        "icon": "home",
                        "link": "/admin/",
                    },
                    {
                        "title": "📊 Аналитика",
                        "icon": "insights",
                        "link": "/admin/dashboard/",
                    },
                ],
            },
            {
                "title": "Пользователи",
                "separator": True,
                "items": [
                    {
                        "title": "Пользователи",
                        "icon": "people",
                        "link": "/admin/core/user/",
                    },
                    {
                        "title": "Записи дневника",
                        "icon": "book",
                        "link": "/admin/core/journalentry/",
                    },
                ],
            },
            {
                "title": "Финансы",
                "separator": True,
                "items": [
                    {
                        "title": "Транзакции",
                        "icon": "payments",
                        "link": "/admin/core/transaction/",
                    },
                    {
                        "title": "Подписки",
                        "icon": "card_membership",
                        "link": "/admin/core/subscription/",
                    },
                ],
            },
            {
                "title": "Маркетинг",
                "separator": True,
                "items": [
                    {
                        "title": "Рассылки",
                        "icon": "campaign",
                        "link": "/admin/core/broadcast/",
                    },
                ],
            },
            {
                "title": "Аналитика",
                "separator": True,
                "items": [
                    {
                        "title": "Логи AI",
                        "icon": "analytics",
                        "link": "/admin/core/usagelog/",
                    },
                ],
            },
            {
                "title": "Система",
                "separator": True,
                "items": [
                    {
                        "title": "Настройки приложения",
                        "icon": "settings",
                        "link": "/admin/core/appconfig/",
                    },
                    {
                        "title": "Администраторы",
                        "icon": "admin_panel_settings",
                        "link": "/admin/auth/user/",
                    },
                ],
            },
        ],
    },
}
