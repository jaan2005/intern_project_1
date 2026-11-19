import os
import uuid

from django.conf import settings
from django.db import models


class Project(models.Model):
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='projects')
    name = models.CharField(max_length=120)
    key = models.CharField(max_length=10)                 # prefix for issue numbers, e.g. WEB -> WEB-12
    description = models.TextField(blank=True)
    issue_counter = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    AUDIT_FIELDS = ['name', 'key', 'description']

    class Meta:
        constraints = [models.UniqueConstraint(fields=['workspace', 'key'], name='unique_project_key_per_workspace')]
        ordering = ['name']

    def __str__(self):
        return f'{self.key} {self.name}'


class WorkflowStatus(models.Model):
    """A column on the board. Each project defines its own workflow (custom statuses and allowed moves)."""
    CATEGORIES = [('todo', 'To do'), ('in_progress', 'In progress'), ('done', 'Done')]
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='statuses')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='statuses')
    name = models.CharField(max_length=50)
    category = models.CharField(max_length=12, choices=CATEGORIES, default='todo')
    order = models.PositiveIntegerField(default=0)
    # If this list is not empty, an issue in this status may ONLY move to one of these statuses.
    next_statuses = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='previous_statuses')

    AUDIT_FIELDS = ['name', 'category', 'order']

    class Meta:
        constraints = [models.UniqueConstraint(fields=['project', 'name'], name='unique_status_name_per_project')]
        ordering = ['order', 'id']

    def __str__(self):
        return self.name


class Sprint(models.Model):
    STATES = [('planned', 'Planned'), ('active', 'Active'), ('completed', 'Completed')]
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='sprints')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sprints')
    name = models.CharField(max_length=100)
    goal = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATES, default='planned')

    AUDIT_FIELDS = ['name', 'goal', 'start_date', 'end_date', 'status']

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return self.name


class Issue(models.Model):
    TYPES = [('task', 'Task'), ('bug', 'Bug'), ('story', 'Story')]
    PRIORITIES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('urgent', 'Urgent')]
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='issues')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='issues')
    number = models.PositiveIntegerField()                # per-project counter -> key like WEB-12
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    type = models.CharField(max_length=10, choices=TYPES, default='task')
    priority = models.CharField(max_length=10, choices=PRIORITIES, default='medium')
    status = models.ForeignKey(WorkflowStatus, on_delete=models.RESTRICT, related_name='issues')   # RESTRICT: blocks deleting one status that has issues, but allows deleting the whole workspace
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_issues')
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='reported_issues')
    sprint = models.ForeignKey(Sprint, on_delete=models.SET_NULL, null=True, blank=True, related_name='issues')
    position = models.FloatField(default=0)               # order inside its board column
    story_points = models.PositiveSmallIntegerField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    AUDIT_FIELDS = ['title', 'description', 'type', 'priority', 'status_id', 'assignee_id', 'sprint_id', 'story_points', 'due_date']

    class Meta:
        constraints = [models.UniqueConstraint(fields=['project', 'number'], name='unique_issue_number_per_project')]
        indexes = [models.Index(fields=['workspace', 'project', 'status', 'position'])]

    @property
    def key(self):
        return f'{self.project.key}-{self.number}'

    def __str__(self):
        return f'{self.key}: {self.title}'


class Comment(models.Model):
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='comments')
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='comments')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    AUDIT_FIELDS = ['body', 'issue_id']

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'Comment on {self.issue}'


def attachment_path(instance, filename):
    # a random prefix means two files with the same name never collide, and names cannot be guessed
    return f'ws{instance.workspace_id}/issue{instance.issue_id}/{uuid.uuid4().hex}_{os.path.basename(filename)}'


class Attachment(models.Model):
    workspace = models.ForeignKey('workspaces.Workspace', on_delete=models.CASCADE, related_name='attachments')
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='attachments')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    file = models.FileField(upload_to=attachment_path)
    filename = models.CharField(max_length=255)
    size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    AUDIT_FIELDS = ['filename', 'size', 'issue_id']

    def __str__(self):
        return self.filename
