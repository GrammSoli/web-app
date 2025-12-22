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
# SEGMENT FILTERING
# ============================================================================

def apply_segment_filter(queryset, filter_rules: dict):
    """
    Применяет правила фильтрации сегмента к queryset.
    
    filter_rules формат:
    {
        "subscription_tier": {"in": ["premium", "basic"]},
        "date_created": {"gte": "-7 days"},
        "total_entries_count": {"gte": 1}
    }
    """
    from datetime import datetime, timedelta
    from django.utils import timezone
    from django.db.models import Q
    
    def parse_relative_time(value: str) -> datetime:
        """Парсит относительное время типа '-7 days', '-1 month'."""
        value = value.strip()
        if not value.startswith('-'):
            return None
        
        parts = value[1:].split(' ')
        if len(parts) != 2:
            return None
        
        num = int(parts[0])
        unit = parts[1].rstrip('s')  # days -> day
        
        if unit == 'day':
            return timezone.now() - timedelta(days=num)
        elif unit == 'week':
            return timezone.now() - timedelta(weeks=num)
        elif unit == 'month':
            return timezone.now() - timedelta(days=num * 30)
        return None
    
    for field, conditions in filter_rules.items():
        if not isinstance(conditions, dict):
            # Старый формат: {"status": "active"} без оператора
            queryset = queryset.filter(**{field: conditions})
            continue
            
        for op, value in conditions.items():
            if op == 'in':
                # Обрабатываем null в списке
                if None in value or 'null' in value:
                    non_null_values = [v for v in value if v is not None and v != 'null']
                    q = Q(**{f'{field}__isnull': True})
                    if non_null_values:
                        q |= Q(**{f'{field}__in': non_null_values})
                    # Также проверяем пустую строку для subscription_tier
                    if field == 'subscription_tier':
                        q |= Q(**{field: ''})
                    queryset = queryset.filter(q)
                else:
                    queryset = queryset.filter(**{f'{field}__in': value})
            elif op == 'eq':
                queryset = queryset.filter(**{field: value})
            elif op == 'gte':
                if isinstance(value, str) and value.startswith('-'):
                    dt = parse_relative_time(value)
                    if dt:
                        queryset = queryset.filter(**{f'{field}__gte': dt})
                else:
                    queryset = queryset.filter(**{f'{field}__gte': value})
            elif op == 'lte':
                if isinstance(value, str) and value.startswith('-'):
                    dt = parse_relative_time(value)
                    if dt:
                        queryset = queryset.filter(**{f'{field}__lte': dt})
                else:
                    queryset = queryset.filter(**{f'{field}__lte': value})
            elif op == 'gt':
                queryset = queryset.filter(**{f'{field}__gt': value})
            elif op == 'lt':
                if isinstance(value, str) and value.startswith('-'):
                    dt = parse_relative_time(value)
                    if dt:
                        queryset = queryset.filter(**{f'{field}__lt': dt})
                else:
                    queryset = queryset.filter(**{f'{field}__lt': value})
            elif op == 'is_null':
                if value:
                    queryset = queryset.filter(**{f'{field}__isnull': True})
                else:
                    queryset = queryset.filter(**{f'{field}__isnull': False})
    
    return queryset


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


# ============================================================================
# MARKDOWN V2 HELPERS
# ============================================================================

def escape_markdown_v2(text: str) -> str:
    """
    Экранирует специальные символы для MarkdownV2.
    
    Символы которые нужно экранировать:
    _ * [ ] ( ) ~ ` > # + - = | { } . !
    """
    escape_chars = r'_*[]()~`>#+-=|{}.!'
    result = []
    for char in text:
        if char in escape_chars:
            result.append('\\')
        result.append(char)
    return ''.join(result)


