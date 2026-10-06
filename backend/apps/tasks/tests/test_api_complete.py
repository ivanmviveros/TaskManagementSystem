import pytest

from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def url(task):
    return f"/api/v1/tasks/{task.pk}/complete/"


def test_complete_sets_status_and_timestamp_together(supervisor_client):
    task = TaskFactory(status=TaskStatus.IN_PROGRESS)
    response = supervisor_client.post(url(task), {}, format="json")
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.status == TaskStatus.COMPLETED
    assert task.completed_at is not None


def test_completing_an_already_completed_task_is_409(supervisor_client):
    from django.utils import timezone

    task = TaskFactory(status=TaskStatus.COMPLETED, completed_at=timezone.now())
    response = supervisor_client.post(url(task), {}, format="json")
    assert response.status_code == 409
    assert response.data["code"] == "invalid_status_transition"


def test_an_operator_can_complete_their_assigned_task(operator_client, operator):
    task = TaskFactory(assignee=operator, status=TaskStatus.PENDING)
    assert supervisor_or_operator_ok(operator_client.post(url(task), {}, format="json"))


def supervisor_or_operator_ok(response):
    assert response.status_code == 200
    return True


def test_an_operator_cannot_complete_someone_elses_task(operator_client):
    task = TaskFactory(status=TaskStatus.PENDING)
    assert operator_client.post(url(task), {}, format="json").status_code == 404
