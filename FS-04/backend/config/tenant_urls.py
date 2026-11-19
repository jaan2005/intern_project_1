"""Everything under /api/w/<slug>/ . All of it goes through the WorkspaceAccess tenant gate."""
from django.urls import include, path
from rest_framework.routers import SimpleRouter

from apps.audit.views import AuditLogViewSet
from apps.billing.views import BillingViewSet
from apps.integrations.views import ReportViewSet, WebhookViewSet
from apps.projects.views import (AttachmentViewSet, CommentViewSet, IssueViewSet, ProjectViewSet, SprintViewSet,
                                 WorkflowStatusViewSet)
from apps.workspaces.views import MemberViewSet, WorkspaceDetailView

router = SimpleRouter()
router.register('members', MemberViewSet, basename='member')
router.register('projects', ProjectViewSet, basename='project')
router.register('statuses', WorkflowStatusViewSet, basename='status')
router.register('sprints', SprintViewSet, basename='sprint')
router.register('issues', IssueViewSet, basename='issue')
router.register('comments', CommentViewSet, basename='comment')
router.register('attachments', AttachmentViewSet, basename='attachment')
router.register('audit', AuditLogViewSet, basename='audit')
router.register('webhooks', WebhookViewSet, basename='webhook')
router.register('reports', ReportViewSet, basename='report')
router.register('billing', BillingViewSet, basename='billing')

urlpatterns = [
    path('', WorkspaceDetailView.as_view()),
    path('', include(router.urls)),
]
