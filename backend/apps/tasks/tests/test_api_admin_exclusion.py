"""D13: an Admin manages who exists in the system and what they may do, WITHOUT
being able to read or alter the work itself. Account administration and
operational data stay separated."""

import pytest

from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def test_admin_is_403_on_every_task_route(admin_client):
    task = TaskFactory()
    base = "/api/v1/tasks/"
    assert admin_client.get(base).status_code == 403
    assert admin_client.post(base, {"title": "x"}, format="json").status_code == 403
    assert admin_client.get(f"{base}{task.pk}/").status_code == 403
    assert admin_client.patch(f"{base}{task.pk}/", {"title": "x"}, format="json").status_code == 403
    assert admin_client.delete(f"{base}{task.pk}/").status_code == 403
    assert admin_client.post(f"{base}{task.pk}/complete/", {}, format="json").status_code == 403
    # Including stats: an Admin therefore has no dashboard at all.
    assert admin_client.get(f"{base}stats/").status_code == 403


def test_admin_gets_403_not_404_on_a_task_detail(admin_client):
    """Spec §7.2 rule 6: the role has no business with this resource TYPE, so the
    answer is 403. An Operator reaching another Operator's task gets 404, because
    the type is theirs but that instance is not."""
    assert admin_client.get(f"/api/v1/tasks/{TaskFactory().pk}/").status_code == 403
