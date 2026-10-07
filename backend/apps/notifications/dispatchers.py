"""The notification boundary a task service depends on.

Only ids cross this boundary, never model instances: the real implementation
enqueues Celery messages, and a pickled model carries a stale snapshot.

Import direction: tasks.services -> notifications.dispatchers ->
notifications.tasks -> tasks.repositories -> tasks.models. tasks.models imports
nothing from notifications or from tasks.services, so the chain terminates and
there is no cycle. A future change making notifications import tasks.services is
the moment a cycle would appear.
"""

import logging
from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from apps.notifications.models import NotificationEvent
from apps.notifications.services import build_dedupe_key, resolve_recipients
from apps.notifications.tasks import send_task_event_email
from apps.tasks.selectors import notification_target

logger = logging.getLogger(__name__)


@runtime_checkable
class NotificationDispatcher(Protocol):
    """What a service may ask of notification delivery."""

    @abstractmethod
    def task_assigned(self, *, task_id: UUID, history_id: int, actor_id: UUID) -> None: ...

    @abstractmethod
    def task_status_changed(self, *, task_id: UUID, history_id: int, actor_id: UUID) -> None: ...

    @abstractmethod
    def task_due_date_changed(self, *, task_id: UUID, history_id: int, actor_id: UUID) -> None: ...


class CeleryNotificationDispatcher(NotificationDispatcher):
    """Resolves recipients and enqueues one message per recipient.

    Runs inside transaction.on_commit, i.e. in the request thread AFTER the
    commit, so the read below sees the committed row and a query here is free.
    """

    def task_assigned(self, *, task_id, history_id, actor_id) -> None:
        self._fan_out(str(NotificationEvent.ASSIGNED), task_id, history_id, actor_id)

    def task_status_changed(self, *, task_id, history_id, actor_id) -> None:
        self._fan_out(str(NotificationEvent.STATUS_CHANGED), task_id, history_id, actor_id)

    def task_due_date_changed(self, *, task_id, history_id, actor_id) -> None:
        self._fan_out(str(NotificationEvent.DUE_DATE_CHANGED), task_id, history_id, actor_id)

    @staticmethod
    def _fan_out(event: str, task_id, history_id, actor_id) -> None:
        target = notification_target(task_id)
        if target is None:
            logger.info("notifications.task_gone", extra={"task_id": task_id, "event": event})
            return
        assignee_id, created_by_id, created_by_role = target
        recipients = resolve_recipients(
            event=event,
            assignee_id=assignee_id,
            created_by_id=created_by_id,
            created_by_role=created_by_role,
            actor_id=actor_id,
        )
        for recipient_id in recipients:
            send_task_event_email.delay(
                event=event,
                task_id=str(task_id),
                recipient_id=str(recipient_id),
                dedupe_key=build_dedupe_key(
                    event=event,
                    task_id=task_id,
                    recipient_id=recipient_id,
                    history_id=history_id,
                ),
            )
