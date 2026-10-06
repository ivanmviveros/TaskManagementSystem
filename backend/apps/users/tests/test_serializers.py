import pytest

from apps.core.roles import Role
from apps.users.serializers import (
    UserCreateSerializer,
    UserMinimalSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_minimal_serializer_exposes_exactly_the_allowed_fields():
    """A privilege boundary: this is what a Supervisor may see (spec §7.2 rule 2)."""
    assert set(UserMinimalSerializer().fields) == {
        "id",
        "email",
        "first_name",
        "last_name",
        "role",
    }


def test_minimal_serializer_withholds_the_admin_only_fields():
    rendered = UserMinimalSerializer(UserFactory()).data
    for withheld in (
        "is_active",
        "is_staff",
        "is_superuser",
        "date_joined",
        "last_login",
        "password",
    ):
        assert withheld not in rendered


def test_admin_serializer_never_renders_a_password():
    assert "password" not in UserSerializer(UserFactory()).data


def test_create_serializer_is_not_a_model_serializer():
    """D9 made structural: a plain Serializer has nothing to bypass, because
    there is no create()/update() inherited from ModelSerializer."""
    from rest_framework import serializers

    assert not isinstance(UserCreateSerializer(), serializers.ModelSerializer)
    assert not isinstance(UserUpdateSerializer(), serializers.ModelSerializer)


def test_create_serializer_rejects_a_weak_password():
    serializer = UserCreateSerializer(
        data={
            "email": "new@example.com",
            "password": "123",
            "first_name": "A",
            "last_name": "B",
            "role": Role.OPERATOR,
        }
    )
    assert not serializer.is_valid()
    assert "password" in serializer.errors


def test_create_serializer_normalizes_email_case():
    serializer = UserCreateSerializer(
        data={
            "email": "  Mixed@Example.COM ",
            "password": "a-strong-password-1",
            "first_name": "A",
            "last_name": "B",
            "role": Role.OPERATOR,
        }
    )
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["email"] == "mixed@example.com"


def test_create_serializer_rejects_an_unknown_role():
    serializer = UserCreateSerializer(
        data={
            "email": "new@example.com",
            "password": "a-strong-password-1",
            "first_name": "A",
            "last_name": "B",
            "role": "WIZARD",
        }
    )
    assert not serializer.is_valid()
    assert "role" in serializer.errors


def test_update_serializer_accepts_a_partial_payload():
    serializer = UserUpdateSerializer(data={"first_name": "Only"})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {"first_name": "Only"}
