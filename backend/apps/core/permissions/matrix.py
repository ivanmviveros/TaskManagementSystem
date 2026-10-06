"""The declarative source of truth for endpoint reachability (D11).

Read by apps.core.permissions.classes.RolePermission AND by the parametrized
suite in apps/core/tests/test_permission_matrix_api.py, so the rules and their
enforcement cannot drift. Mirrors spec §7.1.

Scope: "may this role call this endpoint at all?" — nothing else. Object-level
outcomes (D27's Operator delete rule) belong to IsTaskCreator; spec §12.2
explains why this file does not grow a richer value type for one rule.
"""

from typing import Final, cast

from apps.core.roles import Role

# `cast` is for mypy, not for runtime: a TextChoices member IS a str at runtime, but
# without django-stubs mypy reads `Role.ADMIN` as the `tuple[str, str]` literal it is
# assigned from, so every frozenset below would be inferred frozenset[tuple[str, str]].
# Casting here keeps Role the single source of truth for the role values.
ADMIN: Final[str] = cast(str, Role.ADMIN)
SUPERVISOR: Final[str] = cast(str, Role.SUPERVISOR)
OPERATOR: Final[str] = cast(str, Role.OPERATOR)

ALL_ROLES: Final = frozenset({ADMIN, SUPERVISOR, OPERATOR})


class Resource:
    USER = "user"
    TASK = "task"


MATRIX: Final[dict[tuple[str, str], frozenset[str]]] = {
    # Admin manages users; Supervisor reads them (assignee picker, task holder);
    # Operator has no user surface at all.
    (Resource.USER, "list"): frozenset({ADMIN, SUPERVISOR}),
    (Resource.USER, "retrieve"): frozenset({ADMIN, SUPERVISOR}),
    (Resource.USER, "create"): frozenset({ADMIN}),
    (Resource.USER, "partial_update"): frozenset({ADMIN}),
    (Resource.USER, "destroy"): frozenset({ADMIN}),
    # "me" is identity, not user management: every authenticated role needs it to
    # route the SPA and render the right navigation.
    (Resource.USER, "me"): ALL_ROLES,
    # D13: Admin has no task surface whatsoever, stats included.
    (Resource.TASK, "list"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "retrieve"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "create"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "partial_update"): frozenset({SUPERVISOR, OPERATOR}),
    # Reachable for an Operator; whether THIS row may be deleted is IsTaskCreator's
    # question (D27). Spec §12.2 records the division of labour.
    (Resource.TASK, "destroy"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "complete"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "stats"): frozenset({SUPERVISOR, OPERATOR}),
}


def is_allowed(role: str, resource: str, action: str) -> bool:
    """Deny by default: an unlisted pair is unreachable, not unrestricted."""
    return role in MATRIX.get((resource, action), frozenset())
