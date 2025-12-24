"""
Аналитический дашборд для Django Admin.
Содержит метрики: Пульс, Деньги, Удержание.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from django.db import connection
from django.db.models import Count, Sum, Avg, F
from django.db.models.functions import TruncDate
from django.utils import timezone

from .models import User, JournalEntry, Transaction, Subscription, UsageLog


def get_date_range(period: str = 'today', start_date=None, end_date=None):
    """Получить диапазон дат по периоду."""
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if period == 'today':
        return today, now
    elif period == 'yesterday':
        yesterday = today - timedelta(days=1)
        return yesterday, today
    elif period == 'week':
        week_ago = today - timedelta(days=7)
        return week_ago, now
    elif period == 'month':
        month_ago = today - timedelta(days=30)
        return month_ago, now
    elif period == 'custom' and start_date and end_date:
        # Добавляем +1 день к end_date, чтобы включить весь конечный день
        # start_date = 2025-12-15 00:00:00, end_date = 2025-12-16 00:00:00
        end_date_inclusive = end_date + timedelta(days=1)
        return start_date, end_date_inclusive
    else:
        return today, now


# ============================================================================
# БЛОК 1: ПУЛЬС (Жив ли пациент?) 💓
# ============================================================================

def get_dau(start_date, end_date):
    """
    DAU (Daily Active Users) - уникальные пользователи, сделавшие запись.
    """
    return JournalEntry.objects.filter(
        date_created__gte=start_date,
        date_created__lt=end_date
    ).values('user_id').distinct().count()


def get_entries_count(start_date, end_date):
    """
    Количество записей за период.
    """
    return JournalEntry.objects.filter(
        date_created__gte=start_date,
        date_created__lt=end_date
    ).count()


def get_voice_entries_count(start_date, end_date):
    """
    Количество голосовых записей за период.
    """
    return JournalEntry.objects.filter(
        date_created__gte=start_date,
        date_created__lt=end_date,
        is_voice=True
    ).count()


def get_new_signups(start_date, end_date):
    """
    Новые пользователи за период.
    """
    return User.objects.filter(
        date_created__gte=start_date,
        date_created__lt=end_date
    ).count()


def get_entries_per_user(start_date, end_date):
    """
    Среднее количество записей на активного пользователя.
    """
    dau = get_dau(start_date, end_date)
    entries = get_entries_count(start_date, end_date)
    if dau > 0:
        return round(entries / dau, 2)
    return 0


# ============================================================================
# БЛОК 2: ДЕНЬГИ (Хватает ли на еду?) 💸
# ============================================================================

def get_mrr():
    """
    MRR (Monthly Recurring Revenue) - доход от активных подписок.
    """
    now = timezone.now()
    active_subs = Subscription.objects.filter(
        is_active=True,
        expires_at__gt=now
    ).aggregate(
        total_usd=Sum('price_usd'),
        total_stars=Sum('price_stars'),
        count=Count('id')
    )
    
    return {
        'usd': float(active_subs['total_usd'] or 0),
        'stars': active_subs['total_stars'] or 0,
        'subscribers': active_subs['count'] or 0
    }


def get_revenue(start_date, end_date):
    """
    Доход за период (успешные транзакции).
    """
    revenue = Transaction.objects.filter(
        date_created__gte=start_date,
        date_created__lt=end_date,
        is_successful=True
    ).aggregate(
        total_usd=Sum('amount_usd'),
        total_stars=Sum('amount_stars'),
        count=Count('id')
    )
    
    return {
        'usd': float(revenue['total_usd'] or 0),
        'stars': revenue['total_stars'] or 0,
        'transactions': revenue['count'] or 0
    }


def get_conversion_rate(days=30):
    """
    Конверсия в покупку за последние N дней.
    (Количество купивших / Количество новых пользователей) * 100%
    """
    now = timezone.now()
    start = now - timedelta(days=days)
    
    new_users = User.objects.filter(date_created__gte=start).count()
    
    # Пользователи, которые совершили успешную транзакцию
    paying_users = Transaction.objects.filter(
        date_created__gte=start,
        is_successful=True
    ).values('user_id').distinct().count()
    
    if new_users > 0:
        return round((paying_users / new_users) * 100, 2)
    return 0


def get_ai_costs(start_date, end_date):
    """
    Расходы на AI за период.
    """
    costs = UsageLog.objects.filter(
        date_created__gte=start_date,
        date_created__lt=end_date
    ).aggregate(
        total_cost=Sum('cost_usd'),
        total_requests=Count('id'),
        total_tokens=Sum(F('input_tokens') + F('output_tokens'))
    )
    
    return {
        'cost_usd': float(costs['total_cost'] or 0),
        'requests': costs['total_requests'] or 0,
        'tokens': costs['total_tokens'] or 0
    }


def get_unit_economics(days=30):
    """
    Unit Economics - маржа на пользователя.
    (Средний доход с юзера) - (Средние расходы на AI для юзера)
    """
    now = timezone.now()
    start = now - timedelta(days=days)
    
    # Считаем активных платящих пользователей
    paying_users = Transaction.objects.filter(
        date_created__gte=start,
        is_successful=True
    ).values('user_id').distinct().count()
    
    if paying_users == 0:
        return {'arpu': 0, 'cost_per_user': 0, 'margin': 0, 'status': 'no_data'}
    
    # Средний доход на платящего пользователя (ARPU)
    revenue = Transaction.objects.filter(
        date_created__gte=start,
        is_successful=True
    ).aggregate(total=Sum('amount_usd'))
    arpu = float(revenue['total'] or 0) / paying_users
    
    # Средние расходы на AI на пользователя
    ai_costs = UsageLog.objects.filter(
        date_created__gte=start
    ).aggregate(total=Sum('cost_usd'))
    
    active_users = User.objects.filter(
        entries__date_created__gte=start
    ).distinct().count()
    
    cost_per_user = 0
    if active_users > 0:
        cost_per_user = float(ai_costs['total'] or 0) / active_users
    
    margin = arpu - cost_per_user
    
    status = 'positive' if margin > 0 else 'negative'
    
    return {
        'arpu': round(arpu, 4),
        'cost_per_user': round(cost_per_user, 4),
        'margin': round(margin, 4),
        'status': status
    }


# ============================================================================
# БЛОК 3: УДЕРЖАНИЕ (Дырявое ли ведро?) 🪣
# ============================================================================

def get_retention_day_n(day_n: int):
    """
    Retention Day N - процент пользователей, вернувшихся на N-й день.
    
    Логика:
    - Day 1: Зарегистрировались позавчера → вернулись вчера
    - Day 7: Зарегистрировались 8 дней назад → вернулись вчера
    - Day 30: Зарегистрировались 31 день назад → вернулись вчера
    
    Используем SQL для производительности.
    """
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Когорта: зарегистрировались (day_n + 1) дней назад
    # Для Day 1: позавчера (2 дня назад)
    # Для Day 7: 8 дней назад
    cohort_day = today - timedelta(days=day_n + 1)
    cohort_next_day = cohort_day + timedelta(days=1)
    
    # День возврата: N дней после регистрации
    return_day = cohort_day + timedelta(days=day_n)
    return_next_day = return_day + timedelta(days=1)
    
    # Если день возврата еще не наступил - нет данных
    if return_next_day > now:
        return {'rate': 0, 'cohort_size': 0, 'returned': 0, 'no_data': True}
    
    # Пользователи из когорты
    cohort_users = User.objects.filter(
        date_created__gte=cohort_day,
        date_created__lt=cohort_next_day
    )
    
    cohort_count = cohort_users.count()
    if cohort_count == 0:
        return {'rate': 0, 'cohort_size': 0, 'returned': 0}
    
    # Считаем вернувшихся одним запросом
    cohort_user_ids = list(cohort_users.values_list('id', flat=True))
    
    returned = JournalEntry.objects.filter(
        user_id__in=cohort_user_ids,
        date_created__gte=return_day,
        date_created__lt=return_next_day
    ).values('user_id').distinct().count()
    
    rate = round((returned / cohort_count) * 100, 1)
    
    return {
        'rate': rate,
        'cohort_size': cohort_count,
        'returned': returned
    }


def get_retention_day_1():
    """Retention Day 1."""
    return get_retention_day_n(1)


def get_retention_day_7():
    """Retention Day 7."""
    return get_retention_day_n(7)


def get_retention_day_30():
    """Retention Day 30."""
    return get_retention_day_n(30)


# ============================================================================
# ГРАФИКИ
# ============================================================================

def get_users_chart_data(days=14):
    """
    Данные для графика: Новые юзеры vs Активные юзеры.
    """
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    labels = []
    new_users_data = []
    active_users_data = []
    
    for i in range(days - 1, -1, -1):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        
        labels.append(day_start.strftime('%d.%m'))
        
        # Новые пользователи
        new_count = User.objects.filter(
            date_created__gte=day_start,
            date_created__lt=day_end
        ).count()
        new_users_data.append(new_count)
        
        # Активные пользователи (сделавшие запись)
        active_count = JournalEntry.objects.filter(
            date_created__gte=day_start,
            date_created__lt=day_end
        ).values('user_id').distinct().count()
        active_users_data.append(active_count)
    
    return {
        'labels': labels,
        'datasets': [
            {
                'label': 'Новые пользователи',
                'data': new_users_data,
                'borderColor': '#8B5CF6',
                'backgroundColor': 'rgba(139, 92, 246, 0.1)',
            },
            {
                'label': 'Активные пользователи',
                'data': active_users_data,
                'borderColor': '#10B981',
                'backgroundColor': 'rgba(16, 185, 129, 0.1)',
            }
        ]
    }


def get_revenue_chart_data(days=14):
    """
    Данные для графика: Доход по дням.
    """
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    labels = []
    revenue_data = []
    
    for i in range(days - 1, -1, -1):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        
        labels.append(day_start.strftime('%d.%m'))
        
        revenue = Transaction.objects.filter(
            date_created__gte=day_start,
            date_created__lt=day_end,
            is_successful=True
        ).aggregate(total=Sum('amount_usd'))
        
        revenue_data.append(float(revenue['total'] or 0))
    
    return {
        'labels': labels,
        'datasets': [
            {
                'label': 'Доход ($)',
                'data': revenue_data,
                'borderColor': '#F59E0B',
                'backgroundColor': 'rgba(245, 158, 11, 0.1)',
                'fill': True,
            }
        ]
    }


def get_entries_chart_data(days=14):
    """
    Данные для графика: Записи по дням (текст vs голос).
    """
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    labels = []
    text_data = []
    voice_data = []
    
    for i in range(days - 1, -1, -1):
        day_start = today - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        
        labels.append(day_start.strftime('%d.%m'))
        
        text_count = JournalEntry.objects.filter(
            date_created__gte=day_start,
            date_created__lt=day_end,
            is_voice=False
        ).count()
        text_data.append(text_count)
        
        voice_count = JournalEntry.objects.filter(
            date_created__gte=day_start,
            date_created__lt=day_end,
            is_voice=True
        ).count()
        voice_data.append(voice_count)
    
    return {
        'labels': labels,
        'datasets': [
            {
                'label': 'Текстовые',
                'data': text_data,
                'borderColor': '#3B82F6',
                'backgroundColor': 'rgba(59, 130, 246, 0.5)',
            },
            {
                'label': 'Голосовые',
                'data': voice_data,
                'borderColor': '#EC4899',
                'backgroundColor': 'rgba(236, 72, 153, 0.5)',
            }
        ]
    }


# ============================================================================
# ВОРОНКА КОНВЕРСИИ
# ============================================================================

def get_conversion_funnel(days=30):
    """
    Воронка конверсии за последние N дней.
    Этапы: Зарегистрировались → 1 запись → 5 записей → Купили подписку
    """
    from django.db.models import Count
    
    now = timezone.now()
    start = now - timedelta(days=days)
    
    # Все пользователи за период
    users = User.objects.filter(date_created__gte=start)
    total_registered = users.count()
    
    if total_registered == 0:
        return {
            'stages': [
                {'name': 'Зарегистрировались', 'count': 0, 'percent': 100},
                {'name': '1+ запись', 'count': 0, 'percent': 0},
                {'name': '5+ записей', 'count': 0, 'percent': 0},
                {'name': 'Купили подписку', 'count': 0, 'percent': 0},
            ],
            'period_days': days
        }
    
    # Пользователи с 1+ записью
    users_with_entries = users.annotate(
        entries_count=Count('entries')
    ).filter(entries_count__gte=1).count()
    
    # Пользователи с 5+ записями
    users_with_5_entries = users.annotate(
        entries_count=Count('entries')
    ).filter(entries_count__gte=5).count()
    
    # Пользователи, купившие подписку (есть успешная транзакция)
    users_paid = Transaction.objects.filter(
        user__date_created__gte=start,
        is_successful=True
    ).values('user_id').distinct().count()
    
    return {
        'stages': [
            {
                'name': 'Зарегистрировались',
                'count': total_registered,
                'percent': 100,
            },
            {
                'name': '1+ запись',
                'count': users_with_entries,
                'percent': round(users_with_entries / total_registered * 100, 1) if total_registered > 0 else 0,
            },
            {
                'name': '5+ записей',
                'count': users_with_5_entries,
                'percent': round(users_with_5_entries / total_registered * 100, 1) if total_registered > 0 else 0,
            },
            {
                'name': 'Купили подписку',
                'count': users_paid,
                'percent': round(users_paid / total_registered * 100, 1) if total_registered > 0 else 0,
            },
        ],
        'period_days': days
    }


# ============================================================================
# СВОДНЫЙ ДАШБОРД
# ============================================================================

def get_dashboard_data(period='today', start_date=None, end_date=None):
    """
    Получить все данные для дашборда.
    """
    date_start, date_end = get_date_range(period, start_date, end_date)
    
    # Для сравнения берём предыдущий период той же длительности
    period_length = (date_end - date_start).days or 1
    prev_start = date_start - timedelta(days=period_length)
    prev_end = date_start
    
    # Текущие метрики
    current_dau = get_dau(date_start, date_end)
    current_entries = get_entries_count(date_start, date_end)
    current_signups = get_new_signups(date_start, date_end)
    
    # Предыдущие метрики для сравнения
    prev_dau = get_dau(prev_start, prev_end)
    prev_entries = get_entries_count(prev_start, prev_end)
    prev_signups = get_new_signups(prev_start, prev_end)
    
    def calc_change(current, previous):
        if previous == 0:
            return 100 if current > 0 else 0
        return round(((current - previous) / previous) * 100, 1)
    
    return {
        # Блок 1: Пульс
        'pulse': {
            'dau': {
                'value': current_dau,
                'change': calc_change(current_dau, prev_dau),
                'prev': prev_dau,
            },
            'entries': {
                'value': current_entries,
                'change': calc_change(current_entries, prev_entries),
                'prev': prev_entries,
                'voice': get_voice_entries_count(date_start, date_end),
            },
            'signups': {
                'value': current_signups,
                'change': calc_change(current_signups, prev_signups),
                'prev': prev_signups,
            },
            'entries_per_user': get_entries_per_user(date_start, date_end),
        },
        
        # Блок 2: Деньги
        'money': {
            'mrr': get_mrr(),
            'revenue': get_revenue(date_start, date_end),
            'conversion': get_conversion_rate(30),
            'unit_economics': get_unit_economics(30),
            'ai_costs': get_ai_costs(date_start, date_end),
        },
        
        # Блок 3: Удержание
        'retention': {
            'day_1': get_retention_day_1(),
            'day_7': get_retention_day_7(),
            'day_30': get_retention_day_30(),
        },
        
        # Блок 4: Воронка конверсии
        'funnel': get_conversion_funnel(30),
        
        # Графики
        'charts': {
            'users': get_users_chart_data(14),
            'revenue': get_revenue_chart_data(14),
            'entries': get_entries_chart_data(14),
        },
        
        # Метаданные
        'meta': {
            'period': period,
            'start_date': date_start.isoformat(),
            'end_date': date_end.isoformat(),
            'generated_at': timezone.now().isoformat(),
        }
    }
