import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('pm')
app.config_from_object('django.conf:settings', namespace='CELERY')  # reads CELERY_* values from settings.py
app.autodiscover_tasks()  # finds tasks.py in every installed app
