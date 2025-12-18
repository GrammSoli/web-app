"""
Celery Tasks для рассылок через Telegram.

Профессиональная реализация с:
- Rate limiting (25 msg/sec для соблюдения лимитов Telegram API)
- Кэширование прогресса в Redis
- Retry механизм для неудачных сообщений
- Подробные логи и отслеживание статуса
"""

import time
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from celery import shared_task, current_task
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

import httpx

logger = logging.getLogger(__name__)


# ============================================================================
# TELEGRAM API
# ============================================================================

class TelegramRateLimiter:
    """
    Rate limiter для Telegram API.
    
    Telegram лимиты:
    - 30 сообщений в секунду для ботов
    - 1 сообщение в секунду на chat для избежания flood control
    
    Используем 25/sec для безопасности.
    """
    
    CACHE_KEY = 'telegram_rate_limiter_tokens'
    
    def __init__(self, rate: int = 25, period: float = 1.0):
        self.rate = rate
        self.period = period
        self.lock_key = 'telegram_rate_limiter_lock'
    
    def acquire(self) -> float:
        """
        Получить разрешение на отправку.
        Возвращает время ожидания в секундах.
        """
        now = time.time()
        
        # Получаем историю отправок из Redis
        history_key = 'telegram_send_history'
        history = cache.get(history_key, [])
        
        # Очищаем старые записи (старше period)
        cutoff = now - self.period
        history = [t for t in history if t > cutoff]
        
        if len(history) >= self.rate:
            # Нужно подождать
            oldest = min(history)
            wait_time = oldest + self.period - now
            if wait_time > 0:
                time.sleep(wait_time)
        
        # Добавляем текущую отправку
        history.append(time.time())
        cache.set(history_key, history, timeout=10)
        
        return 0


async def send_telegram_message_async(
    client: httpx.AsyncClient,
    bot_token: str,
    chat_id: int,
    text: str,
    photo_url: Optional[str] = None,
    parse_mode: str = 'HTML'
) -> Dict[str, Any]:
    """
    Асинхронная отправка сообщения через Telegram Bot API.
    
    Returns:
        {success: bool, error: str | None, blocked: bool}
    """
    base_url = f"https://api.telegram.org/bot{bot_token}"
    
    try:
        if photo_url:
            # Отправка фото с подписью
            url = f"{base_url}/sendPhoto"
            payload = {
                "chat_id": chat_id,
                "photo": photo_url,
                "caption": text,
                "parse_mode": parse_mode,
            }
        else:
            # Отправка текста
            url = f"{base_url}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
        
        response = await client.post(url, json=payload, timeout=30.0)
        data = response.json()
        
        if response.status_code == 200 and data.get('ok'):
            return {'success': True, 'error': None, 'blocked': False}
        
        # Обработка ошибок Telegram
        error_code = data.get('error_code', 0)
        description = data.get('description', 'Unknown error')
        
        # 403 = бот заблокирован пользователем
        # 400 = chat not found (пользователь удалил аккаунт)
        blocked = error_code in (403, 400)
        
        # 429 = Too Many Requests (rate limit)
        if error_code == 429:
            retry_after = data.get('parameters', {}).get('retry_after', 30)
            logger.warning(f"Rate limit hit, waiting {retry_after}s")
            return {
                'success': False, 
                'error': f'Rate limit: wait {retry_after}s',
                'blocked': False,
                'retry_after': retry_after
            }
        
        return {
            'success': False,
            'error': description,
            'blocked': blocked
        }
        
    except httpx.TimeoutException:
        return {'success': False, 'error': 'Timeout', 'blocked': False}
    except Exception as e:
        logger.error(f"Error sending to {chat_id}: {e}")
        return {'success': False, 'error': str(e), 'blocked': False}


