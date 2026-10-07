import pytest

from apps.core.roles import Role
from apps.users.dto import UserCreateInput, UserUpdateInput
from apps.users.models import User
from apps.users.services import EmailAlreadyInUse, UserService
from apps.users.tests.fakes import FakeUserRepository

# Needed for transaction.atomic(), not for persistence: the fake repository
# stores everything in memory and nothing reaches a table.
pytestmark = pytest.mark.django_db


def service(users=None) -> UserService:
    return UserService(users=FakeUserRepository(users or []))


def test_create_hashes_the_password_and_normalizes_the_email():
    created = service().create(
        data=UserCreateInput(
            email="New.Person@Example.COM",
            password="a-good-password-1",
            first_name="New",
            last_name="Person",
            role=str(Role.OPERATOR),
        ),
        actor=User(email="admin@example.com", role=Role.ADMIN),
    )
    assert created.email == "new.person@example.com"
    assert created.check_password("a-good-password-1")


def test_create_rejects_an_email_already_held_by_a_live_user():
    existing = User(email="taken@example.com", role=Role.OPERATOR)
    with pytest.raises(EmailAlreadyInUse) as caught:
        service([existing]).create(
            data=UserCreateInput(
                email="TAKEN@example.com",
                password="a-good-password-1",
                first_name="A",
                last_name="B",
                role=str(Role.OPERATOR),
            ),
            actor=User(email="admin@example.com", role=Role.ADMIN),
        )
    assert caught.value.default_code == "email_already_in_use"


def test_update_applies_only_the_supplied_fields():
    target = User(
        email="target@example.com",
        first_name="Old",
        last_name="Name",
        role=Role.OPERATOR,
        is_active=True,
    )
    updated = service([target]).update(
        user=target,
        data=UserUpdateInput(first_name="New"),
        actor=User(email="admin@example.com", role=Role.ADMIN),
    )
    assert updated.first_name == "New"
    assert updated.last_name == "Name"


def test_update_rehashes_a_supplied_password():
    target = User(email="target@example.com", role=Role.OPERATOR)
    target.set_password("original-password")
    updated = service([target]).update(
        user=target,
        data=UserUpdateInput(password="replacement-password"),
        actor=User(email="admin@example.com", role=Role.ADMIN),
    )
    assert updated.check_password("replacement-password")


def test_delete_soft_deletes_and_records_the_actor():
    target = User(email="target@example.com", role=Role.OPERATOR)
    actor = User(email="admin@example.com", role=Role.ADMIN)
    repository = FakeUserRepository([target])
    UserService(users=repository).delete(user=target, actor=actor)
    assert repository.deleted == [target]
