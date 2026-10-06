import uuid

import pytest
from django.db import IntegrityError, transaction

from apps.core.roles import Role
from apps.users.models import User
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_user_gets_a_uuid7_primary_key():
    user = UserFactory()
    assert uuid.UUID(str(user.pk)).version == 7


def test_email_is_normalized_to_lowercase():
    user = UserFactory(email="Mixed.Case@Example.COM")
    assert user.email == "mixed.case@example.com"


def test_two_live_users_cannot_share_an_email():
    UserFactory(email="taken@example.com")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(
            email="taken@example.com",
            password="pass12345",
            first_name="A",
            last_name="B",
            role=Role.OPERATOR,
        )


def test_a_soft_deleted_users_email_becomes_reusable():
    """The direct test of the partial unique index (D21)."""
    original = UserFactory(email="recycled@example.com")
    original.soft_delete()
    replacement = User.objects.create_user(
        email="recycled@example.com",
        password="pass12345",
        first_name="New",
        last_name="Owner",
        role=Role.OPERATOR,
    )
    assert replacement.pk != original.pk


def test_soft_deleted_users_are_invisible_to_the_default_manager():
    user = UserFactory()
    user.soft_delete()
    assert not User.objects.filter(pk=user.pk).exists()
    assert User.all_objects.filter(pk=user.pk).exists()


def test_default_manager_is_the_filtering_one():
    """Authentication calls User._default_manager.get_by_natural_key(); if that
    resolved to all_objects, a soft-deleted user could still log in."""
    assert User._default_manager.__class__.__name__ == "UserManager"


def test_soft_delete_also_revokes_authentication():
    """D22: is_active and deleted_at are not synonyms, but deletion sets both."""
    user = UserFactory()
    user.soft_delete()
    reloaded = User.all_objects.get(pk=user.pk)
    assert reloaded.deleted_at is not None
    assert reloaded.is_active is False


def test_history_records_the_deletion_and_keeps_the_pre_deletion_state():
    user = UserFactory(first_name="Original")
    user.soft_delete()
    history = list(User.all_objects.get(pk=user.pk).history.all())
    latest, previous = history[0], history[1]
    # Deletion is recorded as an ordinary update, so the trail stays continuous.
    assert latest.history_type == "~"
    assert latest.deleted_at is not None
    # And the state before deletion is still recoverable.
    assert previous.deleted_at is None
    assert previous.first_name == "Original"


def test_history_id_stays_an_integer():
    """dedupe_key composes history_id (spec §10.3b); an integer keeps it short."""
    user = UserFactory()
    assert isinstance(user.history.first().history_id, int)


def test_history_does_not_store_the_password_hash():
    user = UserFactory()
    assert not hasattr(user.history.first(), "password")
