"""pytest-django wraps each test in a transaction that is rolled back rather than
committed, so transaction.on_commit callbacks NEVER fire by default — every
"an email was enqueued" assertion would fail for a reason unrelated to the code
under test. Hence django_capture_on_commit_callbacks(execute=True)."""

import pytest
from django.core import mail
from django.db import transaction

from apps.notifications.models import Notification, NotificationEvent
from apps.tasks.dto import TaskCreateInput
from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.tasks.views import TaskViewSet
from apps.users.tests.factories import OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/tasks/"


def test_the_composition_root_uses_the_celery_dispatcher():
    """A silently-null dispatcher is exactly the kind of thing that ships
    unnoticed, so the swap from Task 24's placeholder is asserted."""
    from apps.notifications.dispatchers import CeleryNotificationDispatcher
    from apps.tasks.repositories import DjangoTaskRepository

    service = TaskViewSet().get_service()
    assert isinstance(service._notifications, CeleryNotificationDispatcher)
    assert isinstance(service._tasks, DjangoTaskRepository)


def test_the_null_dispatcher_is_gone():
    import apps.notifications.dispatchers as module

    assert not hasattr(module, "NullNotificationDispatcher")


def test_assignment_emails_exactly_the_new_assignee(
    supervisor_client, django_capture_on_commit_callbacks
):
    assignee = OperatorFactory()
    with django_capture_on_commit_callbacks(execute=True):
        response = supervisor_client.post(
            URL, {"title": "Assigned", "assignee": str(assignee.pk)}, format="json"
        )
    assert response.status_code == 201
    assert [message.to for message in mail.outbox] == [[assignee.email]]
    assert Notification.objects.get().event == NotificationEvent.ASSIGNED


def test_a_status_change_emails_the_assignee_and_the_creator(
    supervisor_client, supervisor, django_capture_on_commit_callbacks
):
    assignee = OperatorFactory()
    task = TaskFactory(created_by=supervisor, assignee=assignee, status=TaskStatus.PENDING)
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.patch(
            f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json"
        )
    # The actor is the supervisor/creator, so they are suppressed.
    assert [message.to for message in mail.outbox] == [[assignee.email]]


def test_an_operator_creator_who_no_longer_holds_the_task_is_not_emailed(
    supervisor_client, django_capture_on_commit_callbacks
):
    """D26."""
    original_creator = OperatorFactory()
    current_assignee = OperatorFactory()
    task = TaskFactory(
        created_by=original_creator, assignee=current_assignee, status=TaskStatus.PENDING
    )
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.patch(
            f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json"
        )
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {current_assignee.email}
    assert original_creator.email not in recipients


def test_a_supervisor_creator_is_emailed(
    operator_client, operator, django_capture_on_commit_callbacks
):
    creator = SupervisorFactory()
    task = TaskFactory(created_by=creator, assignee=operator, status=TaskStatus.PENDING)
    with django_capture_on_commit_callbacks(execute=True):
        operator_client.patch(f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json")
    recipients = {address for message in mail.outbox for address in message.to}
    assert creator.email in recipients
    assert operator.email not in recipients, "the actor is never emailed"


def test_a_title_only_edit_enqueues_nothing(supervisor_client, django_capture_on_commit_callbacks):
    task = TaskFactory()
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.patch(f"{URL}{task.pk}/", {"title": "Renamed"}, format="json")
    assert mail.outbox == []


def test_completion_emails_the_creator(supervisor_client, django_capture_on_commit_callbacks):
    creator = SupervisorFactory()
    assignee = OperatorFactory()
    task = TaskFactory(created_by=creator, assignee=assignee, status=TaskStatus.IN_PROGRESS)
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.post(f"{URL}{task.pk}/complete/", {}, format="json")
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {creator.email, assignee.email}


@pytest.mark.django_db(transaction=True)
def test_nothing_is_enqueued_when_the_surrounding_transaction_rolls_back():
    """The guard for spec §10.3a. A later contributor adding a notification with
    a bare .delay() would break this and nothing else."""
    from apps.notifications.dispatchers import CeleryNotificationDispatcher
    from apps.tasks.repositories import DjangoTaskRepository
    from apps.tasks.services import TaskService

    creator, assignee = SupervisorFactory(), OperatorFactory()
    service = TaskService(
        tasks=DjangoTaskRepository(), notifications=CeleryNotificationDispatcher()
    )
    mail.outbox.clear()

    class Rollback(Exception):
        pass

    with pytest.raises(Rollback), transaction.atomic():
        service.create(
            data=TaskCreateInput(title="Doomed", description="", due_date=None, assignee=assignee),
            actor=creator,
        )
        raise Rollback

    assert mail.outbox == []
    assert Notification.objects.count() == 0
