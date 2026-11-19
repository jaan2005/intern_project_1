from rest_framework.exceptions import PermissionDenied

from .services import record, snapshot


class AuditedMixin:
    """
    Add to a viewset (with TenantMixin) to get automatic audit entries for create / update / delete.
    Set `audit_type = 'issue'`. Hooks: save_new(), after_create(), after_update(), update_action().
    """
    audit_type = ''

    def save_new(self, serializer):
        return serializer.save(workspace=self.request.workspace)

    def after_create(self, obj):
        pass

    def after_update(self, obj, diff):
        pass

    def update_action(self, obj, diff):
        return f'{self.audit_type}.updated'

    def perform_create(self, serializer):
        obj = self.save_new(serializer)
        record(self.request.workspace, self.request.user, f'{self.audit_type}.created', obj, snapshot(obj))
        self.after_create(obj)

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        obj = serializer.save()
        after = snapshot(obj)
        diff = {k: [before[k], after[k]] for k in after if before.get(k) != after[k]}
        if diff:
            record(self.request.workspace, self.request.user, self.update_action(obj, diff), obj, diff)
        self.after_update(obj, diff)

    def perform_destroy(self, instance):
        info = dict(obj=None, target_type=self.audit_type, target_id=instance.pk, target_label=str(instance))
        changes = snapshot(instance)
        instance.delete()
        record(self.request.workspace, self.request.user, f'{self.audit_type}.deleted', changes=changes, **info)


def require_author_or_admin(request, author_id):
    from apps.workspaces.models import ROLE_RANK
    if author_id != request.user.id and ROLE_RANK[request.membership.role] < ROLE_RANK['admin']:
        raise PermissionDenied('Only the author or an admin can change this.')
