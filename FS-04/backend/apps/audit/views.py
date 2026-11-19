from rest_framework import serializers, viewsets

from apps.workspaces.mixins import TenantMixin

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.name', default=None, read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'action', 'actor', 'actor_name', 'target_type', 'target_id', 'target_label', 'changes', 'created_at']


class AuditLogViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    """The audit trail is visible to admins and owners only."""
    model = AuditLog
    serializer_class = AuditLogSerializer
    read_role = 'admin'

    def get_queryset(self):
        qs = super().get_queryset().select_related('actor')
        q = self.request.query_params
        for field, param in (('action__startswith', 'action'), ('target_type', 'target_type'), ('actor_id', 'actor')):
            if q.get(param):
                qs = qs.filter(**{field: q[param]})
        return qs
