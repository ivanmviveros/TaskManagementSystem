"""Object-level permission classes, tested directly rather than through a view."""

from types import SimpleNamespace

import pytest
from rest_framework.exceptions import PermissionDenied

from apps.core.permissions.classes import IsNotSelf


def test_is_not_self_refuses_only_the_actors_own_row():
    me, other = SimpleNamespace(pk=1), SimpleNamespace(pk=2)
    request = SimpleNamespace(user=me)
    assert IsNotSelf().has_object_permission(request, None, other) is True
    with pytest.raises(PermissionDenied) as caught:
        IsNotSelf().has_object_permission(request, None, me)
    assert caught.value.get_codes() == "cannot_delete_self"
