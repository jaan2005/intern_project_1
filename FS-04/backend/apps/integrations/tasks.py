"""Celery background jobs. They run in the separate `worker` container, never inside a web request."""
import csv
import hashlib
import hmac
import io
import json
import logging

import requests
from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.utils import timezone

from .models import Report, Webhook, WebhookDelivery

log = logging.getLogger(__name__)


def build_payload(entry):
    return {
        'id': entry.pk, 'event': entry.action, 'workspace': entry.workspace.slug,
        'actor': {'id': entry.actor_id, 'name': entry.actor.name} if entry.actor else None,
        'target': {'type': entry.target_type, 'id': entry.target_id, 'label': entry.target_label},
        'changes': entry.changes, 'timestamp': entry.created_at.isoformat(),
    }


def fan_out_event(audit_id):
    """Called after an audit entry is committed: create one delivery per matching webhook and queue it."""
    from apps.audit.models import AuditLog
    entry = AuditLog.objects.select_related('workspace', 'actor').get(pk=audit_id)
    for hook in Webhook.objects.filter(workspace=entry.workspace, active=True):
        if '*' in hook.events or entry.action in hook.events:
            queue_delivery(hook, entry.action, build_payload(entry))


def queue_delivery(hook, event, payload):
    delivery = WebhookDelivery.objects.create(webhook=hook, event=event, payload=payload)
    try:
        deliver_webhook.delay(delivery.pk)
    except Exception as exc:   # e.g. Redis is down: keep the record so it is visible, never break the user's request
        log.error('Could not queue webhook delivery %s: %s', delivery.pk, exc)
        delivery.status, delivery.response_body = 'failed', f'Could not queue the job: {exc}'[:500]
        delivery.save(update_fields=['status', 'response_body'])
    return delivery


def sign(secret, body):
    return 'sha256=' + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


@shared_task(bind=True, autoretry_for=(requests.RequestException,), retry_backoff=2, retry_backoff_max=120, max_retries=3)
def deliver_webhook(self, delivery_id):
    """POST the event to the customer's URL, signed with the webhook secret. Retries with backoff on failure."""
    d = WebhookDelivery.objects.select_related('webhook').get(pk=delivery_id)
    body = json.dumps(d.payload, separators=(',', ':'), sort_keys=True)
    headers = {'Content-Type': 'application/json', 'X-PM-Event': d.event, 'X-PM-Delivery': str(d.pk),
               'X-PM-Signature': sign(d.webhook.secret, body)}
    d.attempts += 1
    d.last_attempt_at = timezone.now()
    try:
        r = requests.post(d.webhook.url, data=body, headers=headers, timeout=5)
    except requests.RequestException as exc:
        d.status, d.response_body = 'failed', str(exc)[:500]
        d.save()
        raise
    d.response_status, d.response_body = r.status_code, r.text[:500]
    d.status = 'success' if r.ok else 'failed'
    d.save()
    if not r.ok:
        raise requests.HTTPError(f'Webhook endpoint answered {r.status_code}')   # triggers a retry


@shared_task
def notify_assignment(issue_id, assigned_by_id):
    """Email the new assignee. (In development the email is printed in the worker's console.)"""
    from apps.accounts.models import User
    from apps.projects.models import Issue
    issue = Issue.objects.select_related('assignee', 'project', 'workspace').filter(pk=issue_id).first()
    by = User.objects.filter(pk=assigned_by_id).first()
    if not issue or not issue.assignee:
        return
    link = f'{settings.FRONTEND_URL}/w/{issue.workspace.slug}/projects/{issue.project_id}?issue={issue.pk}'
    send_mail(
        subject=f'[{issue.key}] {by.name if by else "Someone"} assigned you: {issue.title}',
        message=f'Hi {issue.assignee.name},\n\n{by.name if by else "Someone"} assigned you {issue.key} in {issue.workspace.name}.\n\n{issue.title}\n\nOpen it: {link}\n',
        from_email=None, recipient_list=[issue.assignee.email])


def _safe(cell):
    """Stop spreadsheet formula injection: a cell that starts with = + - @ is shown as text."""
    text = '' if cell is None else str(cell)
    return "'" + text if text[:1] in ('=', '+', '-', '@') else text


@shared_task
def generate_report(report_id):
    """Build a CSV of issues (for a sprint or a whole project) plus a summary, in the background."""
    from apps.audit.services import record
    from apps.projects.models import Issue
    report = Report.objects.select_related('sprint', 'project', 'workspace').get(pk=report_id)
    report.status = 'running'
    report.save(update_fields=['status'])
    try:
        issues = Issue.objects.filter(workspace=report.workspace).select_related('status', 'assignee', 'project')
        issues = issues.filter(sprint=report.sprint) if report.kind == 'sprint' else issues.filter(project=report.project)
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(['Key', 'Title', 'Type', 'Priority', 'Status', 'Category', 'Assignee', 'Story points', 'Created'])
        counts = {'todo': 0, 'in_progress': 0, 'done': 0}
        points_total = points_done = 0
        for i in issues.order_by('project_id', 'number'):
            w.writerow([_safe(x) for x in [i.key, i.title, i.type, i.priority, i.status.name, i.status.category,
                                           i.assignee.name if i.assignee else '', i.story_points, i.created_at.date()]])
            counts[i.status.category] += 1
            points_total += i.story_points or 0
            points_done += (i.story_points or 0) if i.status.category == 'done' else 0
        total = sum(counts.values())
        report.summary = {**counts, 'total': total, 'points_total': points_total, 'points_done': points_done,
                          'completion_percent': round(100 * counts['done'] / total) if total else 0}
        report.file.save(f'report-{report.pk}.csv', ContentFile(out.getvalue().encode('utf-8')), save=False)
        report.status = 'done'
    except Exception as exc:
        log.exception('Report %s failed', report_id)
        report.status, report.error = 'failed', str(exc)[:500]
    report.finished_at = timezone.now()
    report.save()
    if report.status == 'done':
        record(report.workspace, report.requested_by, 'report.ready', report, {'summary': report.summary})
