"""In-memory repositories for service unit tests. These deliberately do NOT
inherit the Protocol — test_repositories.py asserts structural conformance."""

from uuid import UUID

from apps.users.models import User


class FakeUserRepository:
    def __init__(self, users: list[User] | None = None):
        self._users = {u.pk: u for u in (users or [])}
        self.saved: list[User] = []
        self.deleted: list[User] = []

    def get(self, user_id: UUID) -> User | None:
        return self._users.get(user_id)

    def get_by_email(self, email: str) -> User | None:
        wanted = email.strip().lower()
        return next((u for u in self._users.values() if u.email == wanted), None)

    def add(self, *, email, password, first_name, last_name, role) -> User:
        user = User(email=email.lower(), first_name=first_name, last_name=last_name, role=role)
        user.set_password(password)
        self._users[user.pk] = user
        return user

    def save(self, user: User) -> User:
        self._users[user.pk] = user
        self.saved.append(user)
        return user

    def soft_delete(self, user: User, *, by: User) -> None:
        user.is_active = False
        self.deleted.append(user)
