#!/usr/bin/env python
import os
import sys
sys.path.insert(0, '/var/www/mindful-journal/admin_panel')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'admin_panel.settings')
import django
django.setup()

from core.models import Broadcast

# Попробуем создать запись напрямую
try:
    b = Broadcast(title='Test Broadcast', message_text='Test message', status='draft', target_audience='all')
    b.save()
    print(f'SUCCESS: Created broadcast with ID: {b.id}')
except Exception as e:
    print(f'ERROR: {type(e).__name__}: {e}')
