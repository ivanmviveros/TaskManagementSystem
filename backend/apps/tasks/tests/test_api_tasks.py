import pytest

from apps.tasks.models import Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/tasks/"


def test_unauthenticated_is_401(api_client):
    assert api_client.get(URL).status_code == 401


def test_operator_list_shows_only_their_assigned_tasks(operator_client, operator):
    mine = TaskFactory(assignee=operator)
    TaskFactory()
    response = operator_client.get(URL)
    assert response.status_code == 200
    assert [row["id"] for row in response.data["results"]] == [str(mine.pk)]


def test_an_operator_who_created_but_no_longer_holds_a_task_gets_404(operator_client, operator):
    """The direct test of D14."""
    orphaned = TaskFactory(created_by=operator, assignee=OperatorFactory())
    assert operator_client.get(f"{URL}{orphaned.pk}/").status_code == 404


def test_supervisor_sees_every_task(supervisor_client):
    TaskFactory.create_batch(3)
    assert supervisor_client.get(URL).data["count"] == 3


def test_supervisor_creates_a_task_for_anyone(supervisor_client, supervisor):
    assignee = OperatorFactory()
    response = supervisor_client.post(
        URL, {"title": "Assigned work", "assignee": str(assignee.pk)}, format="json"
    )
    assert response.status_code == 201
    assert response.data["assignee"]["id"] == str(assignee.pk)
    assert response.data["created_by"]["id"] == str(supervisor.pk)
    assert response.data["status"] == TaskStatus.PENDING


def test_operator_create_without_assignee_self_assigns(operator_client, operator):
    response = operator_client.post(URL, {"title": "Mine"}, format="json")
    assert response.status_code == 201
    assert response.data["assignee"]["id"] == str(operator.pk)


def test_operator_create_for_someone_else_is_400_assignee_immutable(operator_client):
    response = operator_client.post(
        URL, {"title": "Theirs", "assignee": str(OperatorFactory().pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "assignee_immutable"


def test_operator_update_of_assignee_is_400_assignee_immutable(operator_client, operator):
    task = TaskFactory(assignee=operator)
    response = operator_client.patch(
        f"{URL}{task.pk}/", {"assignee": str(OperatorFactory().pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "assignee_immutable"


def test_supervisor_assigning_to_an_admin_is_400_assignee_not_assignable(supervisor_client):
    from apps.users.tests.factories import AdminFactory

    response = supervisor_client.post(
        URL, {"title": "x", "assignee": str(AdminFactory().pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "assignee_not_assignable"


def test_operator_updates_their_own_task(operator_client, operator):
    task = TaskFactory(assignee=operator, status=TaskStatus.PENDING)
    response = operator_client.patch(
        f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json"
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.status == TaskStatus.IN_PROGRESS


def test_patching_status_to_completed_is_400_use_complete_action(supervisor_client):
    task = TaskFactory(status=TaskStatus.PENDING)
    response = supervisor_client.patch(
        f"{URL}{task.pk}/", {"status": TaskStatus.COMPLETED}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "use_complete_action"


def test_leaving_a_terminal_status_is_409(supervisor_client):
    task = TaskFactory(status=TaskStatus.CANCELLED)
    response = supervisor_client.patch(
        f"{URL}{task.pk}/", {"status": TaskStatus.PENDING}, format="json"
    )
    assert response.status_code == 409
    assert response.data["code"] == "invalid_status_transition"


def test_supervisor_delete_is_a_soft_delete(supervisor_client, supervisor):
    task = TaskFactory()
    assert supervisor_client.delete(f"{URL}{task.pk}/").status_code == 204
    assert not Task.objects.filter(pk=task.pk).exists()
    assert Task.all_objects.get(pk=task.pk).deleted_by == supervisor


def test_a_soft_deleted_task_is_absent_from_list_and_detail(supervisor_client):
    task = TaskFactory()
    task.soft_delete()
    assert supervisor_client.get(URL).data["count"] == 0
    assert supervisor_client.get(f"{URL}{task.pk}/").status_code == 404


def test_a_malformed_id_returns_404_without_a_database_lookup(supervisor_client):
    assert supervisor_client.get(f"{URL}not-a-uuid/").status_code == 404


def test_pagination_is_stable_when_ordering_by_a_non_unique_field(supervisor_client):
    from datetime import timedelta

    from django.utils import timezone

    same_due = timezone.now() + timedelta(days=5)
    TaskFactory.create_batch(10, due_date=same_due)
    page1 = supervisor_client.get(f"{URL}?ordering=due_date&page_size=5").data["results"]
    page2 = supervisor_client.get(f"{URL}?ordering=due_date&page_size=5&page=2").data["results"]
    ids = [row["id"] for row in page1 + page2]
    assert len(set(ids)) == 10, "a non-unique sort key must still be tiebroken by -id"
