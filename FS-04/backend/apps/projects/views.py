import os

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from rest_framework import mixins, status as http, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.audit.mixins import AuditedMixin, require_author_or_admin
from apps.audit.services import record, snapshot
from apps.billing import services as billing
from apps.workspaces.mixins import TenantMixin
from apps.workspaces.models import ROLE_RANK

from .models import Attachment, Comment, Issue, Project, Sprint, WorkflowStatus
from .serializers import (AttachmentSerializer, CommentSerializer, IssueSerializer, ProjectSerializer,
                          SprintSerializer, WorkflowStatusSerializer, check_transition)

GAP = 1024.0   # distance between neighbouring cards in a column


def end_position(project, status):
    last = Issue.objects.filter(project=project, status=status).order_by('-position').values_list('position', flat=True).first()
    return (last or 0) + GAP


# ------------------------------------------------------------------ projects
class ProjectViewSet(TenantMixin, AuditedMixin, viewsets.ModelViewSet):
    model = Project
    serializer_class = ProjectSerializer
    audit_type = 'project'
    write_role = 'admin'

    def save_new(self, serializer):
        billing.enforce(self.request.workspace, 'projects')      # plan limit
        with transaction.atomic():
            project = serializer.save(workspace=self.request.workspace)
            for i, (name, cat) in enumerate([('To Do', 'todo'), ('In Progress', 'in_progress'), ('Done', 'done')]):
                WorkflowStatus.objects.create(workspace=project.workspace, project=project, name=name, category=cat, order=i)
        return project

    @action(detail=True, methods=['get'])
    def board(self, request, slug=None, pk=None):
        """Everything the Kanban screen needs in ONE request: columns with their cards in order."""
        project = self.get_object()
        issues = Issue.objects.filter(workspace=request.workspace, project=project).select_related('status', 'assignee', 'reporter', 'project')
        sprint = request.query_params.get('sprint', 'all')
        if sprint == 'backlog':
            issues = issues.filter(sprint__isnull=True)
        elif sprint == 'active':
            issues = issues.filter(sprint__status='active')
        elif sprint.isdigit():
            issues = issues.filter(sprint_id=int(sprint))
        by_status = {}
        for issue in issues.order_by('position', 'id'):
            by_status.setdefault(issue.status_id, []).append(IssueSerializer(issue, context=self.get_serializer_context()).data)
        columns = [{'status': WorkflowStatusSerializer(s, context=self.get_serializer_context()).data, 'issues': by_status.get(s.id, [])}
                   for s in project.statuses.prefetch_related('next_statuses')]
        return Response({'project': ProjectSerializer(project).data, 'columns': columns})


class WorkflowStatusViewSet(TenantMixin, AuditedMixin, viewsets.ModelViewSet):
    model = WorkflowStatus
    serializer_class = WorkflowStatusSerializer
    audit_type = 'status'
    write_role = 'admin'

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related('next_statuses')
        project = self.request.query_params.get('project')
        return qs.filter(project_id=project) if project and project.isdigit() else qs

    def save_new(self, serializer):
        # a new column goes to the end unless the caller says where
        if 'order' in self.request.data:
            return super().save_new(serializer)
        last = WorkflowStatus.objects.filter(project=serializer.validated_data['project']).order_by('-order').values_list('order', flat=True).first()
        return serializer.save(workspace=self.request.workspace, order=(last + 1) if last is not None else 0)

    def perform_destroy(self, instance):
        if instance.issues.exists():
            raise ValidationError({'detail': 'Move or delete the issues in this status first.'})
        if instance.project.statuses.count() <= 1:
            raise ValidationError({'detail': 'A project needs at least one status.'})
        super().perform_destroy(instance)


