"""Task input and output contracts (spec §8.2).

Write serializers are plain Serializer subclasses (D9) and apply D15/D16/D17 in
validate(), receiving the request user through serializer context. None of them
implements create() or update(); the view hands validated_data to the service.
"""

from typing import Any

from rest_framework import serializers

from apps.core.permissions.classes import may_delete_task
from apps.core.roles import Role
from apps.tasks.exceptions import AssigneeImmutableForRole, AssigneeNotAssignable
from apps.tasks.models import TRANSITIONS, Task, TaskStatus
from apps.users.models import User
from apps.users.serializers import UserMinimalSerializer


class TaskListSerializer(serializers.ModelSerializer):
    assignee = UserMinimalSerializer(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    # Reported, not re-derived: the SPA must not offer a delete the backend would
    # refuse (D27), and a second copy of that rule in the frontend is how the UI
    # and the API drift. Reads created_by_id, a local column, so no extra query.
    can_delete = serializers.SerializerMethodField()

    def get_can_delete(self, task) -> bool:
        request = self.context.get("request")
        return may_delete_task(getattr(request, "user", None), task)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "status",
            "due_date",
            "assignee",
            "is_overdue",
            "can_delete",
            "created_at",
        ]


class TaskDetailSerializer(serializers.ModelSerializer):
    assignee = UserMinimalSerializer(read_only=True)
    created_by = UserMinimalSerializer(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    # Reported, not re-derived: the SPA must not offer a delete the backend would
    # refuse (D27), and a second copy of that rule in the frontend is how the UI
    # and the API drift. Reads created_by_id, a local column, so no extra query.
    can_delete = serializers.SerializerMethodField()

    def get_can_delete(self, task) -> bool:
        request = self.context.get("request")
        return may_delete_task(getattr(request, "user", None), task)

    # D39: reported, not re-derived — the can_delete reasoning (D27) applied to
    # D19's transition table, so the SPA never offers a status change the API
    # would refuse. COMPLETED never appears: only the complete action reaches
    # it, and TRANSITIONS never lists it as a target. Declaration order rather
    # than sorted(), which would put CANCELLED before IN_PROGRESS.
    allowed_transitions = serializers.SerializerMethodField()

    def get_allowed_transitions(self, task) -> list[str]:
        allowed = TRANSITIONS[task.status]
        return [status for status in TaskStatus.values if status in allowed]

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "status",
            "allowed_transitions",
            "due_date",
            "assignee",
            "created_by",
            "is_overdue",
            "can_delete",
            "completed_at",
            "created_at",
            "updated_at",
        ]


ASSIGNEE_GONE = "That user does not exist. Choose another assignee."


class _AssigneeRules:
    """D15/D16/D17/D94, shared by the two write serializers so the rules live once."""

    # Declared for mypy: the mixin reads the serializer's context but has no
    # base class of its own, so without this it reports "has no attribute".
    context: dict[str, Any]

    def _apply_assignee_rules(self, attrs: dict, *, is_create: bool) -> dict:
        attrs = self._apply_deleted_assignee_rule(attrs, is_create=is_create)
        actor = self.context["request"].user
        supplied = "assignee" in attrs
        assignee = attrs.get("assignee")

        if actor.role == Role.OPERATOR:
            if is_create:
                if not supplied:
                    attrs["assignee"] = actor  # D16, default half
                elif assignee is None or assignee.pk != actor.pk:
                    raise AssigneeImmutableForRole  # D16, explicit-mismatch half
            elif supplied:
                # D15: an Operator cannot change the assignee at all on update —
                # not even to themselves. Spec §8.7 defines assignee_immutable as
                # "any assignee on update", so there is no self-assignment escape.
                raise AssigneeImmutableForRole

        final = attrs.get("assignee")
        if final is not None and final.role == Role.ADMIN:
            raise AssigneeNotAssignable  # D17
        return attrs

    def _apply_deleted_assignee_rule(self, attrs: dict, *, is_create: bool) -> dict:
        """D94: a soft-deleted user keeps the tasks they held, and the edit form
        re-sends the current assignee with every save. Re-sending that same user
        is therefore no change, and is dropped; choosing any deleted user is a
        field error worded like an unknown id, since deleted rows are invisible
        to the API (D20)."""
        assignee = attrs.get("assignee")
        if assignee is None or assignee.deleted_at is None:
            return attrs
        task = self.context.get("task")
        if not is_create and task is not None and task.assignee_id == assignee.pk:
            del attrs["assignee"]
            return attrs
        raise serializers.ValidationError({"assignee": [ASSIGNEE_GONE]})


def _assignee_field() -> serializers.PrimaryKeyRelatedField:
    """Resolved against ALL users, not assignable_users(), deliberately: a
    narrowed queryset would report an Admin assignee as "does not exist" instead
    of the specific assignee_not_assignable code the frontend branches on. That
    includes soft-deleted users, so the D94 rule can tell a task's current,
    deleted assignee from a new choice.

    The messages replace DRF's defaults ('Invalid pk "…" - object does not
    exist.'), which the SPA would show verbatim under the field. A malformed id
    is checked by pk_field first, so it fails the same way instead of reaching
    the database lookup."""
    return serializers.PrimaryKeyRelatedField(
        queryset=User.all_objects.all(),
        pk_field=serializers.UUIDField(error_messages={"invalid": ASSIGNEE_GONE}),
        required=False,
        allow_null=True,
        error_messages={"does_not_exist": ASSIGNEE_GONE, "incorrect_type": ASSIGNEE_GONE},
    )


class TaskCreateSerializer(_AssigneeRules, serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    due_date = serializers.DateTimeField(required=False, allow_null=True, default=None)
    assignee = _assignee_field()
    # No `status` field: a new task is always PENDING.

    def validate(self, attrs):
        return self._apply_assignee_rules(attrs, is_create=True)


class TaskUpdateSerializer(_AssigneeRules, serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    due_date = serializers.DateTimeField(required=False, allow_null=True)
    assignee = _assignee_field()
    status = serializers.ChoiceField(choices=TaskStatus.choices, required=False)

    def validate(self, attrs):
        return self._apply_assignee_rules(attrs, is_create=False)
