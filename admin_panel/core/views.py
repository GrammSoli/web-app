"""
Dashboard views для Django Admin с Unfold.
"""

import json
from datetime import datetime
from django.views.generic import TemplateView
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.http import JsonResponse
from django.utils import timezone

from .dashboard import get_dashboard_data, get_date_range
from .models import Transaction, User


@method_decorator(staff_member_required, name='dispatch')
class DashboardView(TemplateView):
    template_name = 'admin/dashboard.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Получаем период из GET параметров
        period = self.request.GET.get('period', 'today')
        start_date = self.request.GET.get('start_date')
        end_date = self.request.GET.get('end_date')
        
        # Парсим даты если custom
        parsed_start = None
        parsed_end = None
        if period == 'custom' and start_date and end_date:
            try:
                parsed_start = timezone.make_aware(datetime.strptime(start_date, '%Y-%m-%d'))
                parsed_end = timezone.make_aware(datetime.strptime(end_date, '%Y-%m-%d'))
            except ValueError:
                period = 'today'
        
        # Получаем данные дашборда
        dashboard_data = get_dashboard_data(period, parsed_start, parsed_end)
        
        # Последние транзакции
        recent_transactions = Transaction.objects.select_related('user').filter(
            is_successful=True
        ).order_by('-date_created')[:10]
        
        # Топ пользователей по записям
        from django.db.models import Count
        top_users = User.objects.annotate(
            entries_count=Count('entries')
        ).order_by('-entries_count')[:10]
        
        context.update({
            'dashboard': dashboard_data,
            'dashboard_json': json.dumps(dashboard_data, default=str),
            'recent_transactions': recent_transactions,
            'top_users': top_users,
            'current_period': period,
            'start_date': start_date or '',
            'end_date': end_date or '',
            'title': 'Аналитика',
        })
        
        return context


@staff_member_required
def dashboard_api(request):
    """API endpoint для получения данных дашборда."""
    period = request.GET.get('period', 'today')
    start_date = request.GET.get('start_date')
    end_date = request.GET.get('end_date')
    
    parsed_start = None
    parsed_end = None
    if period == 'custom' and start_date and end_date:
        try:
            parsed_start = timezone.make_aware(datetime.strptime(start_date, '%Y-%m-%d'))
            parsed_end = timezone.make_aware(datetime.strptime(end_date, '%Y-%m-%d'))
        except ValueError:
            period = 'today'
    
    data = get_dashboard_data(period, parsed_start, parsed_end)
    return JsonResponse(data)
