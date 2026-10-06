"""Task use cases — the only path that mutates a Task.

Imports the TaskRepository and NotificationDispatcher Protocols, never a concrete
implementation of either; the view supplies both (spec §5.2.2). A test in
apps/core/tests asserts this module names no Django*Repository.
"""

import logging
from functools import partial
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.core.roles import Role
from apps.notifications.dispatchers import NotificationDispatcher
from apps.tasks.exceptions import (
    AssigneeNotAssignable,
    CompletionRequiresCompleteAction,
    InvalidStatusTransition,
    TaskNotFound,
)
from apps.tasks.models import OPEN_STATUSES, TRANSITIONS, Task, TaskStatus
from apps.tasks.repositories import TaskRepository  # the Protocol, and that is all
from apps.users.models import User

logger = logging.getLogger(__name__)

_MUTABLE_FIELDS = ("title", "description", "due_date", "assignee", "status")


class TaskService:
    def __init__(self, *, tasks: TaskRepository, notifications: NotificationDispatcher):
        self._tasks = tasks
        self._notifications = notifications

    # ---------- use cases ----------

    def create(self, *, data: dict, actor: User) -> Task:
        assignee = data.get("assignee")
        self._reject_admin_assignee(assignee)
        task = Task(
            title=data["title"],
            description=data.get("description", ""),
            due_date=data.get("due_date"),
            assignee=assignee,
            created_by=actor,
            status=TaskStatus.PENDING,
        )
        with transaction.atomic():
            self._tasks.add(task)
            if assignee is not None:
                self._enqueue("task_assigned", task, actor)
        logger.info("task.created id=%s by=%s assignee=%s", task.pk, actor.pk, task.assignee_id)
        return task

    def update(self, *, task_id: UUID, data: dict, actor: User) -> Task:
        with transaction.atomic():
            task = self._tasks.get_for_update(task_id)
            if task is None:
                raise TaskNotFound
            before = (task.assignee_id, task.status, task.due_date)

            if "status" in data and data["status"] != task.status:
                self._validate_transition(task.status, data["status"])
            if "assignee" in data:
                self._reject_admin_assignee(data["assignee"])

            for field in _MUTABLE_FIELDS:
                if field in data:
                    setattr(task, field, data[field])
            self._tasks.save(task)

            assignee_changed = task.assignee_id != before[0] and task.assignee_id is not None
            if assignee_changed:
                self._enqueue("task_assigned", task, actor)
            if task.status != before[1]:
                self._enqueue("task_status_changed", task, actor)
            if task.due_date != before[2]:
                self._enqueue("task_due_date_changed", task, actor)

        logger.info("task.updated id=%s fields=%s by=%s", task.pk, sorted(data), actor.pk)
        return task

    def complete(self, *, task_id: UUID, actor: User) -> Task:
        with transaction.atomic():
            task = self._tasks.get_for_update(task_id)
            if task is None:
                raise TaskNotFound
            if task.status not in OPEN_STATUSES:
                raise InvalidStatusTransition
            task.status = TaskStatus.COMPLETED
            task.completed_at = timezone.now()
            self._tasks.save(task)
            self._enqueue("task_status_changed", task, actor)
        logger.info("task.completed id=%s by=%s", task.pk, actor.pk)
        return task

    def delete(self, *, task: Task, actor: User) -> None:
        with transaction.atomic():
            self._tasks.soft_delete(task, by=actor)
        logger.info("task.soft_deleted id=%s by=%s", task.pk, actor.pk)

    # ---------- rules ----------

    @staticmethod
    def _validate_transition(current: str, requested: str) -> None:
        if requested == TaskStatus.COMPLETED:
            raise CompletionRequiresCompleteAction
        if requested not in TRANSITIONS[current]:
            raise InvalidStatusTransition

    @staticmethod
    def _reject_admin_assignee(assignee: User | None) -> None:
        """D17, re-checked here as well as in the serializer. Not expressible as a
        CheckConstraint — it is a cross-table assertion."""
        if assignee is not None and assignee.role == Role.ADMIN:
            raise AssigneeNotAssignable

    # ---------- enqueue ----------

    def _enqueue(self, method_name: str, task: Task, actor: User) -> None:
        """Always through transaction.on_commit.

        Calling .delay() inside atomic() can deliver the message to a worker
        BEFORE the transaction commits, so the worker reads a row that does not
        yet exist, or a pre-update version (spec §10.3a). Services enqueue; views
        never do.
        """
        history_id = self._latest_history_id(task)
        send = getattr(self._notifications, method_name)
        # functools.partial, not a lambda: a lambda in a loop captures by
        # reference and every callback would fire with the last iteration's values.
        transaction.on_commit(
            partial(send, task_id=task.pk, history_id=history_id, actor_id=actor.pk)
        )

    @staticmethod
    def _latest_history_id(task: Task) -> int | None:
        """The simple-history record id for the change just written, which ties
        each email to the exact audited change that caused it (spec §10.3b).

        Returns None when there is no history row — which only happens with a
        fake repository in a unit test, never against the ORM.
        """
        record = task.history.first() if task.pk and hasattr(task, "history") else None
        return record.history_id if record is not None else None
