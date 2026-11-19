from django.db import connection
from django.http import JsonResponse
from django.urls import include, path

from apps.billing.views import MockPayView, MockSessionView, StripeWebhookView
from apps.workspaces.views import WorkspaceListCreateView


def health(request):
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1')
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('api/health/', health),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/workspaces/', WorkspaceListCreateView.as_view()),
    path('api/w/<slug:slug>/', include('config.tenant_urls')),
    path('api/billing/mock/pay/', MockPayView.as_view()),
    path('api/billing/mock/<str:session_id>/', MockSessionView.as_view()),
    path('api/billing/stripe/webhook/', StripeWebhookView.as_view()),
]
