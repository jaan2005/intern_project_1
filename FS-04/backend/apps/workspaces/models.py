import secrets

from django.conf import settings
from django.db import models
from django.utils.text import slugify

ROLES = [('owner', 'Owner'), ('admin', 'Admin'), ('member', 'Member'), ('viewer', 'Viewer')]
ROLE_RANK = {'viewer': 1, 'member': 2, 'admin': 3, 'owner': 4}


class Workspace(models.Model):
    """A workspace is one company (a TENANT). Every other table points back to it."""
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=60, unique=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    AUDIT_FIELDS = ['name']

    def __str__(self):
        return self.name

    @staticmethod
    def make_slug(name):
        base = slugify(name)[:50] or 'workspace'
        slug = base
        while Workspace.objects.filter(slug=slug).exists():
            slug = f'{base}-{secrets.token_hex(2)}'
        return slug


class Membership(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=10, choices=ROLES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    AUDIT_FIELDS = ['role', 'user_id']

    class Meta:
        constraints = [models.UniqueConstraint(fields=['workspace', 'user'], name='one_membership_per_user')]

    def __str__(self):
        return f'{self.user} as {self.role} in {self.workspace}'
