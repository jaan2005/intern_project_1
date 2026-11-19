from rest_framework import serializers
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from .permissions import WorkspaceAccess


class TenantMixin:
    """
    Put this on EVERY viewset whose data belongs to a workspace.
    It guarantees two things: the caller belongs to the workspace, and the queryset only ever contains that workspace's rows.
    """
    model = None                       # the model this viewset serves
    permission_classes = [IsAuthenticated, WorkspaceAccess]
    read_role = 'viewer'               # minimum role for GET
    write_role = 'member'              # minimum role for POST/PUT/PATCH/DELETE
    role_overrides = {}                # {'create': 'admin', ...} for specific actions

    def required_role(self, request):
        action = getattr(self, 'action', None)
        if action in self.role_overrides:
            return self.role_overrides[action]
        return self.read_role if request.method in SAFE_METHODS else self.write_role

    def get_queryset(self):
        return self.model.objects.filter(workspace=self.request.workspace)   # <- the central isolation rule


class WorkspaceRelatedField(serializers.PrimaryKeyRelatedField):
    """A foreign key that can only point at rows of the CURRENT workspace (blocks cross-tenant references)."""

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = getattr(self.context.get('request'), 'workspace', None)
        return qs.filter(workspace=workspace) if workspace else qs.none()


class MemberField(serializers.PrimaryKeyRelatedField):
    """A user, but only people who are members of the current workspace."""

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = getattr(self.context.get('request'), 'workspace', None)
        return qs.filter(memberships__workspace=workspace) if workspace else qs.none()
