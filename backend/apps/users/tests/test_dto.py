"""The users DTO contract. See apps/tasks/tests/test_dto.py for why these two
properties get tests of their own."""

import pytest
from pydantic import ValidationError

from apps.core.roles import Role
from apps.users.dto import UserCreateInput, UserUpdateInput


class TestCreateInput:
    def test_every_field_is_required(self):
        with pytest.raises(ValidationError):
            UserCreateInput(email="a@example.com")

    def test_a_complete_payload_is_accepted(self):
        data = UserCreateInput(
            email="a@example.com",
            password="DemoPass!2026",
            first_name="A",
            last_name="B",
            role=str(Role.OPERATOR),
        )
        assert data.email == "a@example.com"
        assert data.role == str(Role.OPERATOR)

    def test_an_unexpected_key_is_rejected(self):
        with pytest.raises(ValidationError):
            UserCreateInput(
                email="a@example.com",
                password="DemoPass!2026",
                first_name="A",
                last_name="B",
                role=str(Role.OPERATOR),
                unknown_field="ignored",
            )


class TestUpdateInput:
    def test_an_omitted_field_is_not_in_the_set(self):
        assert "role" not in UserUpdateInput(first_name="A").model_fields_set

    def test_an_explicit_false_is_in_the_set(self):
        # is_active=False is the users-side equivalent of assignee=None: a falsy
        # value that must not be mistaken for "absent".
        data = UserUpdateInput(is_active=False)
        assert "is_active" in data.model_fields_set
        assert data.is_active is False

    def test_an_empty_dto_has_an_empty_set(self):
        assert UserUpdateInput().model_fields_set == set()

    def test_an_unexpected_key_is_rejected(self):
        with pytest.raises(ValidationError):
            UserUpdateInput(unknown_field="ignored")
