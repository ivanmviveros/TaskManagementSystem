import uuid

import pytest
from django.db import IntegrityError, transaction

from apps.notifications.models import Notification, NotificationStatus
from apps.notifications.tests.factories import NotificationFactory

pytestmark = pytest.mark.django_db


def test_notification_gets_a_uuid7_primary_key():
    assert uuid.UUID(str(NotificationFactory().pk)).version == 7


def test_dedupe_key_is_unique():
    """The whole idempotency mechanism rests on this index."""
    NotificationFactory(dedupe_key="same-key")
    with pytest.raises(IntegrityError), transaction.atomic():
        NotificationFactory(dedupe_key="same-key")


def test_a_realistic_dedupe_key_fits_the_column():
    """Two UUIDv7s plus the event name plus a history id — around 100 chars."""
    key = f"{uuid.uuid7()}:STATUS:{uuid.uuid7()}:1234567890"
    assert len(key) <= Notification._meta.get_field("dedupe_key").max_length


def test_notification_is_neither_soft_deletable_nor_historised():
    """D20's one exemption: an append-only log that no API exposes and nothing
    deletes would never have anything but NULL in a deleted_at column."""
    field_names = {f.name for f in Notification._meta.get_fields()}
    assert "deleted_at" not in field_names
    assert "deleted_by" not in field_names
    assert not hasattr(Notification, "history")


def test_notification_foreign_keys_cascade():
    """CASCADE rather than D25's PROTECT: if a row ever IS hard-deleted during
    data repair, its notification log should go with it."""
    for name in ("task", "recipient"):
        field = Notification._meta.get_field(name)
        assert field.remote_field.on_delete.__name__ == "CASCADE"


def test_default_status_is_pending():
    assert NotificationFactory().status == NotificationStatus.PENDING
