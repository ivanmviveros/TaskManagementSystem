import uuid
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.utils import timezone

from apps.tasks.models import TRANSITIONS, Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory

pytestmark = pytest.mark.django_db


def test_task_gets_a_uuid7_primary_key():
    assert uuid.UUID(str(TaskFactory().pk)).version == 7


def test_completed_at_must_accompany_a_completed_status():
    """The DB is the final boundary: this must fail even from a direct ORM write,
    the Django admin, or a data migration (D18)."""
    with pytest.raises(IntegrityError), transaction.atomic():
        TaskFactory(status=TaskStatus.COMPLETED, completed_at=None)


def test_completed_at_must_be_null_for_any_other_status():
    with pytest.raises(IntegrityError), transaction.atomic():
        TaskFactory(status=TaskStatus.PENDING, completed_at=timezone.now())


def test_completed_task_with_a_timestamp_is_accepted():
    task = TaskFactory(status=TaskStatus.COMPLETED, completed_at=timezone.now())
    assert task.completed_at is not None


def test_protect_prevents_hard_deleting_a_user_who_holds_tasks():
    """Nothing is ever hard-deleted, so this should never fire — and if it does
    it must fail loudly rather than silently null an audit record (D25)."""
    holder = OperatorFactory()
    TaskFactory(assignee=holder, created_by=holder)
    with pytest.raises(ProtectedError):
        type(holder).all_objects.filter(pk=holder.pk).delete()


def test_is_overdue_is_a_property_computed_from_loaded_data():
    past = timezone.now() - timedelta(days=1)
    assert TaskFactory(due_date=past, status=TaskStatus.PENDING).is_overdue is True
    assert TaskFactory(due_date=None, status=TaskStatus.PENDING).is_overdue is False
    assert (
        TaskFactory(
            due_date=past, status=TaskStatus.COMPLETED, completed_at=timezone.now()
        ).is_overdue
        is False
    )
    assert "is_overdue" not in {f.name for f in Task._meta.get_fields()}


def test_terminal_statuses_have_no_outgoing_transitions():
    assert TRANSITIONS[TaskStatus.COMPLETED] == frozenset()
    assert TRANSITIONS[TaskStatus.CANCELLED] == frozenset()


def test_completed_is_not_reachable_by_any_patch_transition():
    """D18: POST /complete/ is the only path to COMPLETED."""
    for reachable in TRANSITIONS.values():
        assert TaskStatus.COMPLETED not in reachable


def test_a_soft_deleted_task_is_invisible_to_the_default_manager():
    task = TaskFactory()
    task.soft_delete()
    assert not Task.objects.filter(pk=task.pk).exists()
    assert Task.all_objects.filter(pk=task.pk).exists()


def test_history_records_the_soft_delete_as_an_update():
    task = TaskFactory()
    task.soft_delete()
    latest = Task.all_objects.get(pk=task.pk).history.first()
    assert latest.history_type == "~"
    assert isinstance(latest.history_id, int)
