from django.core.validators import RegexValidator
from rest_framework import serializers

from apps.accounts.models import User
from apps.workspaces.mixins import MemberField, WorkspaceRelatedField

from .models import Attachment, Comment, Issue, Project, Sprint, WorkflowStatus


class ProjectSerializer(serializers.ModelSerializer):
    key = serializers.CharField(max_length=10, validators=[RegexValidator(r'^[A-Z][A-Z0-9]{1,9}$', 'Use 2-10 capital letters or digits, starting with a letter (e.g. WEB).')])

    class Meta:
        model = Project
        fields = ['id', 'name', 'key', 'description', 'issue_counter', 'created_at']
        read_only_fields = ['issue_counter', 'created_at']

    def validate_key(self, value):
        qs = Project.objects.filter(workspace=self.context['request'].workspace, key=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This key is already used by another project.')
        return value


class WorkflowStatusSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects)
    next_statuses = WorkspaceRelatedField(queryset=WorkflowStatus.objects, many=True, required=False)

    class Meta:
        model = WorkflowStatus
        fields = ['id', 'project', 'name', 'category', 'order', 'next_statuses']

    def validate(self, data):
        project = data.get('project') or (self.instance.project if self.instance else None)
        if self.instance and 'project' in data and data['project'] != self.instance.project:
            raise serializers.ValidationError({'project': 'A status cannot be moved to another project.'})
        for s in data.get('next_statuses', []):
            if s.project_id != project.id:
                raise serializers.ValidationError({'next_statuses': 'Statuses must belong to the same project.'})
        dup = WorkflowStatus.objects.filter(project=project, name=data.get('name', getattr(self.instance, 'name', None)))
        if self.instance:
            dup = dup.exclude(pk=self.instance.pk)
        if dup.exists():
            raise serializers.ValidationError({'name': 'This project already has a status with that name.'})
        return data


class SprintSerializer(serializers.ModelSerializer):
    project = WorkspaceRelatedField(queryset=Project.objects)

    class Meta:
        model = Sprint
        fields = ['id', 'project', 'name', 'goal', 'start_date', 'end_date', 'status']
        read_only_fields = ['status']   # changed only through the start / complete actions

    def validate(self, data):
        start = data.get('start_date', getattr(self.instance, 'start_date', None))
        end = data.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'The end date cannot be before the start date.'})
        if self.instance and 'project' in data and data['project'] != self.instance.project:
            raise serializers.ValidationError({'project': 'A sprint cannot be moved to another project.'})
        return data


def check_transition(issue, new_status):
    """Custom workflow rule: if the current status lists allowed next statuses, the move must be one of them."""
    allowed = issue.status.next_statuses.all()
    if new_status.pk != issue.status_id and allowed.exists() and new_status not in allowed:
        names = ', '.join(s.name for s in allowed)
        raise serializers.ValidationError({'status': f'The workflow does not allow "{issue.status.name}" -> "{new_status.name}". Allowed: {names}.'})


class IssueSerializer(serializers.ModelSerializer):
    key = serializers.CharField(read_only=True)
    project = WorkspaceRelatedField(queryset=Project.objects)
    status = WorkspaceRelatedField(queryset=WorkflowStatus.objects, required=False)
    sprint = WorkspaceRelatedField(queryset=Sprint.objects, required=False, allow_null=True)
    assignee = MemberField(queryset=User.objects, required=False, allow_null=True)
    status_name = serializers.CharField(source='status.name', read_only=True)
    status_category = serializers.CharField(source='status.category', read_only=True)
    assignee_name = serializers.CharField(source='assignee.name', default=None, read_only=True)
    reporter_name = serializers.CharField(source='reporter.name', default=None, read_only=True)

    class Meta:
        model = Issue
        fields = ['id', 'key', 'project', 'number', 'title', 'description', 'type', 'priority', 'status', 'status_name',
                  'status_category', 'assignee', 'assignee_name', 'reporter', 'reporter_name', 'sprint', 'position',
                  'story_points', 'due_date', 'created_at', 'updated_at']
        read_only_fields = ['number', 'reporter', 'position', 'created_at', 'updated_at']

    def validate(self, data):
        issue = self.instance
        project = data.get('project') or (issue.project if issue else None)
        if issue and 'project' in data and data['project'] != issue.project:
            raise serializers.ValidationError({'project': 'An issue cannot be moved to another project.'})
        status, sprint = data.get('status'), data.get('sprint')
        if status and status.project_id != project.id:
            raise serializers.ValidationError({'status': 'This status belongs to a different project.'})
        if sprint and sprint.project_id != project.id:
            raise serializers.ValidationError({'sprint': 'This sprint belongs to a different project.'})
        if issue and status:
            check_transition(issue, status)
        return data


class CommentSerializer(serializers.ModelSerializer):
    issue = WorkspaceRelatedField(queryset=Issue.objects)
    author_name = serializers.CharField(source='author.name', default=None, read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'issue', 'author', 'author_name', 'body', 'created_at', 'updated_at']
        read_only_fields = ['author', 'created_at', 'updated_at']

    def validate(self, data):
        if self.instance and 'issue' in data and data['issue'] != self.instance.issue:
            raise serializers.ValidationError({'issue': 'A comment cannot be moved to another issue.'})
        return data


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attachment
        fields = ['id', 'issue', 'filename', 'size', 'content_type', 'uploaded_by', 'created_at']
