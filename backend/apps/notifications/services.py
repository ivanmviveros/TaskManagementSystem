"""Who gets told, and under which key. Pure functions over ids and roles, so
they are testable with no database, no broker and no email backend."""

from uuid import UUID

from apps.core.roles import Role
from apps.notifications.models import NotificationEvent

#: Who the event is about, before the two filters below are applied.
_AUDIENCE: dict[str, tuple[str, ...]] = {
    str(NotificationEvent.ASSIGNED): ("assignee",),
    str(NotificationEvent.DUE_DATE_CHANGED): ("assignee",),
    str(NotificationEvent.STATUS_CHANGED): ("assignee", "creator"),
    str(NotificationEvent.OVERDUE): ("assignee", "creator"),
}

#: Key segments are shorter than the event names on purpose (spec §10.3b).
_KEY_SEGMENT: dict[str, str] = {
    str(NotificationEvent.ASSIGNED): "ASSIGNED",
    str(NotificationEvent.STATUS_CHANGED): "STATUS",
    str(NotificationEvent.DUE_DATE_CHANGED): "DUE",
    str(NotificationEvent.OVERDUE): "OVERDUE",
}


def resolve_recipients(
    *,
    event: str,
    assignee_id: UUID | None,
    created_by_id: UUID | None,
    created_by_role: str | None,
    actor_id: UUID | None = None,
) -> list[UUID]:
    """Recipients for `event`, in a stable order, after both filters.

    1. Read-access gate (D26): a recipient must currently be able to read the
       task. An Operator creator who is no longer the assignee is dropped; a
       Supervisor creator is retained, because Supervisors see all tasks.
    2. Actor suppression: nobody is emailed about their own action.
    """
    candidates: list[UUID | None] = []
    for who in _AUDIENCE[event]:
        if who == "assignee":
            # The assignee can always read their own task, and D17 guarantees
            # they are never an Admin.
            candidates.append(assignee_id)
        elif _creator_can_read(created_by_role, created_by_id, assignee_id):
            candidates.append(created_by_id)

    recipients: list[UUID] = []
    for candidate in candidates:
        if candidate is None or candidate == actor_id or candidate in recipients:
            continue
        recipients.append(candidate)
    return recipients


def _creator_can_read(
    created_by_role: str | None, created_by_id: UUID | None, assignee_id: UUID | None
) -> bool:
    if created_by_role == Role.SUPERVISOR:
        return True
    if created_by_role == Role.OPERATOR:
        return created_by_id is not None and created_by_id == assignee_id
    return False  # Admin, or unknown: no task read access at all (D13)


def build_dedupe_key(
    *,
    event: str,
    task_id: UUID,
    recipient_id: UUID,
    history_id: int | None = None,
    on_date: str | None = None,
) -> str:
    """The unique key that makes delivery idempotent (spec §10.3b).

    Change-driven events key on the simple-history record id, which ties each
    email to the exact audited change that caused it. OVERDUE keys on the date
    instead, capping delivery at one email per task per recipient per day.
    """
    segment = _KEY_SEGMENT[event]
    if event == NotificationEvent.OVERDUE:
        if on_date is None:
            raise ValueError("An OVERDUE dedupe key requires on_date")
        return f"{task_id}:{segment}:{recipient_id}:{on_date}"
    if history_id is None:
        raise ValueError(f"A {event} dedupe key requires history_id")
    return f"{task_id}:{segment}:{recipient_id}:{history_id}"