class SprintViewSet(TenantMixin, AuditedMixin, viewsets.ModelViewSet):
    model = Sprint
    serializer_class = SprintSerializer
    audit_type = 'sprint'
    write_role = 'admin'

    def get_queryset(self):
        qs = super().get_queryset()
        project = self.request.query_params.get('project')
        return qs.filter(project_id=project) if project and project.isdigit() else qs

    @action(detail=True, methods=['post'])
    def start(self, request, slug=None, pk=None):
        sprint = self.get_object()
        if sprint.status != 'planned':
            raise ValidationError({'detail': 'Only a planned sprint can be started.'})
        if Sprint.objects.filter(project=sprint.project, status='active').exists():
            raise ValidationError({'detail': 'This project already has an active sprint. Complete it first.'})
        before = snapshot(sprint)
        sprint.status = 'active'
        sprint.save(update_fields=['status'])
        record(request.workspace, request.user, 'sprint.started', sprint, {'status': [before['status'], 'active']})
        return Response(SprintSerializer(sprint).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, slug=None, pk=None):
        """Finish the sprint. Unfinished issues go back to the backlog (no sprint)."""
        sprint = self.get_object()
        if sprint.status != 'active':
            raise ValidationError({'detail': 'Only an active sprint can be completed.'})
        unfinished = sprint.issues.exclude(status__category='done')
        moved = unfinished.count()
        unfinished.update(sprint=None)
        sprint.status = 'completed'
        sprint.save(update_fields=['status'])
        record(request.workspace, request.user, 'sprint.completed', sprint, {'returned_to_backlog': moved})
        return Response({**SprintSerializer(sprint).data, 'returned_to_backlog': moved})


# ------------------------------------------------------------------ issues
class IssueViewSet(TenantMixin, AuditedMixin, viewsets.ModelViewSet):
    model = Issue
    serializer_class = IssueSerializer
    audit_type = 'issue'
    role_overrides = {'destroy': 'admin'}

    def get_queryset(self):
        qs = super().get_queryset().select_related('project', 'status', 'assignee', 'reporter')
        q = self.request.query_params
        for field in ('project', 'status', 'type', 'priority'):
            if q.get(field):
                qs = qs.filter(**{f'{field}_id' if field in ('project', 'status') else field: q[field]})
        if q.get('assignee') == 'me':
            qs = qs.filter(assignee=self.request.user)
        elif q.get('assignee'):
            qs = qs.filter(assignee_id=q['assignee'])
        if q.get('sprint') == 'backlog':
            qs = qs.filter(sprint__isnull=True)
        elif q.get('sprint'):
            qs = qs.filter(sprint_id=q['sprint'])
        if q.get('search'):
            qs = qs.filter(title__icontains=q['search'])
        return qs.order_by('project_id', 'position', 'id')

    def save_new(self, serializer):
        with transaction.atomic():
            # lock the project row so two people creating issues at once never get the same number
            project = Project.objects.select_for_update().get(pk=serializer.validated_data['project'].pk)
            project.issue_counter += 1
            project.save(update_fields=['issue_counter'])
            status = serializer.validated_data.get('status') or project.statuses.order_by('order', 'id').first()
            return serializer.save(workspace=self.request.workspace, reporter=self.request.user, number=project.issue_counter,
                                   status=status, position=end_position(project, status))

    def update_action(self, obj, diff):
        return 'issue.status_changed' if 'status_id' in diff else 'issue.updated'

    def _notify(self, issue):
        from apps.integrations.tasks import notify_assignment
        if issue.assignee_id and issue.assignee_id != self.request.user.id:
            transaction.on_commit(lambda: notify_assignment.delay(issue.pk, self.request.user.pk))

    def after_create(self, obj):
        self._notify(obj)

    def after_update(self, obj, diff):
        if 'assignee_id' in diff:
            self._notify(obj)

    @action(detail=True, methods=['post'])
    def move(self, request, slug=None, pk=None):
        """Drag and drop: {"status": <id>, "index": <position in that column>}"""
        issue = self.get_object()
        try:
            new_status = WorkflowStatus.objects.get(pk=request.data.get('status'), workspace=request.workspace, project=issue.project)
            index = int(request.data.get('index', 10**9))
        except (WorkflowStatus.DoesNotExist, TypeError, ValueError):
            raise ValidationError({'status': 'A valid status of this project is required.'})
        check_transition(issue, new_status)

        before = snapshot(issue)
        with transaction.atomic():
            others = list(Issue.objects.filter(project=issue.project, status=new_status).exclude(pk=issue.pk).order_by('position', 'id'))
            index = max(0, min(index, len(others)))
            if not others:
                pos = GAP
            elif index == 0:
                pos = others[0].position - GAP
            elif index == len(others):
                pos = others[-1].position + GAP
            else:
                lo, hi = others[index - 1].position, others[index].position
                pos = (lo + hi) / 2
                if hi - lo < 1e-6:   # neighbours too close for floats: renumber the whole column
                    others.insert(index, issue)
                    for n, o in enumerate(others):
                        Issue.objects.filter(pk=o.pk).update(position=(n + 1) * GAP)
                    issue.refresh_from_db()
                    pos = issue.position
            issue.status = new_status
            issue.position = pos
            issue.save(update_fields=['status', 'position', 'updated_at'])
        after = snapshot(issue)
        diff = {k: [before[k], after[k]] for k in after if before[k] != after[k]}
        if diff:
            record(request.workspace, request.user, 'issue.status_changed' if 'status_id' in diff else 'issue.updated', issue, diff)
        return Response(IssueSerializer(issue, context=self.get_serializer_context()).data)


