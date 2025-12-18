#!/usr/bin/env python
import os
import sys
sys.path.insert(0, '/var/www/mindful-journal/admin_panel')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'admin_panel.settings')
import django
django.setup()
from django.db import connection
c = connection.cursor()

# Check broadcasts table structure
c.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'broadcasts' ORDER BY ordinal_position")
print('Broadcasts table columns:')
for row in c.fetchall():
    print(f'  {row[0]}: {row[1]} (nullable: {row[2]})')
