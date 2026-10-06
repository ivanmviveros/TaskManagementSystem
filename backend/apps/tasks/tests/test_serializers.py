import pytest
from rest_framework.test import APIRequestFactory

from apps.tasks.exceptions import AssigneeImmutableForRole, AssigneeNotAssignable
from apps.tasks.models import TaskStatus
from apps.tasks.serializers import (
    TaskCreateSerializer,
    TaskDetailSerializer,
    TaskListSerializer,
    TaskUpdateSerializer,
)
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db


def context_for(user):
    request = APIRequestFactory().post("/api/v1/tasks/")
    request.user = user
    return {"request": request}


def test_list_serializer_renders_exactly_the_contracted_fields():
    rendered = TaskListSerializer(TaskFactory()).data
    assert set(rendered) == {
        "id",
        "title",
        "status",
        "due_date",
        "assignee",
        "is_overdue",
        "created_at",
    }
    assert "created_by" not in rendered, "joining it would fetch a column nobody reads"


def test_detail_serializer_adds_the_detail_only_fields():
    rendered = TaskDetailSerializer(TaskFactory()).data
    assert set(rendered) == {
        "id",
        "title",
        "status",
        "due_date",
        "assignee",
        "is_overdue",
        "created_at",
        "description",
        "created_by",
        "completed_at",
        "updated_at",
    }


def test_nested_assignee_uses_the_minimal_shape():
    rendered = TaskListSerializer(TaskFactory()).data
    assert set(rendered["assignee"]) == {"id", "email", "first_name", "last_name", "role"}


def test_write_serializers_are_not_model_serializers():
    """D9 made structural (spec §3.2)."""
    from rest_framework import serializers

    assert not isinstance(TaskCreateSerializer(), serializers.ModelSerializer)
    assert not isinstance(TaskUpdateSerializer(), serializers.ModelSerializer)


def test_create_serializer_accepts_no_status_field():
    """A new task is always PENDING, so the frontend must not render a status
    select on create (spec §11.5)."""
    assert "status" not in TaskCreateSerializer().fields


def test_operator_create_defaults_assignee_to_self():
    """D16, default half."""
    operator = OperatorFactory()
    serializer = TaskCreateSerializer(data={"title": "Mine"}, context=context_for(operator))
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["assignee"] == operator


def test_operator_create_with_another_assignee_is_refused():
    """D16, explicit-mismatch half: silently coercing a value the client sent
    would hide a client bug."""
    serializer = TaskCreateSerializer(
        data={"title": "Theirs", "assignee": str(OperatorFactory().pk)},
        context=context_for(OperatorFactory()),
    )
    with pytest.raises(AssigneeImmutableForRole):
        serializer.is_valid(raise_exception=True)


def test_operator_update_cannot_touch_assignee_even_to_themselves():
    """D15 / spec §8.7: `assignee_immutable` covers ANY assignee on update, so
    there is no self-assignment escape — the actor here supplies their own id."""
    operator = OperatorFactory()
    serializer = TaskUpdateSerializer(
        data={"assignee": str(operator.pk)}, partial=True, context=context_for(operator)
    )
    with pytest.raises(AssigneeImmutableForRole):
        serializer.is_valid(raise_exception=True)


def test_operator_update_of_other_fields_is_unaffected():
    operator = OperatorFactory()
    serializer = TaskUpdateSerializer(
        data={"title": "Renamed", "status": TaskStatus.IN_PROGRESS},
        partial=True,
        context=context_for(operator),
    )
    assert serializer.is_valid(), serializer.errors


def test_supervisor_assigning_to_an_admin_is_refused_with_the_other_code():
    """The two assignee errors must not collide (spec §8.7)."""
    serializer = TaskCreateSerializer(
        data={"title": "x", "assignee": str(AdminFactory().pk)},
        context=context_for(SupervisorFactory()),
    )
    with pytest.raises(AssigneeNotAssignable):
        serializer.is_valid(raise_exception=True)


def test_supervisor_may_set_a_valid_assignee_and_status():
    operator = OperatorFactory()
    serializer = TaskUpdateSerializer(
        data={"assignee": str(operator.pk), "status": TaskStatus.IN_PROGRESS},
        partial=True,
        context=context_for(SupervisorFactory()),
    )
    assert serializer.is_valid(), serializer.errors


def test_an_unknown_assignee_id_is_a_field_validation_error():
    import uuid

    serializer = TaskCreateSerializer(
        data={"title": "x", "assignee": str(uuid.uuid7())},
        context=context_for(SupervisorFactory()),
    )
    assert not serializer.is_valid()
    assert "assignee" in serializer.errors


def test_title_is_required_and_bounded():
    serializer = TaskCreateSerializer(data={"title": ""}, context=context_for(SupervisorFactory()))
    assert not serializer.is_valid()
    assert "title" in serializer.errors
