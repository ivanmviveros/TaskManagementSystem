"""Reusable user reads. Returns querysets; called by views and services."""

from django.db.models import QuerySet

from apps.core.roles import Role
from apps.users.models import User


def scoped_users(user: User) -> QuerySet[User]:
    """Rows visible to `user`.

    Admin and Supervisor see the same rows today; what differs is the SERIALIZER
    (spec §7.2 rule 2), not the row set. This selector owns the deterministic
    ordering pagination requires (spec §8.3) — `email` is unique among live rows,
    so it is a valid tiebreaker on its own.
    """
    return User.objects.all().order_by("email")


def assignable_users() -> QuerySet[User]:
    """Users who may hold a task: Supervisor or Operator, never Admin (D17).

    Assigning to an Admin would create a task nobody can open, given D13.
    """
    return User.objects.filter(role__in=(Role.SUPERVISOR, Role.OPERATOR)).order_by("email")
