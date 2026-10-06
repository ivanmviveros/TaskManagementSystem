from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/tasks/stats/"


def test_stats_shape(supervisor_client):
    response = supervisor_client.get(URL)
    assert response.status_code == 200
    assert set(response.data) == {"total", "by_status", "overdue", "due_next_7_days"}
    assert set(response.data["by_status"]) == {
        "PENDING",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
    }


def test_stats_are_scoped_the_same_way_as_the_list(operator_client, operator):
    TaskFactory(assignee=operator)
    TaskFactory()
    assert operator_client.get(URL).data["total"] == 1


def test_stats_counts_match_the_data(supervisor_client):
    now = timezone.now()
    TaskFactory(status=TaskStatus.PENDING, due_date=now - timedelta(days=1))
    TaskFactory(status=TaskStatus.IN_PROGRESS, due_date=now + timedelta(days=2))
    data = supervisor_client.get(URL).data
    assert data["total"] == 2
    assert data["overdue"] == 1
    assert data["due_next_7_days"] == 1


def test_stats_excludes_soft_deleted_tasks(supervisor_client):
    task = TaskFactory()
    task.soft_delete()
    assert supervisor_client.get(URL).data["total"] == 0
