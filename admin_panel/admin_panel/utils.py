"""
Утилиты для Django Admin Panel
"""
import os


def environment_callback(request):
    """
    Callback для отображения текущего окружения в Unfold.
    Показывает метку "Development" или "Production" в хедере.
    """
    if os.getenv('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes'):
        return ["Development", "warning"]
    return ["Production", "danger"]
