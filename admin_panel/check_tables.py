#!/usr/bin/env python
import os
import sys
sys.path.insert(0, '/var/www/mindful-journal/admin_panel')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'admin_panel.settings')
import django
django.setup()
from django.db import connection
c = connection.cursor()
c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'app'")
print('Tables in app schema:', c.fetchall())
