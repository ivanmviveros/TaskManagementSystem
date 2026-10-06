"""Abstract base models shared by every domain app."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.managers import SoftDeleteManager


class UUIDPrimaryKeyModel(models.Model):
    """UUIDv7 primary key (D28).

    `uuid.uuid7` is passed by reference, not called, and is a stdlib function, so
    Django serializes it into migrations exactly as `uuid.uuid4` has always been.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeleteModel(UUIDPrimaryKeyModel):
    """Soft delete (D20). Deletion is a state change, not a row removal.

    `delete()` is deliberately NOT overridden: overriding it would make
    `queryset.delete()` and cascade behaviour surprising, and would hide genuine
    hard deletes during data migrations. Services call `soft_delete()` explicitly.
    """

    # No db_index=True: every concrete subclass declares an explicit partial
    # index on deleted_at in its own Meta, and both would create two indexes on
    # the same column.
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # `objects` is declared first on purpose: Django picks the default manager by
    # declaration order, and `_default_manager` must be the filtering one. DJ012 is
    # a false positive here — ruff reads `models.Manager()` as a field, because it
    # matches the `models.X(...)` field pattern, and so sees "field after manager".
    objects = SoftDeleteManager()
    all_objects = models.Manager()  # noqa: DJ012

    class Meta:
        abstract = True

    def soft_delete(self, by=None) -> None:
        self.deleted_at = timezone.now()
        self.deleted_by = by
        self.save(update_fields=["deleted_at", "deleted_by"])
