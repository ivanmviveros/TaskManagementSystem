"""The DTO contract itself, independent of any service.

These exist because `extra="forbid"` and `model_fields_set` are the two
properties the whole refactor rests on, and both can break silently while every
service test still passes.
"""

import pytest
from pydantic import ValidationError

from apps.core.roles import Role
from apps.tasks.dto import TaskCreateInput, TaskStatsOutput, TaskUpdateInput
from apps.users.models import User


class TestExtraForbid:
    def test_an_unexpected_key_is_rejected_not_ignored(self):
        # The loud failure D30 describes: a view and a service that disagree
        # about the contract must raise, not silently drop the field.
        with pytest.raises(ValidationError):
            TaskCreateInput(title="t", unknown_field="ignored")

    def test_a_known_field_set_is_accepted_with_defaults(self):
        data = TaskCreateInput(title="t")
        assert data.title == "t"
        assert data.description == ""
        assert data.due_date is None
        assert data.assignee is None


class TestModelFieldsSet:
    """D32: absent and explicitly-null must stay distinguishable."""

    def test_an_omitted_field_is_not_in_the_set(self):
        assert "assignee" not in TaskUpdateInput(title="t").model_fields_set

    def test_an_explicit_none_assignee_is_in_the_set(self):
        # The whole reason the services cannot branch on `is not None`.
        assert "assignee" in TaskUpdateInput(assignee=None).model_fields_set

    def test_an_explicit_none_due_date_is_in_the_set(self):
        assert "due_date" in TaskUpdateInput(due_date=None).model_fields_set

    def test_an_empty_dto_has_an_empty_set(self):
        assert TaskUpdateInput().model_fields_set == set()


@pytest.mark.django_db
class TestArbitraryTypes:
    def test_it_carries_a_resolved_user_instance(self):
        # D31: the serializer already proved the row exists and is live, so the
        # DTO carries the instance rather than an id the service would re-fetch.
        user = User.objects.create_user(
            email="a@example.com",
            password="DemoPass!2026",
            first_name="A",
            last_name="B",
            role=Role.OPERATOR,
        )
        assert TaskCreateInput(title="t", assignee=user).assignee is user


class TestStatsOutput:
    def test_model_dump_reproduces_the_wire_shape(self):
        stats = TaskStatsOutput(total=1, by_status={"PENDING": 1}, overdue=0, due_next_7_days=1)
        assert stats.model_dump() == {
            "total": 1,
            "by_status": {"PENDING": 1},
            "overdue": 0,
            "due_next_7_days": 1,
        }
