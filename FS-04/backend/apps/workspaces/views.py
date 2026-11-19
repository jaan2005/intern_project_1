from django.db import transaction
from rest_framework import mixins, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audit.services import record
from apps.billing import services as billing
from apps.workspaces.mixins import TenantMixin

from .models import ROLE_RANK, Membership, Workspace
from .permissions import WorkspaceAccess
from .serializers import MembershipSerializer


def workspace_data(workspace, role):
    return {'id': workspace.id, 'name': workspace.name, 'slug': workspace.slug, 'role': role, 'plan': billing.plan_key(workspace)}


class WorkspaceListCreateView(APIView):
    """GET: the workspaces I belong to.  POST: create a new company workspace (I become its owner)."""

    def get(self, request):
        memberships = Membership.objects.filter(user=request.user).select_related('workspace').order_by('workspace__name')
        return Response([workspace_data(m.workspace, m.role) for m in memberships])

    def post(self, request):
        name = str(request.data.get('name', '')).strip()
        if len(name) < 2 or len(name) > 100:
            raise ValidationError({'name': 'Enter a workspace name (2-100 characters).'})
        with transaction.atomic():
            ws = Workspace.objects.create(name=name, slug=Workspace.make_slug(name), created_by=request.user)
            Membership.objects.create(workspace=ws, user=request.user, role='owner')
            billing.ensure_subscription(ws)
            record(ws, request.user, 'workspace.created', ws)
        return Response(workspace_data(ws, 'owner'), status=201)


class WorkspaceDetailView(APIView):
    """/api/w/<slug>/ : details (anyone), rename (admin), delete (owner)."""
    permission_classes = [IsAuthenticated, WorkspaceAccess]

    def required_role(self, request):
        return {'GET': 'viewer', 'PATCH': 'admin', 'DELETE': 'owner'}.get(request.method, 'owner')

    def get(self, request, slug):
        return Response(workspace_data(request.workspace, request.membership.role))

    def patch(self, request, slug):
        name = str(request.data.get('name', '')).strip()
        if len(name) < 2 or len(name) > 100:
            raise ValidationError({'name': 'Enter a workspace name (2-100 characters).'})
        old = request.workspace.name
        request.workspace.name = name
        request.workspace.save(update_fields=['name'])
        record(request.workspace, request.user, 'workspace.renamed', request.workspace, {'name': [old, name]})
        return Response(workspace_data(request.workspace, request.membership.role))

    def delete(self, request, slug):
        if str(request.data.get('confirm', '')) != request.workspace.slug:
            raise ValidationError({'confirm': 'Type the workspace slug in "confirm" to delete it.'})
        request.workspace.delete()      # cascades to every row of this tenant
        return Response(status=204)


class MemberViewSet(TenantMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    model = Membership
    serializer_class = MembershipSerializer
    write_role = 'admin'
    role_overrides = {'destroy': 'viewer'}      # anyone may LEAVE; removing somebody else is checked below

    def get_queryset(self):
        return super().get_queryset().select_related('user').order_by('joined_at')

    def _validate_role(self, request, role, current=None):
        if role not in ROLE_RANK:
            raise ValidationError({'role': 'Choose owner, admin, member or viewer.'})
        mine = ROLE_RANK[request.membership.role]
        if (role == 'owner' or current == 'owner') and request.membership.role != 'owner':
            raise PermissionDenied('Only an owner can grant or change the owner role.')
        if ROLE_RANK[role] > mine:
            raise PermissionDenied('You cannot give a role higher than your own.')

    def _owners_left(self, request, excluding):
        return Membership.objects.filter(workspace=request.workspace, role='owner').exclude(pk=excluding.pk).exists()

    def create(self, request, slug=None):
        """Add an existing user by email."""
        email = str(request.data.get('email', '')).strip().lower()
        role = request.data.get('role', 'member')
        self._validate_role(request, role)
        user = User.objects.filter(email=email).first()
        if not user:
            raise ValidationError({'email': 'No account with this email. Ask them to sign up first.'})
        if Membership.objects.filter(workspace=request.workspace, user=user).exists():
            raise ValidationError({'email': 'This person is already a member.'})
        billing.enforce(request.workspace, 'members')                     # plan limit
        m = Membership.objects.create(workspace=request.workspace, user=user, role=role)
        record(request.workspace, request.user, 'member.added', m, {'role': [None, role]}, target_label=user.email)
        return Response(MembershipSerializer(m).data, status=201)

    def partial_update(self, request, slug=None, pk=None):
        m = self.get_object()
        role = request.data.get('role')
        self._validate_role(request, role, current=m.role)
        if m.role == 'owner' and role != 'owner' and not self._owners_left(request, m):
            raise ValidationError({'role': 'A workspace needs at least one owner.'})
        old, m.role = m.role, role
        m.save(update_fields=['role'])
        record(request.workspace, request.user, 'member.role_changed', m, {'role': [old, role]}, target_label=m.user.email)
        return Response(MembershipSerializer(m).data)

    def destroy(self, request, slug=None, pk=None):
        m = self.get_object()
        leaving = m.user_id == request.user.id
        if not leaving:
            if ROLE_RANK[request.membership.role] < ROLE_RANK['admin']:
                raise PermissionDenied('Only an admin can remove other members.')
            if m.role == 'owner' and request.membership.role != 'owner':
                raise PermissionDenied('Only an owner can remove an owner.')
        if m.role == 'owner' and not self._owners_left(request, m):
            raise ValidationError({'detail': 'A workspace needs at least one owner. Make someone else an owner first.'})
        label = m.user.email
        m.delete()
        record(request.workspace, request.user, 'member.removed', target_type='membership', target_id=pk, target_label=label)
        return Response(status=204)
