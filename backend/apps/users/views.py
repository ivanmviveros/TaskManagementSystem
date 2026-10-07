"""User HTTP surface. The composition root for UserService lives here."""

from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UUID_LOOKUP_REGEX
from apps.core.ordering import TiebrokenOrderingFilter
from apps.core.permissions.classes import RolePermission
from apps.core.permissions.matrix import Resource
from apps.core.roles import Role
from apps.users.dto import UserCreateInput, UserUpdateInput
from apps.users.filters import UserFilterSet
from apps.users.repositories import DjangoUserRepository
from apps.users.selectors import assignable_users, scoped_users
from apps.users.serializers import (
    UserCreateSerializer,
    UserMinimalSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.users.services import UserService


class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_resource = Resource.USER
    permission_classes = [RolePermission]
    lookup_value_regex = UUID_LOOKUP_REGEX
    filterset_class = UserFilterSet
    # SearchFilter is listed explicitly rather than globally, because this is the
    # only viewset that searches. TiebrokenOrderingFilter, not DRF's
    # OrderingFilter: `?ordering=role` is not a total order on its own.
    filter_backends = [DjangoFilterBackend, SearchFilter, TiebrokenOrderingFilter]
    search_fields = ["email", "first_name", "last_name"]
    ordering_fields = ["email", "role", "date_joined"]
    ordering = ["email"]

    def get_queryset(self):
        return scoped_users(self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action == "partial_update":
            return UserUpdateSerializer
        # Schema generation calls this with no request, and an unauthenticated
        # request has user None. Falling back to the Admin serializer documents the
        # widest shape; without this guard drf-spectacular drops the whole viewset
        # from the schema with "'NoneType' object has no attribute 'role'".
        user = getattr(self.request, "user", None)
        if user is None or user.role == Role.ADMIN:
            return UserSerializer
        # Spec §7.2 rule 2: a Supervisor gets a different SERIALIZER, not a flag.
        return UserMinimalSerializer

    def get_service(self) -> UserService:
        """The composition root: the only place a concrete repository is named."""
        return UserService(users=DjangoUserRepository())

    @extend_schema(responses={200: UserMinimalSerializer(many=True)})
    @action(detail=False, methods=["get"], filter_backends=[SearchFilter])
    def assignable(self, request):
        """Users a task may be assigned to — the assignee picker's options (D61, D64).

        Paged and searchable (`?search=` over the same fields as /users/): the
        picker searches as you type and loads more on demand instead of
        downloading every user up front (D64). D17 (never an Admin) is applied
        by assignable_users() before the search, so a search only narrows the
        set. Minimal fields: the same shape a Supervisor gets from /users/.
        """
        page = self.paginate_queryset(self.filter_queryset(assignable_users()))
        return self.get_paginated_response(UserMinimalSerializer(page, many=True).data)

    @extend_schema(
        request=UserCreateSerializer,
        responses={
            201: UserSerializer,
            400: OpenApiResponse(description="Validation failed, or the email is in use."),
        },
    )
    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Splat, never map field by field: see tasks/views.py (D30, spec §3.1).
        user = self.get_service().create(
            data=UserCreateInput(**serializer.validated_data), actor=request.user
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=UserUpdateSerializer, responses={200: UserSerializer})
    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = UserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = self.get_service().update(
            user=user,
            data=UserUpdateInput(**serializer.validated_data),
            actor=request.user,
        )
        return Response(UserSerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        self.get_service().delete(user=user, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET /users/me/ — identity, not user management, so every role may call it."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: UserMinimalSerializer})
    def get(self, request):
        return Response(UserMinimalSerializer(request.user).data)