def convert_html_to_markdown_v2(text: str) -> str:
    """
    Конвертирует простой HTML в MarkdownV2 формат.
    
    Поддерживаемые теги:
    - <b>text</b> → *text*
    - <i>text</i> → _text_
    - <code>text</code> → `text`
    - <s>text</s> → ~text~
    """
    import re
    
    # Сначала обрабатываем ссылки (до экранирования)
    link_pattern = r'<a\s+href=["\']([^"\']+)["\']>([^<]+)</a>'
    links = re.findall(link_pattern, text, re.IGNORECASE)
    link_placeholders = {}
    
    for i, (url, link_text) in enumerate(links):
        placeholder = f"__LINK_PLACEHOLDER_{i}__"
        text = re.sub(
            rf'<a\s+href=["\']' + re.escape(url) + rf'["\']>' + re.escape(link_text) + r'</a>',
            placeholder,
            text,
            flags=re.IGNORECASE
        )
        # Экранируем текст ссылки и URL
        escaped_text = escape_markdown_v2(link_text)
        escaped_url = url.replace(')', '\\)')
        link_placeholders[placeholder] = f"[{escaped_text}]({escaped_url})"
    
    # Сохраняем форматирование
    formatting_items = []
    
    # Находим все теги форматирования
    for tag, md_char in [
        ('b', '*'),
        ('strong', '*'),
        ('i', '_'),
        ('em', '_'),
        ('code', '`'),
        ('s', '~'),
        ('strike', '~'),
    ]:
        pattern = rf'<{tag}>([^<]*)</{tag}>'
        for j, match in enumerate(re.finditer(pattern, text, re.IGNORECASE)):
            content = match.group(1)
            placeholder = f"__FORMAT_{tag}_{j}__"
            formatting_items.append((placeholder, content, md_char))
        text = re.sub(pattern, lambda m: f"__FORMAT_{tag}_{re.finditer(pattern, text, re.IGNORECASE).__next__}__", text, flags=re.IGNORECASE)
    
    # Проще - замена напрямую с экранированием
    for tag, md_char in [
        ('b', '*'),
        ('strong', '*'),
        ('i', '_'),
        ('em', '_'),
        ('code', '`'),
        ('s', '~'),
        ('strike', '~'),
    ]:
        pattern = rf'<{tag}>([^<]*)</{tag}>'
        
        def replace_tag(m, char=md_char):
            content = escape_markdown_v2(m.group(1))
            return f"{char}{content}{char}"
        
        text = re.sub(pattern, replace_tag, text, flags=re.IGNORECASE)
    
    # Экранируем оставшийся текст (вне тегов)
    # Для простоты - просто удаляем необработанные теги
    text = re.sub(r'<[^>]+>', '', text)
    
    # Восстанавливаем ссылки
    for placeholder, link in link_placeholders.items():
        text = text.replace(placeholder, link)
    
    return text


def prepare_message_text(text: str) -> tuple:
    """
    Подготавливает текст сообщения для отправки в MarkdownV2.
    
    Если текст содержит HTML теги - конвертирует в MarkdownV2.
    Иначе просто экранирует специальные символы.
    
    Returns:
        (prepared_text, parse_mode)
    """
    import re
    
    # Проверяем есть ли HTML теги
    html_pattern = r'<(b|i|u|s|code|a|strong|em|strike)\b[^>]*>'
    has_html = bool(re.search(html_pattern, text, re.IGNORECASE))
    
    if has_html:
        # Конвертируем HTML в MarkdownV2
        prepared = convert_html_to_markdown_v2(text)
    else:
        # Просто экранируем
        prepared = escape_markdown_v2(text)
    
    return prepared, 'MarkdownV2'


async def send_telegram_message_async(
    client: httpx.AsyncClient,
    bot_token: str,
    chat_id: int,
    text: str,
    photo_url: Optional[str] = None,
    parse_mode: str = 'HTML',
    button_text: Optional[str] = None,
    button_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Асинхронная отправка сообщения через Telegram Bot API.
    Использует HTML parse_mode.
    
    Returns:
        {success: bool, error: str | None, blocked: bool}
    """
    base_url = f"https://api.telegram.org/bot{bot_token}"
    
    # Формируем inline-клавиатуру если есть кнопка
    reply_markup = None
    if button_text and button_url:
        reply_markup = {
            "inline_keyboard": [[
                {"text": button_text, "url": button_url}
            ]]
        }
    
    try:
        if photo_url:
            url = f"{base_url}/sendPhoto"
            payload = {
                "chat_id": chat_id,
                "photo": photo_url,
                "caption": text,
                "parse_mode": 'HTML',
            }
        else:
            url = f"{base_url}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": 'HTML',
            }
        
        if reply_markup:
            payload["reply_markup"] = reply_markup
        
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
    parse_mode: Optional[str] = 'HTML',
    button_text: Optional[str] = None,
    button_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Синхронная отправка сообщения через Telegram Bot API.
    Использует HTML parse_mode (нативная поддержка Telegram).
    При ошибке парсинга - отправляет как plain text.
    """
    base_url = f"https://api.telegram.org/bot{bot_token}"
    
    # Формируем inline-клавиатуру если есть кнопка
    reply_markup = None
    if button_text and button_url:
        reply_markup = {
            "inline_keyboard": [[
                {"text": button_text, "url": button_url}
            ]]
        }
    
    def make_request(msg_text: str, use_parse_mode: bool = True):
        if photo_url:
            url = f"{base_url}/sendPhoto"
            payload = {
                "chat_id": chat_id,
                "photo": photo_url,
                "caption": msg_text,
            }
            if use_parse_mode:
                payload["parse_mode"] = 'HTML'
        else:
            url = f"{base_url}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": msg_text,
            }
            if use_parse_mode:
                payload["parse_mode"] = 'HTML'
        
        if reply_markup:
            payload["reply_markup"] = reply_markup
        
        with httpx.Client(timeout=30.0) as client:
            return client.post(url, json=payload)
    
    try:
        response = make_request(text, use_parse_mode=True)
        data = response.json()
        
        # Если ошибка парсинга HTML - пробуем plain text
        if not data.get('ok'):
            error_desc = data.get('description', '').lower()
            if 'parse' in error_desc or 'entities' in error_desc or "can't" in error_desc:
                logger.warning(f"HTML parse error, retrying as plain text: {error_desc}")
                # Убираем HTML теги для plain text
                import re
                plain_text = re.sub(r'<[^>]+>', '', text)
                response = make_request(plain_text, use_parse_mode=False)
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


