"""Reusable task reads: role scoping, the sweep candidate query, and aggregation.

Owns "which rows, under what rules" — never eager loading. The viewset chains
.select_related(...) per action because eager loading follows the SERIALIZER in
use (spec §8.6), which keeps this module reusable by the sweep and by task_stats,
neither of which wants a join at all.
"""

from datetime import timedelta
from typing import Any
from uuid import UUID

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from apps.core.roles import Role
from apps.tasks.models import OPEN_STATUSES, Task, TaskStatus
from apps.users.models import User


def scoped_tasks(user: User) -> QuerySet[Task]:
    """Rows that exist from `user`'s perspective (D13, D14).

    This is what makes list visibility correct AND makes a detail request for a
    non-participant return 404 rather than 403 — list and detail cannot disagree
    because they read the same queryset.
    """
    if user.role == Role.SUPERVISOR:
        return Task.objects.all()
    if user.role == Role.OPERATOR:
        # assignee only. created_by grants no visibility (D14).
        return Task.objects.filter(assignee=user)
    return Task.objects.none()


def overdue_candidates():
    """Live, non-terminal, past-due tasks, as plain tuples.

    values_list(...).iterator() means a large backlog never materialises as model
    instances. created_by__role is joined because the recipient read-access gate
    (D26) needs it; it is one extra column on a query that already runs.
    Served by the ("status", "due_date") partial index.
    """
    return (
        Task.objects.filter(status__in=OPEN_STATUSES, due_date__lt=timezone.now())
        .values_list("id", "assignee_id", "created_by_id", "created_by__role")
        .iterator()
    )


def notification_target(task_id: UUID) -> tuple[UUID | None, UUID, str] | None:
    """(assignee_id, created_by_id, created_by__role) for recipient resolution.

    One query, no model instances. Lives here rather than in the dispatcher
    because spec §16.2 treats a raw ORM call outside a repository or selector as
    a defect.
    """
    return (
        Task.objects.filter(pk=task_id)
        .values_list("assignee_id", "created_by_id", "created_by__role")
        .first()
    )


def task_stats(user: User) -> dict[str, Any]:
    """The GET /tasks/stats/ payload, in ONE database round trip.

    Returns the finished nested shape rather than a queryset: aggregation is the
    one read this module owns end to end, and reshaping it in the view would put
    arithmetic back in the HTTP layer.

    `Count(filter=Q(...))` compiles to COUNT(*) FILTER (WHERE ...) on Postgres —
    the same single aggregate as a conditional Case/When, expressed directly.
    """
    now = timezone.now()
    horizon = now + timedelta(days=7)
    still_open = Q(status__in=OPEN_STATUSES)

    aggregated = scoped_tasks(user).aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status=TaskStatus.PENDING)),
        in_progress=Count("id", filter=Q(status=TaskStatus.IN_PROGRESS)),
        completed=Count("id", filter=Q(status=TaskStatus.COMPLETED)),
        cancelled=Count("id", filter=Q(status=TaskStatus.CANCELLED)),
        overdue=Count("id", filter=Q(due_date__lt=now) & still_open),
        # Excludes nulls AND terminal statuses, so the dashboard tile's
        # drill-through link in spec §11.5 can reproduce this number exactly.
        due_next_7_days=Count(
            "id", filter=Q(due_date__gte=now, due_date__lte=horizon) & still_open
        ),
    )
    return {
        "total": aggregated["total"],
        "by_status": {
            str(TaskStatus.PENDING): aggregated["pending"],
            str(TaskStatus.IN_PROGRESS): aggregated["in_progress"],
            str(TaskStatus.COMPLETED): aggregated["completed"],
            str(TaskStatus.CANCELLED): aggregated["cancelled"],
        },
        "overdue": aggregated["overdue"],
        "due_next_7_days": aggregated["due_next_7_days"],
    }
