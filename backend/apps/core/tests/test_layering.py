"""The spec §5.2.2 rule, enforced instead of trusted:

services.py may import the Protocol. It may never import a concrete
repository. The only module that names Django*Repository is the view.
"""

import inspect
import re

import pytest

from apps.tasks import services as task_services
from apps.users import services as user_services

CONCRETE_REPOSITORY = re.compile(r"\bDjango\w*Repository\b")


@pytest.mark.parametrize("module", [task_services, user_services], ids=["tasks", "users"])
def test_service_modules_name_no_concrete_repository(module):
    offenders = CONCRETE_REPOSITORY.findall(inspect.getsource(module))
    assert not offenders, f"{module.__name__} names {sorted(set(offenders))}"


@pytest.mark.parametrize("module", [task_services, user_services], ids=["tasks", "users"])
def test_service_modules_do_not_touch_the_orm(module):
    """Spec §16.2: a service reaching for Task.objects directly reintroduces a
    second write path, bypassing transition validation, notification enqueue and
    row locking."""
    source = inspect.getsource(module)
    assert ".objects." not in source, f"{module.__name__} uses a model manager directly"


@pytest.mark.parametrize("module", [task_services, user_services], ids=["tasks", "users"])
def test_no_service_declares_an_untyped_data_parameter(module):
    """Services take DTOs, not dicts (D29).

    Coarse on purpose, in the same spirit as the Django*Repository scan above:
    a source-text check has no false negatives for the pattern that matters,
    and the alternative is an import-graph dependency for one rule.
    """
    source = inspect.getsource(module)
    assert "data: dict" not in source, f"{module.__name__} takes a dict where a DTO belongs"


def test_the_composition_root_is_the_view():
    from apps.tasks import views as task_views
    from apps.users import views as user_views

    assert CONCRETE_REPOSITORY.search(inspect.getsource(task_views))
    assert CONCRETE_REPOSITORY.search(inspect.getsource(user_views))
