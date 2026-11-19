import secrets

from django.conf import settings
from django.db import models


def new_secret():
    return secrets.token_urlsafe(24)


class Webhook(models.Model):
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='webhooks')
    url = models.URLField(max_length=500)
    description = models.CharField(max_length=200, blank=True)
    events = models.JSONField(default=list)                  # ["*"] or ["issue.created", ...]
    secret = models.CharField(max_length=64, default=new_secret)   # used to sign every delivery (HMAC)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    AUDIT_FIELDS = ['url', 'events', 'active']

    def __str__(self):
        return self.url


class WebhookDelivery(models.Model):
    webhook = models.ForeignKey(Webhook, on_delete=models.CASCADE, related_name='deliveries')
    event = models.CharField(max_length=60)
    payload = models.JSONField()
    status = models.CharField(max_length=10, default='pending')      # pending | success | failed
    response_status = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-id']


def report_path(instance, filename):
    return f'ws{instance.workspace_id}/reports/{filename}'


class Report(models.Model):
    KINDS = [('sprint', 'Sprint report'), ('project', 'Project report')]
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='reports')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    kind = models.CharField(max_length=10, choices=KINDS)
    sprint = models.ForeignKey('projects.Sprint', on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    status = models.CharField(max_length=10, default='pending')      # pending | running | done | failed
    file = models.FileField(upload_to=report_path, null=True, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    error = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    AUDIT_FIELDS = ['kind', 'status']

    def __str__(self):
        return f'{self.get_kind_display()} #{self.pk}'

    class Meta:
        ordering = ['-id']
