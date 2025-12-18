"""
URL configuration for admin_panel project.
"""
from django.contrib import admin
from django.urls import path
from django.shortcuts import redirect

from core.views import DashboardView, dashboard_api, broadcast_progress_api, broadcast_create, broadcast_launch

urlpatterns = [
    # Dashboard и кастомные views должны быть ДО admin.site.urls!
    path('admin/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('admin/core/broadcast/add/', broadcast_create, name='broadcast_create'),
    path('admin/core/broadcast/<str:broadcast_id>/launch/', broadcast_launch, name='admin:broadcast_launch'),
    path('api/dashboard/', dashboard_api, name='dashboard_api'),
    path('api/broadcast/<str:broadcast_id>/progress/', broadcast_progress_api, name='broadcast_progress'),
    path('admin/', admin.site.urls),
    path('', lambda r: redirect('/admin/')),
]
