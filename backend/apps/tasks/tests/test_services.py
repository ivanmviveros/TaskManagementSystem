import logging
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.roles import Role
from apps.tasks.dto import TaskCreateInput, TaskUpdateInput
from apps.tasks.exceptions import (
    AssigneeNotAssignable,
    CompletionRequiresCompleteAction,
    InvalidStatusTransition,
    TaskNotFound,
)
from apps.tasks.models import Task, TaskStatus
from apps.tasks.services import TaskService
from apps.tasks.tests.fakes import FakeTaskRepository, RecordingDispatcher
from apps.users.models import User

# For transaction.atomic(), not for persistence — see Step 1, note 1.
pytestmark = pytest.mark.django_db


def make_user(role=Role.OPERATOR, email="person@example.com") -> User:
    return User(email=email, role=role, first_name="A", last_name="B")


def build(tasks=None):
    repository = FakeTaskRepository(tasks or [])
    dispatcher = RecordingDispatcher()
    return TaskService(tasks=repository, notifications=dispatcher), repository, dispatcher


def test_create_assigns_the_supplied_assignee():
    supervisor, operator = make_user(Role.SUPERVISOR), make_user(email="op@example.com")
    service, repository, _ = build()
    task = service.create(
        data=TaskCreateInput(title="Do it", description="", due_date=None, assignee=operator),
        actor=supervisor,
    )
    assert task.assignee == operator
    assert task.created_by == supervisor
    assert task.status == TaskStatus.PENDING
    assert repository.saved == [task]


def test_create_rejects_an_admin_assignee_at_the_service_layer():
    """D17 is re-checked here, not only in the serializer."""
    service, _, _ = build()
    with pytest.raises(AssigneeNotAssignable):
        service.create(
            data=TaskCreateInput(
                title="x",
                description="",
                due_date=None,
                assignee=make_user(Role.ADMIN, "admin@example.com"),
            ),
            actor=make_user(Role.SUPERVISOR),
        )


def test_create_notifies_the_new_assignee(django_capture_on_commit_callbacks):
    operator = make_user(email="op@example.com")
    service, _, dispatcher = build()
    with django_capture_on_commit_callbacks(execute=True):
        service.create(
            data=TaskCreateInput(title="x", description="", due_date=None, assignee=operator),
            actor=make_user(Role.SUPERVISOR),
        )
    assert dispatcher.events == ["task_assigned"]


def test_create_without_an_assignee_notifies_nobody(django_capture_on_commit_callbacks):
    service, _, dispatcher = build()
    with django_capture_on_commit_callbacks(execute=True):
        service.create(
            data=TaskCreateInput(title="x", description="", due_date=None, assignee=None),
            actor=make_user(Role.SUPERVISOR),
        )
    assert dispatcher.events == []


def test_update_of_title_only_notifies_nobody(django_capture_on_commit_callbacks):
    """Title and description edits are intentionally silent (spec §10.1)."""
    task = Task(title="Before", status=TaskStatus.PENDING, created_by=make_user(Role.SUPERVISOR))
    service, _, dispatcher = build([task])
    with django_capture_on_commit_callbacks(execute=True):
        service.update(
            task_id=task.pk, data=TaskUpdateInput(title="After"), actor=make_user(Role.SUPERVISOR)
        )
    assert dispatcher.events == []


def test_update_emits_one_event_per_meaningful_change(django_capture_on_commit_callbacks):
    operator = make_user(email="op@example.com")
    task = Task(title="t", status=TaskStatus.PENDING, created_by=make_user(Role.SUPERVISOR))
    service, _, dispatcher = build([task])
    with django_capture_on_commit_callbacks(execute=True):
        service.update(
            task_id=task.pk,
            data=TaskUpdateInput(
                assignee=operator,
                status=str(TaskStatus.IN_PROGRESS),
                due_date=timezone.now() + timedelta(days=1),
            ),
            actor=make_user(Role.SUPERVISOR),
        )
    assert sorted(dispatcher.events) == [
        "task_assigned",
        "task_due_date_changed",
        "task_status_changed",
    ]


def test_patching_status_to_completed_is_refused():
    """D18: one audited path to COMPLETED."""
    task = Task(title="t", status=TaskStatus.PENDING, created_by=make_user(Role.SUPERVISOR))
    service, _, _ = build([task])
    with pytest.raises(CompletionRequiresCompleteAction):
        service.update(
            task_id=task.pk,
            data=TaskUpdateInput(status=str(TaskStatus.COMPLETED)),
            actor=make_user(Role.SUPERVISOR),
        )


