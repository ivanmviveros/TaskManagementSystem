"""User use cases. Imports the UserRepository Protocol — never a concrete repository."""

import logging

from django.db import transaction

from apps.core.exceptions import ApplicationError
from apps.users.dto import UserCreateInput, UserUpdateInput
from apps.users.models import User
from apps.users.repositories import UserRepository  # the Protocol, and that is all

logger = logging.getLogger(__name__)


class EmailAlreadyInUse(ApplicationError):
    default_detail = "A user with this email address already exists."
    default_code = "email_already_in_use"
    status_code = 400


class UserService:
    def __init__(self, *, users: UserRepository):
        self._users = users

    def create(self, *, data: UserCreateInput, actor: User) -> User:
        email = data.email.strip().lower()
        if self._users.get_by_email(email) is not None:
            raise EmailAlreadyInUse
        with transaction.atomic():
            user = self._users.add(
                email=email,
                password=data.password,
                first_name=data.first_name,
                last_name=data.last_name,
                role=data.role,
            )
        logger.info("user.created id=%s role=%s by=%s", user.pk, user.role, actor.pk)
        return user

    def update(self, *, user: User, data: UserUpdateInput, actor: User) -> User:
        # D32: `is_active=False` is a legitimate value, so this must branch on
        # what was sent rather than on truthiness.
        fields = data.model_fields_set
        changed: list[str] = []
        for name in ("first_name", "last_name", "role", "is_active"):
            if name in fields:
                setattr(user, name, getattr(data, name))
                changed.append(name)
        # The `is not None` narrowing is for mypy (set_password takes str); the
        # serializer cannot produce password=None.
        if "password" in fields and data.password is not None:
            user.set_password(data.password)
            changed.append("password")
        if not changed:
            return user
        with transaction.atomic():
            self._users.save(user)
        # Field NAMES only — never a password, and never the new value.
        # `changed` is a locally-built list of names, so this line needs none of
        # the DTO-specific care tasks/services.py does; see its comment.
        logger.info("user.updated id=%s fields=%s by=%s", user.pk, sorted(changed), actor.pk)
        return user

    def delete(self, *, user: User, actor: User) -> None:
        with transaction.atomic():
            self._users.soft_delete(user, by=actor)
        logger.info("user.soft_deleted id=%s by=%s", user.pk, actor.pk)
