"""Abstract base models shared by every domain app."""

import uuid

from django.db import models


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
