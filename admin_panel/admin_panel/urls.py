"""
URL configuration for admin_panel project.
"""
from django.contrib import admin
from django.urls import path
from django.shortcuts import redirect

from core.views import (
    DashboardView, 
    dashboard_api, 
    broadcast_progress_api,
    broadcasts_page,
    broadcasts_api_list,
    broadcasts_api_create,
    broadcasts_api_launch,
    broadcasts_api_delete,
)

urlpatterns = [
    # Dashboard
    path('admin/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('api/dashboard/', dashboard_api, name='dashboard_api'),
    
    # Broadcasts - отдельная страница
    path('admin/broadcasts/', broadcasts_page, name='broadcasts'),
    path('admin/broadcasts/api/list/', broadcasts_api_list, name='broadcasts_api_list'),
    path('admin/broadcasts/api/create/', broadcasts_api_create, name='broadcasts_api_create'),
    path('admin/broadcasts/api/<str:broadcast_id>/launch/', broadcasts_api_launch, name='broadcasts_api_launch'),
    path('admin/broadcasts/api/<str:broadcast_id>/delete/', broadcasts_api_delete, name='broadcasts_api_delete'),
    path('api/broadcast/<str:broadcast_id>/progress/', broadcast_progress_api, name='broadcast_progress'),
    
    # Admin
    path('admin/', admin.site.urls),
    path('', lambda r: redirect('/admin/')),
]
