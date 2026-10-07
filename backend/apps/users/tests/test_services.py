import pytest

from apps.core.roles import Role
from apps.users.dto import UserCreateInput, UserUpdateInput
from apps.users.models import User
from apps.users.services import CannotChangeOwnAccess, EmailAlreadyInUse, UserService
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


def test_update_refuses_an_actor_changing_their_own_role():
    me = User(email="me@example.com", role=Role.ADMIN, is_active=True)
    with pytest.raises(CannotChangeOwnAccess) as caught:
        service([me]).update(user=me, data=UserUpdateInput(role=str(Role.OPERATOR)), actor=me)
    assert caught.value.default_code == "cannot_change_own_access"
    assert me.role == Role.ADMIN


def test_update_refuses_an_actor_deactivating_themselves():
    me = User(email="me@example.com", role=Role.ADMIN, is_active=True)
    with pytest.raises(CannotChangeOwnAccess):
        service([me]).update(user=me, data=UserUpdateInput(is_active=False), actor=me)
    assert me.is_active is True


def test_update_lets_an_actor_save_their_own_form_unchanged():
    """UserEditPage always sends role and is_active (D66): unchanged values must pass."""
    me = User(email="me@example.com", first_name="Old", role=Role.ADMIN, is_active=True)
    updated = service([me]).update(
        user=me,
        data=UserUpdateInput(
            first_name="New", role=str(Role.ADMIN), is_active=True, password="a-new-password-1"
        ),
        actor=me,
    )
    assert updated.first_name == "New"
    assert updated.check_password("a-new-password-1")


def test_update_still_lets_an_admin_demote_and_deactivate_someone_else():
    other = User(email="other@example.com", role=Role.ADMIN, is_active=True)
    actor = User(email="me@example.com", role=Role.ADMIN)
    updated = service([other]).update(
        user=other,
        data=UserUpdateInput(role=str(Role.OPERATOR), is_active=False),
        actor=actor,
    )
    assert updated.role == Role.OPERATOR
    assert updated.is_active is False
