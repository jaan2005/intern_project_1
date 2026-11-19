from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Append-only history of who did what in a workspace. Also the source of webhook events."""
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='audit_logs')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    action = models.CharField(max_length=60)              # e.g. issue.created, issue.status_changed
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.BigIntegerField(null=True, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)  # {"status_id": [1, 2]} for updates
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['workspace', '-created_at'])]
