"""User input and output contracts (spec §8.2).

Read serializers are ModelSerializer; WRITE serializers are plain Serializer
subclasses with no model binding, so D9's "no serializer persists" rule is
structural rather than conventional — there is no inherited create()/update()
to bypass the service with.
"""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core.roles import Role
from apps.users.models import User


class UserMinimalSerializer(serializers.ModelSerializer):
    """What a Supervisor may see, and the shape of GET /users/me/.

    PRIVILEGE BOUNDARY: adding a field here widens Supervisor visibility.
    apps/users/tests/test_serializers.py pins the exact field set.
    """

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role"]


class UserSerializer(serializers.ModelSerializer):
    """Admin read."""

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "is_staff",
            "date_joined",
            "last_login",
        ]


def _validate_password_strength(value: str) -> str:
    try:
        validate_password(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return value


class UserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=Role.choices)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_password(self, value: str) -> str:
        return _validate_password_strength(value)


class UserUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    role = serializers.ChoiceField(choices=Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)
    password = serializers.CharField(write_only=True, required=False)

    def validate_password(self, value: str) -> str:
        return _validate_password_strength(value)
