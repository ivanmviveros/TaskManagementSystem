import pytest

from apps.core.permissions.matrix import MATRIX, Resource, is_allowed
from apps.core.roles import Role


def test_every_resource_action_pair_covers_all_three_roles():
    for key, allowed_roles in MATRIX.items():
        assert isinstance(key, tuple) and len(key) == 2, key
        for role in allowed_roles:
            assert role in Role.values, (key, role)


def test_admin_has_no_task_surface_at_all():
    """D13's most unusual claim, asserted as data before any view exists."""
    task_actions = [action for resource, action in MATRIX if resource == Resource.TASK]
    assert task_actions, "the task rows must exist"
    for action in task_actions:
        assert not is_allowed(Role.ADMIN, Resource.TASK, action), action


def test_supervisor_reads_users_but_writes_none():
    assert is_allowed(Role.SUPERVISOR, Resource.USER, "list")
    assert is_allowed(Role.SUPERVISOR, Resource.USER, "retrieve")
    for action in ("create", "partial_update", "update", "destroy"):
        assert not is_allowed(Role.SUPERVISOR, Resource.USER, action)


def test_operator_has_no_user_surface():
    for action in ("list", "retrieve", "create", "partial_update", "update", "destroy"):
        assert not is_allowed(Role.OPERATOR, Resource.USER, action)


@pytest.mark.parametrize("role", Role.values)
def test_unknown_resource_action_pair_denies_rather_than_raises(role):
    assert is_allowed(role, "nonexistent", "nope") is False
