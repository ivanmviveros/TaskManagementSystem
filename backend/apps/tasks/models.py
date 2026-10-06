"""The Task entity, its status vocabulary, and the transition map.

TRANSITIONS is module-level data consumed by BOTH the service and its tests, so
the rule and its enforcement cannot drift.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.models import SoftDeleteModel, TimeStampedModel


class TaskStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    IN_PROGRESS = "IN_PROGRESS", "In progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


# str(TaskStatus.X) is the status value — Django's Choices.__str__ returns it. Written
# that way rather than bare member references because, without django-stubs, mypy reads
# a TextChoices member as the `tuple[str, str]` literal in the class body and would
# reject every annotation below. The members themselves ARE strs at runtime, so this
# changes nothing but the inferred type.
#: Statuses a task can still move out of, and which count toward "overdue".
OPEN_STATUSES: tuple[str, ...] = (str(TaskStatus.PENDING), str(TaskStatus.IN_PROGRESS))
#: Terminal statuses (D19). Reopening is a documented future extension.
TERMINAL_STATUSES: tuple[str, ...] = (str(TaskStatus.COMPLETED), str(TaskStatus.CANCELLED))

#: Transitions reachable by PATCH. COMPLETED is absent from every value on
#: purpose: POST /tasks/{id}/complete/ is the only path to it (D18), which is
#: what guarantees completed_at is always set alongside the status.
TRANSITIONS: dict[str, frozenset[str]] = {
    str(TaskStatus.PENDING): frozenset({str(TaskStatus.IN_PROGRESS), str(TaskStatus.CANCELLED)}),
    str(TaskStatus.IN_PROGRESS): frozenset({str(TaskStatus.PENDING), str(TaskStatus.CANCELLED)}),
    str(TaskStatus.COMPLETED): frozenset(),
    str(TaskStatus.CANCELLED): frozenset(),
}


class Task(SoftDeleteModel, TimeStampedModel):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=TaskStatus.choices, default=TaskStatus.PENDING)
    # DateTimeField, not DateField: the hourly sweep compares to timezone.now(),
    # which needs a time of day (D23). Nullable — a task may have no deadline.
    due_date = models.DateTimeField(null=True, blank=True)
    # Grants visibility (D14).
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assigned_tasks",
    )
    # Grants NO visibility, but gates delete (D27) and shapes recipients (D26).
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_tasks",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        # Deliberately NO Meta.ordering: ordering is applied per queryset so
        # pagination determinism is a conscious choice (spec §8.3).
        constraints = [
            models.CheckConstraint(
                condition=Q(status=TaskStatus.COMPLETED, completed_at__isnull=False)
                | (~Q(status=TaskStatus.COMPLETED) & Q(completed_at__isnull=True)),
                name="task_completed_at_matches_status",
            )
        ]
        # Every index is partial, scoped to live rows only.
        indexes = [
            models.Index(
                fields=["status", "due_date"],
                condition=Q(deleted_at__isnull=True),
                name="task_status_due_live_idx",
            ),
            models.Index(
                fields=["assignee", "status"],
                condition=Q(deleted_at__isnull=True),
                name="task_assignee_status_live_idx",
            ),
            models.Index(
                fields=["due_date"],
                condition=Q(deleted_at__isnull=True),
                name="task_due_live_idx",
            ),
            models.Index(fields=["deleted_at"], name="task_deleted_at_idx"),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def is_overdue(self) -> bool:
        """Computed from already-loaded data, so serializing it adds no query.
        Filtering uses the equivalent database Q() in TaskFilterSet."""
        return (
            self.due_date is not None
            and self.status in OPEN_STATUSES
            and self.due_date < timezone.now()
        )
