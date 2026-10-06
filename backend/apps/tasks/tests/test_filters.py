from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tasks.filters import TaskFilterSet
from apps.tasks.models import Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def filtered(params):
    return TaskFilterSet(params, queryset=Task.objects.all()).qs


@pytest.fixture
def spread():
    now = timezone.now()
    return {
        "past_open": TaskFactory(due_date=now - timedelta(days=2), status=TaskStatus.PENDING),
        "soon": TaskFactory(due_date=now + timedelta(days=3), status=TaskStatus.IN_PROGRESS),
        "far": TaskFactory(due_date=now + timedelta(days=90), status=TaskStatus.PENDING),
        "undated": TaskFactory(due_date=None, status=TaskStatus.PENDING),
        "past_done": TaskFactory(
            due_date=now - timedelta(days=5), status=TaskStatus.COMPLETED, completed_at=now
        ),
        "past_cancelled": TaskFactory(
            due_date=now - timedelta(days=5), status=TaskStatus.CANCELLED
        ),
    }


def test_status_accepts_multiple_values(spread):
    result = filtered({"status": [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]})
    assert set(result) == {spread["past_open"], spread["soon"], spread["far"], spread["undated"]}


def test_due_date_range_filters(spread):
    now = timezone.now()
    after = filtered({"due_date_after": (now + timedelta(days=1)).isoformat()})
    assert set(after) == {spread["soon"], spread["far"]}
    before = filtered({"due_date_before": now.isoformat()})
    assert set(before) == {spread["past_open"], spread["past_done"], spread["past_cancelled"]}
    assert spread["undated"] not in before, "due_date__lte excludes nulls automatically"


def test_overdue_true_finds_only_open_past_due_tasks(spread):
    assert set(filtered({"overdue": "true"})) == {spread["past_open"]}


def test_overdue_false_includes_undated_and_terminal_tasks(spread):
    """Undated and terminal tasks are both "not overdue".

    Verified against the alternative: a bare `.exclude()` also passes this, because
    Django adds `AND due_date IS NOT NULL` inside the negated group. So this pins
    the behaviour, not a specific implementation — see the note in filters.py.
    """
    result = set(filtered({"overdue": "false"}))
    assert spread["undated"] in result
    assert spread["past_done"] in result
    assert spread["past_cancelled"] in result
    assert spread["past_open"] not in result


def test_overdue_true_and_false_partition_the_queryset_exactly(spread):
    everything = set(Task.objects.all())
    yes, no = set(filtered({"overdue": "true"})), set(filtered({"overdue": "false"}))
    assert yes | no == everything
    assert yes & no == set()


def test_assignee_filter(spread):
    target = spread["soon"]
    assert set(filtered({"assignee": str(target.assignee_id)})) == {target}


def test_filters_combine(spread):
    now = timezone.now()
    result = filtered(
        {
            "status": [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
            "due_date_after": now.isoformat(),
            "due_date_before": (now + timedelta(days=7)).isoformat(),
        }
    )
    assert set(result) == {spread["soon"]}, "the due-soon tile's exact predicate"
