import pytest

from apps.core.roles import Role
from apps.users.repositories import DjangoUserRepository, UserRepository
from apps.users.tests.factories import UserFactory
from apps.users.tests.fakes import FakeUserRepository


def test_django_implementation_conforms_to_the_protocol():
    assert isinstance(DjangoUserRepository(), UserRepository)


def test_the_test_fake_conforms_to_the_same_protocol():
    """Fakes don't inherit the Protocol, so this is the only thing that catches a
    fake drifting from a signature the production repository no longer has."""
    assert isinstance(FakeUserRepository(), UserRepository)


def test_an_incomplete_fake_does_not_conform():
    class Incomplete:
        def get(self, user_id):
            return None

    assert not isinstance(Incomplete(), UserRepository)


@pytest.mark.django_db
class TestDjangoUserRepository:
    def test_get_by_email_normalizes_case(self):
        """No caller can accidentally do a case-sensitive lookup (D24)."""
        user = UserFactory(email="person@example.com")
        assert DjangoUserRepository().get_by_email("PERSON@Example.COM") == user

    def test_get_by_email_ignores_soft_deleted_users(self):
        user = UserFactory(email="gone@example.com")
        user.soft_delete()
        assert DjangoUserRepository().get_by_email("gone@example.com") is None

    def test_add_hashes_the_password(self):
        repository = DjangoUserRepository()
        user = repository.add(
            email="New@Example.com",
            password="plain-text-12345",
            first_name="A",
            last_name="B",
            role=Role.OPERATOR,
        )
        assert user.password != "plain-text-12345"
        assert user.check_password("plain-text-12345")

    def test_soft_delete_sets_marker_and_actor_together(self):
        actor = UserFactory()
        target = UserFactory()
        DjangoUserRepository().soft_delete(target, by=actor)
        reloaded = type(target).all_objects.get(pk=target.pk)
        assert reloaded.deleted_at is not None
        assert reloaded.deleted_by == actor
