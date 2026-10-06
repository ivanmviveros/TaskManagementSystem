"""Permission classes. RolePermission answers endpoint reachability from the
matrix; IsTaskCreator (Task 31) answers the one object-level rule."""

from rest_framework.permissions import BasePermission

from apps.core.permissions.matrix import is_allowed


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
