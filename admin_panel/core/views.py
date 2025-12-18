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


@staff_member_required
def broadcast_progress_api(request, broadcast_id: str):
    """
    API endpoint для получения прогресса рассылки в реальном времени.
    Данные кэшируются в Redis для быстрого доступа.
    
    Returns:
        {
            sent: int,
            failed: int,
            total: int,
            percent: float,
            status: str,
            updated_at: str
        }
    """
    from .tasks import get_broadcast_progress
    from .models import Broadcast
    
    # Сначала пробуем получить из Redis (быстро)
    progress = get_broadcast_progress(broadcast_id)
    
    if progress:
        return JsonResponse(progress)
    
    # Если нет в кэше, берём из БД
    try:
        broadcast = Broadcast.objects.get(id=broadcast_id)
        total = broadcast.total_recipients or 1
        return JsonResponse({
            'sent': broadcast.sent_count,
            'failed': broadcast.failed_count,
            'total': broadcast.total_recipients,
            'percent': round(broadcast.sent_count / total * 100, 1) if total > 0 else 0,
            'status': broadcast.status,
            'updated_at': broadcast.date_updated.isoformat() if broadcast.date_updated else None,
        })
    except Broadcast.DoesNotExist:
        return JsonResponse({'error': 'Broadcast not found'}, status=404)


@staff_member_required
def broadcast_create(request):
    """
    Кастомная страница создания рассылки.
    Обходит баг Unfold с UUID.
    """
    from django.shortcuts import render, redirect
    from django.contrib import messages
    from .models import Broadcast
    
    if request.method == 'POST':
        title = request.POST.get('title', '').strip()
        message_text = request.POST.get('message_text', '').strip()
        message_photo_url = request.POST.get('message_photo_url', '').strip() or None
        target_audience = request.POST.get('target_audience', 'all')
        status = request.POST.get('status', 'draft')
        
        if not title or not message_text:
            messages.error(request, 'Заполните название и текст сообщения!')
            return render(request, 'admin/broadcast_create.html', {
                'title': title,
                'message_text': message_text,
                'message_photo_url': message_photo_url,
                'target_audience': target_audience,
            })
        
        # Создаём рассылку
        broadcast = Broadcast(
            title=title,
            message_text=message_text,
            message_photo_url=message_photo_url,
            target_audience=target_audience,
            status=status,
        )
        broadcast.save()
        
        messages.success(request, f'Рассылка "{title}" создана!')
        return redirect('/admin/core/broadcast/')
    
    return render(request, 'admin/broadcast_create.html', {
        'title': 'Создать рассылку',
    })