class CommentViewSet(TenantMixin, AuditedMixin, viewsets.ModelViewSet):
    model = Comment
    serializer_class = CommentSerializer
    audit_type = 'comment'

    def get_queryset(self):
        qs = super().get_queryset().select_related('author')
        issue = self.request.query_params.get('issue')
        return qs.filter(issue_id=issue) if issue and issue.isdigit() else qs

    def save_new(self, serializer):
        return serializer.save(workspace=self.request.workspace, author=self.request.user)

    def perform_update(self, serializer):
        require_author_or_admin(self.request, serializer.instance.author_id)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        require_author_or_admin(self.request, instance.author_id)
        super().perform_destroy(instance)


class AttachmentViewSet(TenantMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    model = Attachment
    serializer_class = AttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        qs = super().get_queryset()
        issue = self.request.query_params.get('issue')
        return qs.filter(issue_id=issue) if issue and issue.isdigit() else qs

    def create(self, request, slug=None):
        """POST multipart: issue=<id>, file=<the file>"""
        upload = request.FILES.get('file')
        if not upload:
            raise ValidationError({'file': 'No file received (the field must be called "file").'})
        limit = settings.MAX_ATTACHMENT_MB * 1024 * 1024
        if upload.size > limit:
            raise ValidationError({'file': f'The file is too large (limit {settings.MAX_ATTACHMENT_MB} MB).'})
        try:
            issue = Issue.objects.get(pk=request.data.get('issue'), workspace=request.workspace)
        except (Issue.DoesNotExist, ValueError, TypeError):
            raise ValidationError({'issue': 'A valid issue of this workspace is required.'})
        att = Attachment.objects.create(
            workspace=request.workspace, issue=issue, uploaded_by=request.user, file=upload,
            filename=os.path.basename(upload.name)[:255], size=upload.size, content_type=(upload.content_type or '')[:100])
        record(request.workspace, request.user, 'attachment.created', att, snapshot(att))
        return Response(AttachmentSerializer(att).data, status=http.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        info = dict(target_type='attachment', target_id=instance.pk, target_label=instance.filename)
        changes = snapshot(instance)
        instance.file.delete(save=False)
        instance.delete()
        record(self.request.workspace, self.request.user, 'attachment.deleted', changes=changes, **info)

    @action(detail=True, methods=['get'])
    def download(self, request, slug=None, pk=None):
        """Files are never served from a public URL: every download passes the tenant check above."""
        att = self.get_object()
        response = FileResponse(att.file.open('rb'), as_attachment=True, filename=att.filename)
        response['X-Content-Type-Options'] = 'nosniff'
        return response
