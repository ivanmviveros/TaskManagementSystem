"""Persistence boundary for User — the only module in this app that touches the ORM."""

from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from django.utils import timezone

from apps.users.models import User


@runtime_checkable
class UserRepository(Protocol):
    """What a service may ask of user storage."""

    @abstractmethod
    def get(self, user_id: UUID) -> User | None: ...

    @abstractmethod
    def get_by_email(self, email: str) -> User | None:
        """Case-insensitive by construction, so no caller can get it wrong (D24)."""

    @abstractmethod
    def add(self, *, email: str, password: str, first_name: str, last_name: str, role: str) -> User:
        """Creates a user with a hashed password."""

    @abstractmethod
    def save(self, user: User) -> User: ...

    @abstractmethod
    def soft_delete(self, user: User, *, by: User) -> None: ...


class DjangoUserRepository(UserRepository):
    """ORM-backed UserRepository."""

    def get(self, user_id: UUID) -> User | None:
        return User.objects.filter(pk=user_id).first()

    def get_by_email(self, email: str) -> User | None:
        return User.objects.filter(email=email.strip().lower()).first()

    def add(self, *, email: str, password: str, first_name: str, last_name: str, role: str) -> User:
        return User.objects.create_user(
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role=role,
        )

    def save(self, user: User) -> User:
        user.save()
        return user

    def soft_delete(self, user: User, *, by: User) -> None:
        user.deleted_at = timezone.now()
        user.deleted_by = by
        user.is_active = False
        user.save(update_fields=["deleted_at", "deleted_by", "is_active"])
