"""Permission classes. RolePermission answers endpoint reachability from the
matrix; IsTaskCreator answers the one object-level rule."""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from apps.core.permissions.matrix import is_allowed
from apps.core.roles import Role


class RolePermission(BasePermission):
    """Matrix-driven endpoint reachability (D11).

    The view declares `permission_resource`; the DRF action supplies the rest.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # DRF runs permissions BEFORE handler lookup, so an HTTP method the router
        # never mapped arrives with action=None. Denying it would answer 403 for a
        # method that is simply not supported; let DRF answer 405 instead.
        if getattr(view, "action", None) is None:
            return True
        resource = getattr(view, "permission_resource", None)
        if resource is None:
            raise AssertionError(
                f"{view.__class__.__name__} must declare permission_resource to use RolePermission"
            )
        return is_allowed(user.role, resource, view.action)


class IsTaskCreator(BasePermission):
    """D27: an Operator may delete a task only if they created it as well as
    holding it. Without this an Operator could soft-delete Supervisor-assigned
    work — and D20 provides no restore endpoint, so it would be irrecoverable
    through the API.

    Scoping alone cannot express this, because the row must stay VISIBLE while
    becoming UNDELETABLE — which is precisely what object permissions are for.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        if request.user.role != Role.OPERATOR:
            return True
        if obj.created_by_id == request.user.pk:
            return True
        # RAISED, not returned: returning False yields DRF's generic
        # permission_denied code, and spec §8.7 specifies this one.
        raise PermissionDenied(
            detail="Only the creator of a task may delete it.",
            code="delete_requires_creator",
        )
