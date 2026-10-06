"""Persistence boundary for Task — the only module in this app that touches the ORM."""

from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from django.utils import timezone

from apps.tasks.models import Task
from apps.users.models import User


@runtime_checkable
class TaskRepository(Protocol):
    """What a service may ask of task storage."""

    @abstractmethod
    def get(self, task_id: UUID) -> Task | None: ...

    @abstractmethod
    def get_for_update(self, task_id: UUID) -> Task | None:
        """Row-locked fetch, for transitions that must not interleave."""

    @abstractmethod
    def add(self, task: Task) -> Task: ...

    @abstractmethod
    def save(self, task: Task) -> Task: ...

    @abstractmethod
    def soft_delete(self, task: Task, *, by: User) -> None: ...


class DjangoTaskRepository(TaskRepository):
    """ORM-backed TaskRepository."""

    def get(self, task_id: UUID) -> Task | None:
        return Task.objects.filter(pk=task_id).first()

    def get_for_update(self, task_id: UUID) -> Task | None:
        # The concurrency guard TaskService.complete depends on. Must run inside
        # transaction.atomic() or Postgres raises.
        return Task.objects.select_for_update().filter(pk=task_id).first()

    def add(self, task: Task) -> Task:
        task.save()
        return task

    def save(self, task: Task) -> Task:
        task.save()
        return task

    def soft_delete(self, task: Task, *, by: User) -> None:
        task.deleted_at = timezone.now()
        task.deleted_by = by
        task.save(update_fields=["deleted_at", "deleted_by"])
