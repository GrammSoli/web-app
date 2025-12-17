"""
Flask-Admin для Mindful Journal
Использует SQLAlchemy Automap — модели строятся автоматически из PostgreSQL схемы.
"""

import os
import sys
from pathlib import Path

# Загружаем .env файл ДО всего остального
from dotenv import load_dotenv

# Определяем путь к .env
env_path = Path(__file__).parent / '.env'
print(f"Loading .env from: {env_path}", file=sys.stderr)
print(f".env exists: {env_path.exists()}", file=sys.stderr)

# Загружаем с override=True чтобы перезаписать существующие переменные
load_dotenv(env_path, override=True)

# Дебаг: показываем что загрузили
print(f"DATABASE_URL: {os.environ.get('DATABASE_URL', 'NOT SET')[:50]}...", file=sys.stderr)

from flask import Flask, redirect, url_for, request
from flask_admin import Admin, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_basicauth import BasicAuth
from sqlalchemy import create_engine, MetaData, text
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.ext.automap import automap_base
from functools import wraps

# ============================================
# КОНФИГУРАЦИЯ
# ============================================

DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/mindful_journal')
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'mindful123')
SECRET_KEY = os.environ.get('SECRET_KEY', 'super-secret-key-change-in-prod')

print(f"Using DATABASE_URL: {DATABASE_URL[:50]}...", file=sys.stderr)

# ============================================
# FLASK APP
# ============================================

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config['BASIC_AUTH_USERNAME'] = ADMIN_USERNAME
app.config['BASIC_AUTH_PASSWORD'] = ADMIN_PASSWORD
app.config['BASIC_AUTH_FORCE'] = True  # Требовать авторизацию везде

basic_auth = BasicAuth(app)

# ============================================
# DATABASE (AUTOMAP)
# ============================================

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Рефлексия схемы 'app' (там живут таблицы Prisma)
metadata = MetaData(schema='app')
metadata.reflect(bind=engine)

# Automap — SQLAlchemy строит классы из существующих таблиц
Base = automap_base(metadata=metadata)
Base.prepare()

# Создаём сессию
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)

# ============================================
# ПОЛУЧАЕМ МОДЕЛИ (имена таблиц из Prisma schema)
# ============================================

# Prisma использует snake_case для таблиц (@@map)
User = Base.classes.users
JournalEntry = Base.classes.journal_entries
Broadcast = Base.classes.broadcasts
Transaction = Base.classes.transactions
Subscription = Base.classes.subscriptions
UsageLog = Base.classes.usage_logs
AppSetting = Base.classes.app_settings

# ============================================
# КАСТОМНЫЕ VIEW
# ============================================

class SecureModelView(ModelView):
    """Базовый view с настройками"""
    page_size = 50
    can_export = True
    can_view_details = True
    column_display_pk = True
    
    def is_accessible(self):
        return True  # BasicAuth уже проверяет


class UserView(SecureModelView):
    """Пользователи"""
    column_list = ['telegram_id', 'username', 'first_name', 'subscription_tier', 'status', 'is_admin', 'date_created']
    column_searchable_list = ['username', 'first_name', 'telegram_id']
    column_filters = ['subscription_tier', 'status', 'is_admin', 'reminder_enabled']
    column_sortable_list = ['date_created', 'subscription_tier', 'total_entries_count']
    column_default_sort = ('date_created', True)
    
    # Запрещаем удаление пользователей
    can_delete = False
    
    form_excluded_columns = ['journal_entries', 'transactions', 'subscriptions', 'usage_logs']


class JournalEntryView(SecureModelView):
    """Записи дневника"""
    column_list = ['id', 'user_id', 'mood_score', 'mood_label', 'is_voice', 'is_processed', 'date_created']
    column_filters = ['mood_score', 'is_voice', 'is_processed', 'mood_label']
    column_default_sort = ('date_created', True)
    
    # Только просмотр, без редактирования
    can_create = False
    can_edit = False
    can_delete = False


