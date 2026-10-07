"""Task HTTP surface. The composition root for TaskService lives here."""

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import (
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.constants import UUID_LOOKUP_REGEX
from apps.core.ordering import TiebrokenOrderingFilter
from apps.core.permissions.classes import IsTaskCreator, RolePermission
from apps.core.permissions.matrix import Resource
from apps.notifications.dispatchers import CeleryNotificationDispatcher
from apps.tasks.dto import TaskCreateInput, TaskUpdateInput
from apps.tasks.filters import TaskFilterSet
from apps.tasks.models import Task
from apps.tasks.repositories import DjangoTaskRepository
from apps.tasks.selectors import scoped_tasks, task_stats
from apps.tasks.serializers import (
    TaskCreateSerializer,
    TaskDetailSerializer,
    TaskListSerializer,
    TaskUpdateSerializer,
)
from apps.tasks.services import TaskService


class TaskViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_resource = Resource.TASK
    permission_classes = [RolePermission]
    lookup_value_regex = UUID_LOOKUP_REGEX
    filter_backends = [DjangoFilterBackend, TiebrokenOrderingFilter]
    filterset_class = TaskFilterSet
    ordering_fields = ["due_date", "created_at", "status"]
    ordering = ["-created_at", "-id"]

    def get_permissions(self):
        # Scoped to destroy deliberately: read, update and complete are unaffected,
        # which test_that_operator_retains_every_other_operation_on_it asserts.
        if self.action == "destroy":
            return [RolePermission(), IsTaskCreator()]
        return [RolePermission()]

    def get_queryset(self):
        # Schema generation calls this with no request, and scoped_tasks reads
        # user.role; an empty queryset still tells the generator the model. Without
        # this the generator cannot resolve Task and warns on every task path.
        user = getattr(self.request, "user", None)
        if user is None:
            return Task.objects.none()
        # scoped_tasks owns the authorization rules; eager loading follows the
        # SERIALIZER in use, so it is chained here per action (spec §8.6).
        queryset = scoped_tasks(user)
        if self.action == "list":
            # assignee only: TaskListSerializer does not render created_by, so
            # joining it would fetch a column nobody reads.
            return queryset.select_related("assignee")
        return queryset.select_related("assignee", "created_by")

    def get_serializer_class(self):
        return {
            "list": TaskListSerializer,
            "create": TaskCreateSerializer,
            "partial_update": TaskUpdateSerializer,
        }.get(self.action, TaskDetailSerializer)

    def get_service(self) -> TaskService:
        """The composition root: the only place concrete infrastructure is named."""
        return TaskService(
            tasks=DjangoTaskRepository(),
            notifications=CeleryNotificationDispatcher(),
        )

    @extend_schema(
        request=TaskCreateSerializer,
        responses={
            201: TaskDetailSerializer,
            400: OpenApiResponse(
                description="Validation failed, or an assignee rule was violated "
                "(assignee_immutable / assignee_not_assignable)."
            ),
        },
    )
    def create(self, request, *args, **kwargs):
        serializer = TaskCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        # Splat, never map field by field: splatting is what gives the DTO's
        # extra="forbid" something to catch (D30, spec §3.1).
        task = self.get_service().create(
            data=TaskCreateInput(**serializer.validated_data), actor=request.user
        )
        return Response(
            TaskDetailSerializer(task, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=TaskUpdateSerializer,
        responses={
            200: TaskDetailSerializer,
            400: OpenApiResponse(
                description="Validation failed, an assignee rule was violated, or "
                "status=COMPLETED was requested (use_complete_action)."
            ),
            409: OpenApiResponse(description="The status transition is not allowed."),
        },
    )
    def partial_update(self, request, *args, **kwargs):
        task = self.get_object()
        serializer = TaskUpdateSerializer(
            data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        updated = self.get_service().update(
            task_id=task.pk,
            data=TaskUpdateInput(**serializer.validated_data),
            actor=request.user,
        )
        return Response(TaskDetailSerializer(updated, context=self.get_serializer_context()).data)

    def destroy(self, request, *args, **kwargs):
        # get_object() runs queryset scoping (404) AND object permissions (403).
        task = self.get_object()
        self.get_service().delete(task=task, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        request=None,
        responses={
            200: TaskDetailSerializer,
            409: OpenApiResponse(description="The task is already in a terminal status."),
        },
    )
    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, *args, **kwargs):
        """The ONLY path to COMPLETED (D18), which is what guarantees
        completed_at is always set alongside the status."""
        task = self.get_object()
        completed = self.get_service().complete(task_id=task.pk, actor=request.user)
        return Response(TaskDetailSerializer(completed, context=self.get_serializer_context()).data)

    @extend_schema(
        responses=inline_serializer(
            name="TaskStats",
            fields={
                "total": serializers.IntegerField(),
                "by_status": serializers.DictField(child=serializers.IntegerField()),
                "overdue": serializers.IntegerField(),
                "due_next_7_days": serializers.IntegerField(),
            },
        )
    )
    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request, *args, **kwargs):
        return Response(task_stats(request.user))