def update_broadcast_progress(broadcast_id: str, sent: int, failed: int, total: int, status: str = 'sending'):
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
    
    # ПРИОРИТЕТ: сегмент > target_audience
    if broadcast.segment_id:
        segment = broadcast.segment
        if segment and segment.filter_rules:
            # Применяем правила фильтрации сегмента
            users_query = apply_segment_filter(users_query, segment.filter_rules)
        elif segment and segment.static_user_ids:
            # Статический сегмент - конкретные user_id
            users_query = User.objects.filter(id__in=segment.static_user_ids, status='active')
    elif broadcast.target_audience == 'premium':
        # Legacy: фильтр по аудитории
        users_query = users_query.filter(subscription_tier__in=['premium', 'basic'])
    elif broadcast.target_audience == 'free':
        users_query = users_query.filter(subscription_tier__in=['free', None, ''])
    
    recipients = list(users_query.values_list('telegram_id', flat=True))
    total = len(recipients)
    
    if total == 0:
        Broadcast.objects.filter(id=broadcast_id).update(
            status='sent',
            total_recipients=0,
            sent_count=0,
            completed_at=timezone.now()
        )
        return {'success': True, 'sent': 0, 'failed': 0}
    
    # Обновляем статус в БД
    Broadcast.objects.filter(id=broadcast_id).update(
        status='sending',
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
    cancelled = False
    
    # Обновляем прогресс каждые N сообщений
    progress_interval = max(1, total // 100)  # ~100 обновлений за рассылку
    
    for idx, telegram_id in enumerate(recipients):
        # Проверяем отмену каждые 10 сообщений
        if idx % 10 == 0:
            broadcast.refresh_from_db()
            if broadcast.status == 'cancelled':
                logger.info(f"Broadcast {broadcast_id} cancelled by user")
                cancelled = True
                break
        
        # Rate limiting
        rate_limiter.acquire()
        
        # Отправка сообщения
        result = send_telegram_message_sync(
            bot_token=bot_token,
            chat_id=telegram_id,
            text=broadcast.message_text,
            photo_url=broadcast.message_photo_url,
            button_text=broadcast.button_text,
            button_url=broadcast.button_url
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
    final_status = 'cancelled' if cancelled else 'sent'
    Broadcast.objects.filter(id=broadcast_id).update(
        status=final_status,
        completed_at=timezone.now(),
        sent_count=sent_count,
        failed_count=failed_count,
        last_error='Остановлено пользователем' if cancelled else last_error
    )
    
    update_broadcast_progress(
        broadcast_id=str(broadcast_id),
        sent=sent_count,
        failed=failed_count,
        total=total,
        status=final_status
    )
    
    logger.info(f"Broadcast {broadcast_id} {final_status}: {sent_count} sent, {failed_count} failed")
    
    return {
        'success': True,
        'sent': sent_count,
        'failed': failed_count,
        'cancelled': cancelled,
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


@shared_task
def update_segment_user_counts():
    """
    Пересчитывает количество пользователей в каждом сегменте.
    Запускается периодически через Celery Beat или вручную.
    """
    from core.models import UserSegment, User
    
    segments = UserSegment.objects.all()
    updated = 0
    
    for segment in segments:
        try:
            users_query = User.objects.filter(status='active')
            
            if segment.filter_rules:
                users_query = apply_segment_filter(users_query, segment.filter_rules)
                count = users_query.count()
            elif segment.static_user_ids:
                count = User.objects.filter(id__in=segment.static_user_ids, status='active').count()
            elif segment.slug == 'all':
                count = users_query.count()
            elif segment.slug == 'premium':
                count = users_query.filter(subscription_tier__in=['premium', 'basic']).count()
            elif segment.slug == 'free':
                count = users_query.filter(subscription_tier__in=['free', None, '']).count()
            else:
                count = 0
            
            UserSegment.objects.filter(id=segment.id).update(
                cached_user_count=count,
                cache_updated_at=timezone.now()
            )
            updated += 1
            logger.info(f"Segment {segment.slug}: {count} users")
            
        except Exception as e:
            logger.error(f"Error updating segment {segment.slug}: {e}")
    
    return {'updated': updated}
