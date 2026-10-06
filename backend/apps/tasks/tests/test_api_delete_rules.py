"""D27: an Operator's delete is narrower than their read."""

import pytest

from apps.tasks.models import Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def url(task):
    return f"/api/v1/tasks/{task.pk}/"


def test_operator_deletes_a_task_they_created_and_hold(operator_client, operator):
    task = TaskFactory(created_by=operator, assignee=operator)
    assert operator_client.delete(url(task)).status_code == 204
    assert not Task.objects.filter(pk=task.pk).exists()
    assert Task.all_objects.get(pk=task.pk).deleted_at is not None


def test_operator_cannot_delete_a_supervisor_created_task_assigned_to_them(
    operator_client, operator, supervisor
):
    task = TaskFactory(created_by=supervisor, assignee=operator)
    response = operator_client.delete(url(task))
    assert response.status_code == 403
    assert response.data["code"] == "delete_requires_creator"
    assert Task.objects.filter(pk=task.pk).exists(), "the row must survive"


def test_that_operator_retains_every_other_operation_on_it(operator_client, operator, supervisor):
    """Delete is narrower than read — not a general loss of access."""
    task = TaskFactory(created_by=supervisor, assignee=operator, status=TaskStatus.PENDING)
    assert operator_client.get(url(task)).status_code == 200
    assert operator_client.patch(url(task), {"title": "Renamed"}, format="json").status_code == 200
    assert operator_client.post(f"{url(task)}complete/", {}, format="json").status_code == 200


def test_a_supervisor_can_delete_a_task_they_did_not_create(supervisor_client, operator):
    task = TaskFactory(created_by=operator, assignee=operator)
    assert supervisor_client.delete(url(task)).status_code == 204


def test_the_refusal_is_403_not_404_because_the_row_is_already_visible(
    operator_client, operator, supervisor
):
    """Spec §7.2 rule 7: rule 5 withholds existence, and here nothing is withheld
    — the task is already in the Operator's queryset."""
    task = TaskFactory(created_by=supervisor, assignee=operator)
    assert operator_client.get(url(task)).status_code == 200
    assert operator_client.delete(url(task)).status_code == 403
