import datetime
import decimal

from django.db import transaction

from .models import AuditLog


def plain(value):
    """Turn a model value into something JSON can store."""
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return str(value)
    return value


def snapshot(obj):
    return {f: plain(getattr(obj, f)) for f in getattr(obj, 'AUDIT_FIELDS', [])}


def record(workspace, actor, action, obj=None, changes=None, target_type=None, target_id=None, target_label=None):
    """Write one audit entry, then (after the database transaction commits) fan it out to webhooks."""
    entry = AuditLog.objects.create(
        workspace=workspace,
        actor=actor if getattr(actor, 'pk', None) else None,
        action=action,
        target_type=target_type or (obj.__class__.__name__.lower() if obj is not None else ''),
        target_id=target_id if target_id is not None else getattr(obj, 'pk', None),
        target_label=(target_label if target_label is not None else (str(obj) if obj is not None else ''))[:255],
        changes=changes or {},
    )

    def fan_out():
        from apps.integrations.tasks import fan_out_event   # imported here to avoid a circular import
        fan_out_event(entry.pk)

    transaction.on_commit(fan_out)
    return entry
