"""In-memory task repository and a recording dispatcher, for service unit tests.
Neither inherits its Protocol — conformance is asserted structurally."""

from uuid import UUID

from apps.tasks.models import Task
from apps.users.models import User


class FakeTaskRepository:
    def __init__(self, tasks: list[Task] | None = None):
        self._tasks = {t.pk: t for t in (tasks or [])}
        self.saved: list[Task] = []
        self.deleted: list[Task] = []
        self.locked: list[UUID] = []

    def get(self, task_id: UUID) -> Task | None:
        return self._tasks.get(task_id)

    def get_for_update(self, task_id: UUID) -> Task | None:
        self.locked.append(task_id)
        return self._tasks.get(task_id)

    def add(self, task: Task) -> Task:
        self._tasks[task.pk] = task
        self.saved.append(task)
        return task

    def save(self, task: Task) -> Task:
        self._tasks[task.pk] = task
        self.saved.append(task)
        return task

    def soft_delete(self, task: Task, *, by: User) -> None:
        self.deleted.append(task)


class RecordingDispatcher:
    """Records the notification calls a service made, in order."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def task_assigned(self, **kwargs) -> None:
        self.calls.append(("task_assigned", kwargs))

    def task_status_changed(self, **kwargs) -> None:
        self.calls.append(("task_status_changed", kwargs))

    def task_due_date_changed(self, **kwargs) -> None:
        self.calls.append(("task_due_date_changed", kwargs))

    @property
    def events(self) -> list[str]:
        return [name for name, _ in self.calls]