def send_telegram_message_sync(
    bot_token: str,
    chat_id: int,
    text: str,
    photo_url: Optional[str] = None,
    parse_mode: str = 'HTML'
) -> Dict[str, Any]:
    """
    Синхронная отправка сообщения через Telegram Bot API.
    """
    base_url = f"https://api.telegram.org/bot{bot_token}"
    
    try:
        if photo_url:
            url = f"{base_url}/sendPhoto"
            payload = {
                "chat_id": chat_id,
                "photo": photo_url,
                "caption": text,
                "parse_mode": parse_mode,
            }
        else:
            url = f"{base_url}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            }
        
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=payload)
            data = response.json()
        
        if response.status_code == 200 and data.get('ok'):
            return {'success': True, 'error': None, 'blocked': False}
        
        error_code = data.get('error_code', 0)
        description = data.get('description', 'Unknown error')
        blocked = error_code in (403, 400)
        
        if error_code == 429:
            retry_after = data.get('parameters', {}).get('retry_after', 30)
            return {
                'success': False,
                'error': f'Rate limit: wait {retry_after}s',
                'blocked': False,
                'retry_after': retry_after
            }
        
        return {'success': False, 'error': description, 'blocked': blocked}
        
    except Exception as e:
        logger.error(f"Error sending to {chat_id}: {e}")
        return {'success': False, 'error': str(e), 'blocked': False}


# ============================================================================
# CELERY TASKS
# ============================================================================

def get_broadcast_cache_key(broadcast_id: str) -> str:
    """Ключ кэша для прогресса рассылки."""
    return f'broadcast_progress:{broadcast_id}'


def update_broadcast_progress(broadcast_id: str, sent: int, failed: int, total: int, status: str = 'in_progress'):
    """Обновляет прогресс рассылки в Redis."""
    key = get_broadcast_cache_key(broadcast_id)
    cache.set(key, {
        'sent': sent,
        'failed': failed,
        'total': total,
        'status': status,
        'percent': round((sent + failed) / total * 100, 1) if total > 0 else 0,
        'updated_at': timezone.now().isoformat(),
    }, timeout=60 * 60 * 24)  # 24 часа