class BroadcastView(SecureModelView):
    """Рассылки"""
    column_list = ['title', 'target_audience', 'status', 'sent_count', 'failed_count', 'scheduled_at', 'date_created']
    column_filters = ['status', 'target_audience']
    column_default_sort = ('date_created', True)
    
    form_excluded_columns = ['started_at', 'completed_at', 'sent_count', 'failed_count', 'total_recipients', 'last_error']
    
    # Textarea для текста сообщения
    form_widget_args = {
        'message_text': {'rows': 10},
        'message_photo_url': {'placeholder': 'https://... или Telegram file_id'},
    }


class TransactionView(SecureModelView):
    """Транзакции (только просмотр)"""
    column_list = ['id', 'user_id', 'transaction_type', 'amount_stars', 'amount_usd', 'is_successful', 'date_created']
    column_filters = ['transaction_type', 'is_successful']
    column_default_sort = ('date_created', True)
    
    can_create = False
    can_edit = False
    can_delete = False


class SubscriptionView(SecureModelView):
    """Подписки"""
    column_list = ['id', 'user_id', 'tier', 'starts_at', 'expires_at', 'is_active', 'price_stars']
    column_filters = ['tier', 'is_active']
    column_default_sort = ('date_created', True)
    
    can_create = False


class UsageLogView(SecureModelView):
    """Логи использования AI"""
    column_list = ['id', 'user_id', 'service_type', 'model_name', 'input_tokens', 'output_tokens', 'cost_usd', 'date_created']
    column_filters = ['service_type', 'model_name']
    column_default_sort = ('date_created', True)
    
    can_create = False
    can_edit = False
    can_delete = False


class AppSettingView(SecureModelView):
    """Настройки приложения"""
    column_list = ['key', 'value', 'description', 'date_updated']
    column_searchable_list = ['key', 'description']
    column_default_sort = 'key'


class DashboardView(AdminIndexView):
    """Главная страница с статистикой"""
    
    @expose('/')
    def index(self):
        session = Session()
        try:
            # Быстрая статистика
            stats = {}
            stats['total_users'] = session.execute(text('SELECT COUNT(*) FROM app.users')).scalar()
            stats['active_users'] = session.execute(text("SELECT COUNT(*) FROM app.users WHERE status = 'active'")).scalar()
            stats['premium_users'] = session.execute(text("SELECT COUNT(*) FROM app.users WHERE subscription_tier != 'free'")).scalar()
            stats['total_entries'] = session.execute(text('SELECT COUNT(*) FROM app.journal_entries')).scalar()
            stats['entries_today'] = session.execute(text("SELECT COUNT(*) FROM app.journal_entries WHERE date_created >= CURRENT_DATE")).scalar()
            stats['total_revenue_usd'] = session.execute(text("SELECT COALESCE(SUM(amount_usd), 0) FROM app.transactions WHERE is_successful = true")).scalar()
            
            return self.render('admin/dashboard.html', stats=stats)
        finally:
            session.close()


# ============================================
# FLASK-ADMIN
# ============================================

admin = Admin(
    app,
    name='Mindful AI',
    template_mode='bootstrap4',
    index_view=DashboardView(),
    base_template='admin/master.html'
)

# Регистрируем модели
admin.add_view(UserView(User, Session, name='Пользователи', category='Данные'))
admin.add_view(JournalEntryView(JournalEntry, Session, name='Записи', category='Данные'))
admin.add_view(BroadcastView(Broadcast, Session, name='Рассылки', category='Маркетинг'))
admin.add_view(TransactionView(Transaction, Session, name='Транзакции', category='Финансы'))
admin.add_view(SubscriptionView(Subscription, Session, name='Подписки', category='Финансы'))
admin.add_view(UsageLogView(UsageLog, Session, name='AI Логи', category='Аналитика'))
admin.add_view(AppSettingView(AppSetting, Session, name='Настройки', category='Система'))

# ============================================
# TEARDOWN
# ============================================

@app.teardown_appcontext
def shutdown_session(exception=None):
    Session.remove()


# ============================================
# RUN
# ============================================

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
