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
from django.shortcuts import render, redirect
from django.contrib import messages
from django.db.models import Sum

from .dashboard import get_dashboard_data, get_date_range
from .models import Transaction, User, Broadcast


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


@staff_member_required
def broadcast_launch(request, broadcast_id: str):
    """
    Запускает рассылку через Celery.
    """
    from .tasks import execute_broadcast
    
    try:
        broadcast = Broadcast.objects.get(id=broadcast_id)
        
        if broadcast.status in ('draft', 'scheduled', 'failed'):
            # Обновляем статус и запускаем
            Broadcast.objects.filter(id=broadcast.id).update(status='scheduled')
            execute_broadcast.delay(str(broadcast.id))
            messages.success(request, f'🚀 Рассылка "{broadcast.title}" запущена!')
        elif broadcast.status == 'sending':
            messages.warning(request, f'⏳ Рассылка "{broadcast.title}" уже выполняется!')
        else:
            messages.info(request, f'✅ Рассылка "{broadcast.title}" уже завершена.')
            
    except Broadcast.DoesNotExist:
        messages.error(request, 'Рассылка не найдена!')
    
    return redirect('/admin/broadcasts/')


# ============================================
# BROADCASTS PAGE - Полноценная страница рассылок
# ============================================

@staff_member_required
def broadcasts_page(request):
    """Главная страница рассылок."""
    broadcasts = Broadcast.objects.all().order_by('-date_created')
    
    # Статистика (sending = в процессе в enum PostgreSQL)
    stats = {
        'total': broadcasts.count(),
        'total_sent': broadcasts.aggregate(s=Sum('sent_count'))['s'] or 0,
        'total_failed': broadcasts.aggregate(f=Sum('failed_count'))['f'] or 0,
        'in_progress': broadcasts.filter(status='sending').count(),
    }
    
    return render(request, 'admin/broadcasts.html', {
        'broadcasts': broadcasts,
        'stats': stats,
        'title': 'Рассылки',
    })


@staff_member_required
def broadcasts_api_list(request):
    """API: Список рассылок."""
    broadcasts = Broadcast.objects.all().order_by('-date_created')
    
    stats = {
        'total': broadcasts.count(),
        'total_sent': broadcasts.aggregate(s=Sum('sent_count'))['s'] or 0,
        'total_failed': broadcasts.aggregate(f=Sum('failed_count'))['f'] or 0,
        'in_progress': broadcasts.filter(status='sending').count(),
    }
    
    broadcasts_data = [{
        'id': str(b.id),
        'title': b.title,
        'status': b.status,
        'target_audience': b.target_audience,
        'sent_count': b.sent_count,
        'failed_count': b.failed_count,
        'total_recipients': b.total_recipients,
        'date_created': b.date_created.isoformat() if b.date_created else None,
    } for b in broadcasts]
    
    return JsonResponse({
        'broadcasts': broadcasts_data,
        'stats': stats,
    })


@staff_member_required
def broadcasts_api_create(request):
    """API: Создание рассылки."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    title = request.POST.get('title', '').strip()
    message_text = request.POST.get('message_text', '').strip()
    message_photo_url = request.POST.get('message_photo_url', '').strip() or None
    target_audience = request.POST.get('target_audience', 'all')
    scheduled_at_str = request.POST.get('scheduled_at', '').strip()
    
    if not title or not message_text:
        return JsonResponse({'error': 'Заполните название и текст'}, status=400)
    
    # Парсим дату если указана
    scheduled_at = None
    status = 'draft'
    if scheduled_at_str:
        try:
            from datetime import datetime
            scheduled_at = timezone.make_aware(datetime.fromisoformat(scheduled_at_str))
            status = 'scheduled'
        except ValueError:
            pass
    
    broadcast = Broadcast.objects.create(
        title=title,
        message_text=message_text,
        message_photo_url=message_photo_url,
        target_audience=target_audience,
        scheduled_at=scheduled_at,
        status=status,
    )
    
    return JsonResponse({
        'success': True,
        'id': str(broadcast.id),
    })


@staff_member_required
def broadcasts_api_launch(request, broadcast_id: str):
    """API: Запуск рассылки."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    from .tasks import execute_broadcast
    
    try:
        broadcast = Broadcast.objects.get(id=broadcast_id)
        
        if broadcast.status in ('draft', 'scheduled', 'failed'):
            Broadcast.objects.filter(id=broadcast.id).update(status='scheduled')
            execute_broadcast.delay(str(broadcast.id))
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'error': 'Рассылка уже запущена или завершена'}, status=400)
            
    except Broadcast.DoesNotExist:
        return JsonResponse({'error': 'Рассылка не найдена'}, status=404)


@staff_member_required
def broadcasts_api_delete(request, broadcast_id: str):
    """API: Удаление рассылки."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    try:
        broadcast = Broadcast.objects.get(id=broadcast_id)
        
        # Можно удалить любую кроме той что сейчас отправляется
        if broadcast.status != 'sending':
            broadcast.delete()
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'error': 'Нельзя удалить рассылку в процессе отправки'}, status=400)
            
    except Broadcast.DoesNotExist:
        return JsonResponse({'error': 'Рассылка не найдена'}, status=404)


@staff_member_required
def broadcasts_api_upload_image(request):
    """API: Загрузка изображения для рассылки."""
    import os
    import uuid
    from django.conf import settings
    
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    if 'image' not in request.FILES:
        return JsonResponse({'error': 'Файл не найден'}, status=400)
    
    image = request.FILES['image']
    
    # Проверяем тип файла
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if image.content_type not in allowed_types:
        return JsonResponse({'error': 'Неподдерживаемый формат. Используйте JPG, PNG, GIF или WebP'}, status=400)
    
    # Проверяем размер (макс 10MB)
    if image.size > 10 * 1024 * 1024:
        return JsonResponse({'error': 'Файл слишком большой (макс. 10MB)'}, status=400)
    
    # Генерируем уникальное имя
    ext = os.path.splitext(image.name)[1].lower()
    filename = f"broadcasts/{uuid.uuid4()}{ext}"
    
    # Создаём директорию если нет
    upload_dir = settings.MEDIA_ROOT / 'broadcasts'
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Сохраняем файл
    filepath = settings.MEDIA_ROOT / filename
    with open(filepath, 'wb+') as f:
        for chunk in image.chunks():
            f.write(chunk)
    
    # Возвращаем полный URL (для Telegram нужен абсолютный URL)
    site_url = getattr(settings, 'SITE_URL', 'https://dj.grammvpn.ru')
    image_url = f"{site_url}{settings.MEDIA_URL}{filename}"
    
    return JsonResponse({
        'success': True,
        'url': image_url,
    })
