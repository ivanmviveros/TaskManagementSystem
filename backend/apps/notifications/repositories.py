"""Persistence boundary for Notification — and the home of the idempotency rule."""

from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.notifications.models import Notification, NotificationStatus


@runtime_checkable
class NotificationRepository(Protocol):
    """What the notification worker may ask of notification storage."""

    @abstractmethod
    def create_if_absent(
        self, *, dedupe_key: str, task_id: UUID, recipient_id: UUID, event: str
    ) -> Notification | None:
        """Claim this (task, event, recipient, change) for sending.

        Returns the row to send, or None when an email for this key has already
        been SENT. An existing but unsent row is returned so a retry can finish.
        """

    @abstractmethod
    def mark_sent(self, notification: Notification) -> None: ...

    @abstractmethod
    def mark_failed(self, notification: Notification, *, error: str) -> None: ...


class DjangoNotificationRepository(NotificationRepository):
    """ORM-backed NotificationRepository."""

    def create_if_absent(
        self, *, dedupe_key: str, task_id: UUID, recipient_id: UUID, event: str
    ) -> Notification | None:
        try:
            # Inner atomic block: without it, the IntegrityError below marks the
            # whole transaction broken and every later query raises
            # TransactionManagementError somewhere unrelated.
            with transaction.atomic():
                return Notification.objects.create(
                    dedupe_key=dedupe_key,
                    task_id=task_id,
                    recipient_id=recipient_id,
                    event=event,
                )
        except IntegrityError:
            existing = Notification.objects.filter(dedupe_key=dedupe_key).first()
            if existing is None:
                raise  # the violation was something other than the dedupe key
            if existing.status == NotificationStatus.SENT:
                return None  # genuinely a duplicate
            return existing  # a previous attempt did not complete; let it retry

    def mark_sent(self, notification: Notification) -> None:
        notification.status = NotificationStatus.SENT
        notification.sent_at = timezone.now()
        notification.error = None
        notification.save(update_fields=["status", "sent_at", "error"])

    def mark_failed(self, notification: Notification, *, error: str) -> None:
        notification.status = NotificationStatus.FAILED
        notification.error = error[:2000]
        notification.save(update_fields=["status", "error"])
