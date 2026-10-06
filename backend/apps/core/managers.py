"""Managers for soft-deletable models."""

from django.db import models


class SoftDeleteManager(models.Manager):
    """Default manager that hides soft-deleted rows from every query.

    Because this is the default manager, no viewset needs its own `deleted_at`
    filter — which removes the single most likely place for a data leak.
    """

    def get_queryset(self) -> models.QuerySet:
        return super().get_queryset().filter(deleted_at__isnull=True)