def get_broadcast_progress(broadcast_id: str) -> Optional[Dict]:
    """Получает прогресс рассылки из Redis."""
    return cache.get(get_broadcast_cache_key(broadcast_id))


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def execute_broadcast(self, broadcast_id: str) -> Dict[str, Any]:
    """
    Основная задача для выполнения рассылки.
    
    Особенности:
    - Rate limiting (25 msg/sec)
    - Прогресс сохраняется в Redis
    - Retry при ошибках
    - Обновление статуса в БД
    
    Args:
        broadcast_id: UUID рассылки из таблицы broadcasts
        
    Returns:
        {success: bool, sent: int, failed: int, blocked_users: list}
    """
    from core.models import Broadcast, User
    
    logger.info(f"Starting broadcast {broadcast_id}")
    
    try:
        broadcast = Broadcast.objects.get(id=broadcast_id)
    except Broadcast.DoesNotExist:
        logger.error(f"Broadcast {broadcast_id} not found")
        return {'success': False, 'error': 'Broadcast not found'}
    
    # Получаем токен бота
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        logger.error("TELEGRAM_BOT_TOKEN not configured")
        broadcast.status = 'failed'
        broadcast.last_error = 'TELEGRAM_BOT_TOKEN не настроен'
        # Используем update() для managed=False модели
        Broadcast.objects.filter(id=broadcast_id).update(
            status='failed',
            last_error='TELEGRAM_BOT_TOKEN не настроен'
        )
        return {'success': False, 'error': 'No bot token'}
    
    # Получаем список получателей
    users_query = User.objects.filter(status='active')
    
    # Фильтр по аудитории
    if broadcast.target_audience == 'premium':
        users_query = users_query.filter(subscription_tier__in=['premium', 'pro'])
    elif broadcast.target_audience == 'free':
        users_query = users_query.filter(subscription_tier__in=['free', None, ''])
    
    recipients = list(users_query.values_list('telegram_id', flat=True))
    total = len(recipients)
    
    if total == 0:
        Broadcast.objects.filter(id=broadcast_id).update(
            status='completed',
            total_recipients=0,
            sent_count=0,
            completed_at=timezone.now()
        )
        return {'success': True, 'sent': 0, 'failed': 0}
    
    # Обновляем статус в БД
    Broadcast.objects.filter(id=broadcast_id).update(
        status='in_progress',
        started_at=timezone.now(),
        total_recipients=total,
        sent_count=0,
        failed_count=0
    )
    
    # Rate limiter
    rate_limit = getattr(settings, 'TELEGRAM_RATE_LIMIT', 25)
    rate_limiter = TelegramRateLimiter(rate=rate_limit)
    
    sent_count = 0
    failed_count = 0
    blocked_users = []
    last_error = None
    
    # Обновляем прогресс каждые N сообщений
    progress_interval = max(1, total // 100)  # ~100 обновлений за рассылку
    
    for idx, telegram_id in enumerate(recipients):
        # Rate limiting
        rate_limiter.acquire()
        
        # Отправка сообщения
        result = send_telegram_message_sync(
            bot_token=bot_token,
            chat_id=telegram_id,
            text=broadcast.message_text,
            photo_url=broadcast.message_photo_url
        )
        
        if result['success']:
            sent_count += 1
        else:
            failed_count += 1
            last_error = result.get('error')
            
            if result.get('blocked'):
                blocked_users.append(telegram_id)
            
            # Обработка rate limit от Telegram
            if result.get('retry_after'):
                time.sleep(result['retry_after'])
        
        # Обновляем прогресс в Redis
        if idx % progress_interval == 0 or idx == total - 1:
            update_broadcast_progress(
                broadcast_id=str(broadcast_id),
                sent=sent_count,
                failed=failed_count,
                total=total
            )
            
            # Обновляем в БД каждые 10%
            if idx % (total // 10 + 1) == 0:
                Broadcast.objects.filter(id=broadcast_id).update(
                    sent_count=sent_count,
                    failed_count=failed_count
                )
    
    # Завершаем рассылку
    Broadcast.objects.filter(id=broadcast_id).update(
        status='completed',
        completed_at=timezone.now(),
        sent_count=sent_count,
        failed_count=failed_count,
        last_error=last_error
    )
    
    update_broadcast_progress(
        broadcast_id=str(broadcast_id),
        sent=sent_count,
        failed=failed_count,
        total=total,
        status='completed'
    )
    
    logger.info(f"Broadcast {broadcast_id} completed: {sent_count} sent, {failed_count} failed")
    
    return {
        'success': True,
        'sent': sent_count,
        'failed': failed_count,
        'blocked_users': blocked_users[:100],  # Первые 100 для логов
    }


@shared_task(bind=True)
def send_single_message(
    self,
    telegram_id: int,
    text: str,
    photo_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Отправка одного сообщения через очередь.
    
    Используется для:
    - Уведомлений
    - Приветственных сообщений
    - Одиночных отправок
    """
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        return {'success': False, 'error': 'No bot token'}
    
    return send_telegram_message_sync(
        bot_token=bot_token,
        chat_id=telegram_id,
        text=text,
        photo_url=photo_url
    )


@shared_task
def scheduled_broadcast_check():
    """
    Периодическая задача для запуска запланированных рассылок.
    Запускается через Celery Beat каждую минуту.
    """
    from core.models import Broadcast
    
    now = timezone.now()
    
    # Находим запланированные рассылки, которые пора запустить
    due_broadcasts = Broadcast.objects.filter(
        status='scheduled',
        scheduled_at__lte=now
    )
    
    for broadcast in due_broadcasts:
        logger.info(f"Starting scheduled broadcast: {broadcast.id}")
        execute_broadcast.delay(str(broadcast.id))
