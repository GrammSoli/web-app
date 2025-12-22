"""
URL configuration for admin_panel project.
"""
from django.contrib import admin
from django.urls import path
from django.shortcuts import redirect
from django.conf import settings
from django.conf.urls.static import static

from core.views import (
    DashboardView, 
    dashboard_api, 
    broadcast_progress_api,
    broadcasts_page,
    broadcasts_api_list,
    broadcasts_api_create,
    broadcasts_api_launch,
    broadcasts_api_cancel,
    broadcasts_api_delete,
    broadcasts_api_upload_image,
    broadcasts_api_get,
    broadcasts_api_update,
)

urlpatterns = [
    # Dashboard
    path('admin/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('api/dashboard/', dashboard_api, name='dashboard_api'),
    
    # Broadcasts - отдельная страница
    path('admin/broadcasts/', broadcasts_page, name='broadcasts'),
    path('admin/broadcasts/api/list/', broadcasts_api_list, name='broadcasts_api_list'),
    path('admin/broadcasts/api/create/', broadcasts_api_create, name='broadcasts_api_create'),
    path('admin/broadcasts/api/<str:broadcast_id>/get/', broadcasts_api_get, name='broadcasts_api_get'),
    path('admin/broadcasts/api/<str:broadcast_id>/update/', broadcasts_api_update, name='broadcasts_api_update'),
    path('admin/broadcasts/api/<str:broadcast_id>/launch/', broadcasts_api_launch, name='broadcasts_api_launch'),
    path('admin/broadcasts/api/<str:broadcast_id>/cancel/', broadcasts_api_cancel, name='broadcasts_api_cancel'),
    path('admin/broadcasts/api/<str:broadcast_id>/delete/', broadcasts_api_delete, name='broadcasts_api_delete'),
    path('admin/broadcasts/api/upload-image/', broadcasts_api_upload_image, name='broadcasts_api_upload_image'),
    path('api/broadcast/<str:broadcast_id>/progress/', broadcast_progress_api, name='broadcast_progress'),
    
    # Admin
    path('admin/', admin.site.urls),
    path('', lambda r: redirect('/admin/')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    # In production, also serve (nginx should handle this, but fallback)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
