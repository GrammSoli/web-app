"""
URL configuration for admin_panel project.
"""
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
    # Можно добавить path('', lambda r: redirect('/admin/')) для редиректа с главной
]
