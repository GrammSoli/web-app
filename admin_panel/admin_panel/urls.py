"""
URL configuration for admin_panel project.
"""
from django.contrib import admin
from django.urls import path
from django.shortcuts import redirect

from core.views import DashboardView, dashboard_api

urlpatterns = [
    path('admin/', admin.site.urls),
    path('admin/dashboard/', DashboardView.as_view(), name='dashboard'),
    path('api/dashboard/', dashboard_api, name='dashboard_api'),
    path('', lambda r: redirect('/admin/')),
]
