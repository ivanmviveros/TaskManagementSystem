"""The notification log. Append-only, never API-exposed, never deleted.

Deliberately NOT soft-deletable and NOT historised (D20's one exemption): it is
already an append-only record, so a deleted_at column would never be anything but
NULL. That is also why its FKs are CASCADE while Task's are PROTECT.

It inherits UUIDPrimaryKeyModel even though it gains nothing security-wise — a
schema with two different primary-key types is a maintenance trap, and exposing
this table later would then require a key migration.
"""

from django.conf import settings
from django.db import models

from apps.core.models import UUIDPrimaryKeyModel


class NotificationEvent(models.TextChoices):
    ASSIGNED = "ASSIGNED", "Assigned"
    STATUS_CHANGED = "STATUS_CHANGED", "Status changed"
    DUE_DATE_CHANGED = "DUE_DATE_CHANGED", "Due date changed"
    OVERDUE = "OVERDUE", "Overdue"


class NotificationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SENT = "SENT", "Sent"
    FAILED = "FAILED", "Failed"


class Notification(UUIDPrimaryKeyModel):
    task = models.ForeignKey("tasks.Task", on_delete=models.CASCADE, related_name="notifications")
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    event = models.CharField(max_length=20, choices=NotificationEvent.choices)
    # Sized for two UUIDv7s plus the event name plus a history id (spec §10.3b).
    dedupe_key = models.CharField(max_length=160, unique=True)
    status = models.CharField(
        max_length=10, choices=NotificationStatus.choices, default=NotificationStatus.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    # DJ001 prefers default="" for text fields, to avoid two indistinguishable empty
    # states. Here NULL is meaningful and distinct: it records "no failure", which a
    # successful retry restores by setting this back to None. The column is internal
    # and never serialized to the API, so there is no client to confuse.
    error = models.TextField(null=True, blank=True)  # noqa: DJ001

    def __str__(self) -> str:
        return f"{self.event} -> {self.recipient_id}"
