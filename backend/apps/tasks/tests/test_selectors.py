from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tasks.dto import TaskStatsOutput
from apps.tasks.models import TaskStatus
from apps.tasks.selectors import overdue_candidates, scoped_tasks, task_stats
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db


def test_supervisor_sees_every_live_task():
    TaskFactory.create_batch(3)
    assert scoped_tasks(SupervisorFactory()).count() == 3


def test_operator_sees_only_tasks_assigned_to_them():
    operator = OperatorFactory()
    TaskFactory(assignee=operator)
    TaskFactory()  # someone else's
    assert scoped_tasks(operator).count() == 1


def test_a_task_an_operator_created_but_no_longer_holds_is_invisible():
    """The direct test of D14: created_by grants no visibility whatsoever."""
    operator = OperatorFactory()
    TaskFactory(created_by=operator, assignee=OperatorFactory())
    assert scoped_tasks(operator).count() == 0


def test_admin_scope_is_empty():
    """Belt and braces: the permission layer already answers 403 (D13)."""
    TaskFactory()
    assert scoped_tasks(AdminFactory()).count() == 0


def test_soft_deleted_tasks_are_excluded_from_every_scope():
    task = TaskFactory()
    task.soft_delete()
    assert scoped_tasks(SupervisorFactory()).count() == 0


def test_overdue_candidates_finds_only_live_non_terminal_past_due_tasks():
    past, future = timezone.now() - timedelta(days=1), timezone.now() + timedelta(days=1)
    wanted = TaskFactory(due_date=past, status=TaskStatus.PENDING)
    TaskFactory(due_date=future, status=TaskStatus.PENDING)
    TaskFactory(due_date=past, status=TaskStatus.CANCELLED)
    TaskFactory(due_date=past, status=TaskStatus.COMPLETED, completed_at=timezone.now())
    TaskFactory(due_date=None, status=TaskStatus.PENDING)
    deleted = TaskFactory(due_date=past, status=TaskStatus.PENDING)
    deleted.soft_delete()

    rows = list(overdue_candidates())
    assert [row[0] for row in rows] == [wanted.pk]
    assert len(rows[0]) == 4, "id, assignee_id, created_by_id, created_by__role"


def test_stats_matches_the_response_contract(django_assert_num_queries):
    supervisor = SupervisorFactory()
    now = timezone.now()
    TaskFactory(status=TaskStatus.PENDING, due_date=now - timedelta(days=2))
    TaskFactory(status=TaskStatus.IN_PROGRESS, due_date=now + timedelta(days=3))
    TaskFactory(status=TaskStatus.COMPLETED, completed_at=now)
    TaskFactory(status=TaskStatus.CANCELLED)

    with django_assert_num_queries(1):
        stats = task_stats(supervisor)

    assert stats.total == 4
    assert stats.by_status == {
        "PENDING": 1,
        "IN_PROGRESS": 1,
        "COMPLETED": 1,
        "CANCELLED": 1,
    }
    assert stats.overdue == 1
    assert stats.due_next_7_days == 1


def test_due_next_7_days_excludes_terminal_and_undated_tasks():
    """The figure the dashboard tile links against (spec §11.5)."""
    now = timezone.now()
    TaskFactory(status=TaskStatus.COMPLETED, completed_at=now, due_date=now + timedelta(days=2))
    TaskFactory(status=TaskStatus.PENDING, due_date=None)
    assert task_stats(SupervisorFactory()).due_next_7_days == 0


def test_task_stats_returns_a_typed_model(supervisor):
    stats = task_stats(supervisor)
    assert isinstance(stats, TaskStatsOutput)
    # The dashboard contract does not move: the dict the view puts on the wire
    # is unchanged, which is what keeps the drf-spectacular annotation honest.
    assert set(stats.model_dump()) == {"total", "by_status", "overdue", "due_next_7_days"}
