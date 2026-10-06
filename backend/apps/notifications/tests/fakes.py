"""In-memory notification repository. Does NOT inherit the Protocol —
conformance is asserted structurally in test_dedupe.py."""

from uuid import UUID

from apps.notifications.models import Notification, NotificationStatus


class FakeNotificationRepository:
    def __init__(self):
        self._by_key: dict[str, Notification] = {}

    def create_if_absent(self, *, dedupe_key: str, task_id: UUID, recipient_id: UUID, event: str):
        existing = self._by_key.get(dedupe_key)
        if existing is not None:
            return None if existing.status == NotificationStatus.SENT else existing
        notification = Notification(
            dedupe_key=dedupe_key, task_id=task_id, recipient_id=recipient_id, event=event
        )
        self._by_key[dedupe_key] = notification
        return notification

    def mark_sent(self, notification: Notification) -> None:
        notification.status = NotificationStatus.SENT

    def mark_failed(self, notification: Notification, *, error: str) -> None:
        notification.status = NotificationStatus.FAILED
        notification.error = error
