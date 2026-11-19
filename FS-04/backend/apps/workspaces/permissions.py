from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import ROLE_RANK, Membership


class WorkspaceAccess(BasePermission):
    """
    THE tenant gate. Every workspace URL (/api/w/<slug>/...) passes through here.
      1. The user must be a member of the workspace, otherwise 404 (we do not even reveal that it exists).
      2. The user's role must be high enough for the action.
    On success it attaches request.workspace and request.membership for the view to use.
    """

    def has_permission(self, request, view):
        membership = (
            Membership.objects.select_related('workspace')
            .filter(user=request.user, workspace__slug=view.kwargs.get('slug'))
            .first()
        )
        if membership is None:
            raise NotFound('Workspace not found.')
        request.workspace = membership.workspace
        request.membership = membership

        needed = view.required_role(request)
        if ROLE_RANK[membership.role] < ROLE_RANK[needed]:
            raise PermissionDenied(f'This action needs the {needed} role or higher (you are {membership.role}).')
        return True
