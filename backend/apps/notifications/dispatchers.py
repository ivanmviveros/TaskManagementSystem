"""The notification boundary a task service depends on.

Only ids cross this boundary, never model instances: the real implementation
enqueues Celery messages, and a pickled model carries a stale snapshot.
"""

import logging
from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

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


class NullNotificationDispatcher(NotificationDispatcher):
    """Placeholder until Task 37 wires Celery. Logs rather than failing silently,
    so a phase-5 or phase-6 run makes the gap visible.
    """

    def task_assigned(self, *, task_id, history_id, actor_id) -> None:
        logger.info("notifications.not_wired event=ASSIGNED task=%s", task_id)

    def task_status_changed(self, *, task_id, history_id, actor_id) -> None:
        logger.info("notifications.not_wired event=STATUS_CHANGED task=%s", task_id)

    def task_due_date_changed(self, *, task_id, history_id, actor_id) -> None:
        logger.info("notifications.not_wired event=DUE_DATE_CHANGED task=%s", task_id)
