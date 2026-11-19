"""Settings. Everything environment-specific comes from environment variables (see .env.example)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
env = os.environ.get

SECRET_KEY = env('DJANGO_SECRET_KEY', 'dev-only-insecure-key-change-me')
DEBUG = env('DJANGO_DEBUG', '1') == '1'
if not DEBUG and SECRET_KEY.startswith('dev-only'):
    raise RuntimeError('Set DJANGO_SECRET_KEY to a long random value when DJANGO_DEBUG=0.')
ALLOWED_HOSTS = env('DJANGO_ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'apps.accounts',
    'apps.workspaces',
    'apps.projects',
    'apps.audit',
    'apps.integrations',
    'apps.billing',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
AUTH_USER_MODEL = 'accounts.User'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': env('POSTGRES_DB', 'pm'),
        'USER': env('POSTGRES_USER', 'pm'),
        'PASSWORD': env('POSTGRES_PASSWORD', 'pm'),
        'HOST': env('POSTGRES_HOST', 'localhost'),
        'PORT': env('POSTGRES_PORT', '5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.TokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 100,
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
}

CORS_ALLOWED_ORIGINS = env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173').split(',')
FRONTEND_URL = env('FRONTEND_URL', 'http://localhost:5173')

# ---- Celery (background jobs: webhooks, notification emails, reports) ----
CELERY_BROKER_URL = env('REDIS_URL', 'redis://localhost:6379/0')
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ALWAYS_EAGER = env('CELERY_TASK_ALWAYS_EAGER', '0') == '1'  # run tasks inline (used by tests)
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# ---- email: printed to the console (the Celery worker's log) in development ----
EMAIL_BACKEND = env('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', 'Projects <no-reply@pm.local>')

# ---- files ----
MEDIA_ROOT = env('MEDIA_ROOT', str(BASE_DIR / 'media'))  # attachments and reports; never served publicly
MAX_ATTACHMENT_MB = int(env('MAX_ATTACHMENT_MB', '5'))
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# ---- webhooks: block private/loopback targets in production (SSRF protection) ----
WEBHOOK_ALLOW_PRIVATE = env('WEBHOOK_ALLOW_PRIVATE', '1' if DEBUG else '0') == '1'

# ---- billing: simulated by default; real Stripe when a key is set ----
STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET', '')
BILLING_PROVIDER = env('BILLING_PROVIDER', 'stripe' if STRIPE_SECRET_KEY else 'mock')

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
