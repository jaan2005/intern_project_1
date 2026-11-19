import ipaddress
import socket
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from rest_framework import serializers, viewsets, mixins
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.audit.mixins import AuditedMixin
from apps.audit.services import record
from apps.billing import services as billing
from apps.projects.models import Project, Sprint
from apps.workspaces.mixins import TenantMixin, WorkspaceRelatedField

from .events import EVENTS
from .models import Report, Webhook, WebhookDelivery, new_secret
from .tasks import build_payload, generate_report, queue_delivery


def validate_webhook_url(url):
    """Only http(s), and (in production) never a private/internal address, so webhooks cannot be used to probe our network."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        raise serializers.ValidationError('Enter a full http:// or https:// URL.')
    if settings.WEBHOOK_ALLOW_PRIVATE:
        return url
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, None)}
    except socket.gaierror:
        raise serializers.ValidationError('This host name cannot be resolved.')
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise serializers.ValidationError('Webhooks cannot point at private or internal addresses.')
    return url


class WebhookSerializer(serializers.ModelSerializer):
    url = serializers.URLField(max_length=500)

    class Meta:
        model = Webhook
        fields = ['id', 'url', 'description', 'events', 'active', 'secret', 'created_at']
        read_only_fields = ['secret', 'created_at']

    def validate_url(self, value):
        return validate_webhook_url(value)

    def validate_events(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError('Choose at least one event, or ["*"] for all.')
        unknown = [e for e in value if e != '*' and e not in EVENTS]
        if unknown:
            raise serializers.ValidationError(f'Unknown events: {", ".join(map(str, unknown))}.')
        return value


class DeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookDelivery
        fields = ['id', 'event', 'status', 'response_status', 'response_body', 'attempts', 'created_at', 'last_attempt_at']


class WebhookViewSet(TenantMixin, AuditedMixin, viewsets.ModelViewSet):
    model = Webhook
    serializer_class = WebhookSerializer
    audit_type = 'webhook'
    read_role = 'admin'
    write_role = 'admin'

    def save_new(self, serializer):
        billing.require_feature(self.request.workspace, 'webhooks')     # not on the Free plan
        return serializer.save(workspace=self.request.workspace)

    @action(detail=True, methods=['get'])
    def deliveries(self, request, slug=None, pk=None):
        return Response(DeliverySerializer(self.get_object().deliveries.all()[:50], many=True).data)

    @action(detail=True, methods=['post'])
    def test(self, request, slug=None, pk=None):
        """Send a sample event so the receiver can check its signature code."""
        hook = self.get_object()
        payload = {'id': 0, 'event': 'webhook.test', 'workspace': request.workspace.slug,
                   'actor': {'id': request.user.id, 'name': request.user.name}, 'target': {'type': 'webhook', 'id': hook.pk, 'label': hook.url},
                   'changes': {}, 'timestamp': None}
        return Response(DeliverySerializer(queue_delivery(hook, 'webhook.test', payload)).data, status=202)

    @action(detail=True, methods=['post'])
    def rotate_secret(self, request, slug=None, pk=None):
        hook = self.get_object()
        hook.secret = new_secret()
        hook.save(update_fields=['secret'])
        return Response(WebhookSerializer(hook).data)


class ReportSerializer(serializers.ModelSerializer):
    sprint = WorkspaceRelatedField(queryset=Sprint.objects, required=False, allow_null=True)
    project = WorkspaceRelatedField(queryset=Project.objects, required=False, allow_null=True)

    class Meta:
        model = Report
        fields = ['id', 'kind', 'sprint', 'project', 'status', 'summary', 'error', 'created_at', 'finished_at']
        read_only_fields = ['status', 'summary', 'error', 'created_at', 'finished_at']

    def validate(self, data):
        if data.get('kind') == 'sprint' and not data.get('sprint'):
            raise serializers.ValidationError({'sprint': 'Choose a sprint.'})
        if data.get('kind') == 'project' and not data.get('project'):
            raise serializers.ValidationError({'project': 'Choose a project.'})
        return data


class ReportViewSet(TenantMixin, mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Reports are generated by a Celery job. POST returns 202 immediately; poll the report until status is 'done'."""
    model = Report
    serializer_class = ReportSerializer

    def create(self, request, slug=None):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        report = s.save(workspace=request.workspace, requested_by=request.user)
        transaction.on_commit(lambda: generate_report.delay(report.pk))
        return Response(ReportSerializer(report).data, status=202)

    @action(detail=True, methods=['get'])
    def download(self, request, slug=None, pk=None):
        report = self.get_object()
        if report.status != 'done' or not report.file:
            raise ValidationError({'detail': 'This report is not ready yet.'})
        response = FileResponse(report.file.open('rb'), as_attachment=True, filename=f'report-{report.pk}.csv', content_type='text/csv')
        response['X-Content-Type-Options'] = 'nosniff'
        return response
