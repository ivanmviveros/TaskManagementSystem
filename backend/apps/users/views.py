"""User HTTP surface. The composition root for UserService lives here."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UUID_LOOKUP_REGEX
from apps.core.ordering import TiebrokenOrderingFilter
from apps.core.permissions.classes import RolePermission
from apps.core.permissions.matrix import Resource
from apps.core.roles import Role
from apps.users.filters import UserFilterSet
from apps.users.repositories import DjangoUserRepository
from apps.users.selectors import scoped_users
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
        # Spec §7.2 rule 2: a Supervisor gets a different SERIALIZER, not a flag.
        if self.request.user.role == Role.ADMIN:
            return UserSerializer
        return UserMinimalSerializer

    def get_service(self) -> UserService:
        """The composition root: the only place a concrete repository is named."""
        return UserService(users=DjangoUserRepository())

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = self.get_service().create(data=serializer.validated_data, actor=request.user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = UserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = self.get_service().update(
            user=user, data=serializer.validated_data, actor=request.user
        )
        return Response(UserSerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        self.get_service().delete(user=user, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET /users/me/ — identity, not user management, so every role may call it."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserMinimalSerializer(request.user).data)