@pytest.mark.parametrize("terminal", [TaskStatus.COMPLETED, TaskStatus.CANCELLED])
def test_no_transition_leaves_a_terminal_status(terminal):
    """D19."""
    task = Task(
        title="t",
        status=terminal,
        created_by=make_user(Role.SUPERVISOR),
        completed_at=timezone.now() if terminal == TaskStatus.COMPLETED else None,
    )
    service, _, _ = build([task])
    with pytest.raises(InvalidStatusTransition):
        service.update(
            task_id=task.pk,
            data=TaskUpdateInput(status=str(TaskStatus.PENDING)),
            actor=make_user(Role.SUPERVISOR),
        )


def test_complete_sets_status_and_timestamp_together_and_locks_the_row(
    django_capture_on_commit_callbacks,
):
    task = Task(title="t", status=TaskStatus.IN_PROGRESS, created_by=make_user(Role.SUPERVISOR))
    service, repository, dispatcher = build([task])
    with django_capture_on_commit_callbacks(execute=True):
        completed = service.complete(task_id=task.pk, actor=make_user(Role.SUPERVISOR))
    assert completed.status == TaskStatus.COMPLETED
    assert completed.completed_at is not None
    assert repository.locked == [task.pk]
    assert dispatcher.events == ["task_status_changed"]


def test_completing_an_already_completed_task_conflicts():
    task = Task(
        title="t",
        status=TaskStatus.COMPLETED,
        completed_at=timezone.now(),
        created_by=make_user(Role.SUPERVISOR),
    )
    service, _, _ = build([task])
    with pytest.raises(InvalidStatusTransition):
        service.complete(task_id=task.pk, actor=make_user(Role.SUPERVISOR))


def test_operating_on_a_vanished_task_is_a_404():
    import uuid

    service, _, _ = build()
    with pytest.raises(TaskNotFound):
        service.complete(task_id=uuid.uuid7(), actor=make_user(Role.SUPERVISOR))


def test_delete_soft_deletes_and_records_the_actor():
    actor = make_user(Role.SUPERVISOR)
    task = Task(title="t", status=TaskStatus.PENDING, created_by=actor)
    service, repository, _ = build([task])
    service.delete(task=task, actor=actor)
    assert repository.deleted == [task]


class TestPartialUpdateSemantics:
    """D32. Each of these passes under a correct `model_fields_set` branch and
    fails under `if value:` or `if value is not None:` — which is the point."""

    def test_an_explicit_null_assignee_unassigns(self):
        operator = make_user(email="op@example.com")
        task = Task(title="t", status=TaskStatus.PENDING, assignee=operator)
        service, repository, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(assignee=None), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.assignee is None
        assert repository.saved == [task]

    def test_an_omitted_assignee_leaves_it_alone(self):
        operator = make_user(email="op@example.com")
        task = Task(title="t", status=TaskStatus.PENDING, assignee=operator)
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(title="new"), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.assignee == operator
        assert updated.title == "new"

    def test_an_explicit_null_due_date_clears_it(self):
        task = Task(title="t", status=TaskStatus.PENDING, due_date=timezone.now())
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(due_date=None), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.due_date is None

    def test_an_omitted_due_date_leaves_it_alone(self):
        due = timezone.now() + timedelta(days=3)
        task = Task(title="t", status=TaskStatus.PENDING, due_date=due)
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(title="new"), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.due_date == due

    def test_a_dto_with_no_fields_set_changes_nothing(self):
        due = timezone.now()
        task = Task(title="t", status=TaskStatus.PENDING, due_date=due)
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(), actor=make_user(Role.SUPERVISOR)
        )
        assert (updated.title, updated.due_date, updated.status) == ("t", due, TaskStatus.PENDING)


def test_the_update_log_records_field_names_never_values(caplog):
    """backend §28: field NAMES only.

    This test exists for one specific hazard: `sorted(data)` on a dict yields
    keys, but a pydantic model iterates as (name, value) PAIRS. Leaving that
    expression unchanged would write task titles and descriptions into the
    audit log, and no other test would notice.
    """
    task = Task(title="old", status=TaskStatus.PENDING)
    service, _, _ = build([task])
    with caplog.at_level(logging.INFO, logger="apps.tasks.services"):
        service.update(
            task_id=task.pk,
            data=TaskUpdateInput(title="Acquisition of Northwind", description="confidential"),
            actor=make_user(Role.SUPERVISOR),
        )
    logged = next(
        r.getMessage() for r in caplog.records if r.getMessage().startswith("task.updated")
    )
    assert "'description'" in logged and "'title'" in logged
    assert "Acquisition of Northwind" not in logged
    assert "confidential" not in logged
