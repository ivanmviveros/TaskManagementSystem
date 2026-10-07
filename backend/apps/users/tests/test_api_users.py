import pytest

from apps.core.roles import Role
from apps.users.models import User
from apps.users.tests.factories import OperatorFactory, UserFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/users/"


def test_unauthenticated_requests_are_rejected(api_client):
    assert api_client.get(URL).status_code == 401


def test_admin_lists_users_with_the_full_serializer(admin_client):
    UserFactory()
    response = admin_client.get(URL)
    assert response.status_code == 200
    assert "is_staff" in response.data["results"][0]
    assert "count" in response.data and "next" in response.data


def test_supervisor_lists_users_with_the_minimal_serializer(supervisor_client):
    """The direct test of spec §7.2 rule 2."""
    UserFactory()
    response = supervisor_client.get(URL)
    assert response.status_code == 200
    row = response.data["results"][0]
    assert set(row) == {"id", "email", "first_name", "last_name", "role"}
    assert "is_staff" not in row
    assert "last_login" not in row


def test_supervisor_cannot_write_users(supervisor_client, operator):
    payload = {
        "email": "x@example.com",
        "password": "a-strong-password-1",
        "first_name": "A",
        "last_name": "B",
        "role": Role.OPERATOR,
    }
    assert supervisor_client.post(URL, payload, format="json").status_code == 403
    assert (
        supervisor_client.patch(
            f"{URL}{operator.pk}/", {"first_name": "X"}, format="json"
        ).status_code
        == 403
    )
    assert supervisor_client.delete(f"{URL}{operator.pk}/").status_code == 403


def test_operator_has_no_user_surface(operator_client, supervisor):
    assert operator_client.get(URL).status_code == 403
    assert operator_client.get(f"{URL}{supervisor.pk}/").status_code == 403


def test_admin_creates_a_user(admin_client):
    response = admin_client.post(
        URL,
        {
            "email": "Created@Example.com",
            "password": "a-strong-password-1",
            "first_name": "Created",
            "last_name": "Person",
            "role": Role.OPERATOR,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["email"] == "created@example.com"
    assert "password" not in response.data
    assert User.objects.filter(email="created@example.com").exists()


def test_creating_a_duplicate_live_email_returns_the_application_error(admin_client):
    UserFactory(email="dupe@example.com")
    response = admin_client.post(
        URL,
        {
            "email": "dupe@example.com",
            "password": "a-strong-password-1",
            "first_name": "A",
            "last_name": "B",
            "role": Role.OPERATOR,
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.data["code"] == "email_already_in_use"


def test_admin_patches_a_user(admin_client):
    target = OperatorFactory()
    response = admin_client.patch(f"{URL}{target.pk}/", {"first_name": "Renamed"}, format="json")
    assert response.status_code == 200
    target.refresh_from_db()
    assert target.first_name == "Renamed"


def test_admin_delete_is_a_soft_delete(admin_client, admin):
    target = OperatorFactory()
    assert admin_client.delete(f"{URL}{target.pk}/").status_code == 204
    assert not User.objects.filter(pk=target.pk).exists()
    archived = User.all_objects.get(pk=target.pk)
    assert archived.deleted_at is not None
    assert archived.deleted_by == admin
    assert archived.is_active is False


def test_a_soft_deleted_user_is_absent_from_the_list(admin_client):
    deleted = UserFactory()
    deleted.soft_delete()
    emails = [row["email"] for row in admin_client.get(URL).data["results"]]
    assert deleted.email not in emails


def test_a_malformed_id_returns_404_without_touching_the_database(admin_client):
    assert admin_client.get(f"{URL}not-a-uuid/").status_code == 404


def test_put_is_method_not_allowed_rather_than_forbidden(admin_client, operator):
    """RolePermission returns True for an unmapped action so DRF can answer 405."""
    assert admin_client.put(f"{URL}{operator.pk}/", {}, format="json").status_code == 405


def test_role_and_is_active_filters(admin_client):
    OperatorFactory()
    inactive = OperatorFactory()
    inactive.is_active = False
    inactive.save(update_fields=["is_active"])
    assert all(
        r["role"] == Role.OPERATOR for r in admin_client.get(f"{URL}?role=OPERATOR").data["results"]
    )
    assert admin_client.get(f"{URL}?is_active=false").data["count"] == 1


def test_page_size_override(admin_client):
    UserFactory.create_batch(5)
    assert len(admin_client.get(f"{URL}?page_size=2").data["results"]) == 2


def test_page_size_is_capped_at_max_page_size(admin_client):
    """Assert the number of ROWS RETURNED, not `count` — `count` is the total and
    `page_size` never affects it, so an assertion on `count` cannot fail."""
    UserFactory.create_batch(4)  # 4 + the admin fixture = 5 live users
    response = admin_client.get(f"{URL}?page_size=5000")
    total = response.data["count"]
    assert len(response.data["results"]) == min(total, 100)


def test_ordering_by_a_non_unique_field_is_tiebroken(admin_client):
    """TiebrokenOrderingFilter appends -id, so paging by `role` is stable."""
    UserFactory.create_batch(6, role=Role.OPERATOR)
    page1 = admin_client.get(f"{URL}?ordering=role&page_size=3").data["results"]
    page2 = admin_client.get(f"{URL}?ordering=role&page_size=3&page=2").data["results"]
    ids = [row["id"] for row in page1 + page2]
    assert len(set(ids)) == len(ids)


def test_admin_cannot_delete_their_own_account(admin_client, admin):
    response = admin_client.delete(f"{URL}{admin.pk}/")
    assert response.status_code == 403
    assert response.data["code"] == "cannot_delete_self"
    assert User.objects.filter(pk=admin.pk).exists()


def test_admin_cannot_demote_themselves(admin_client, admin):
    response = admin_client.patch(f"{URL}{admin.pk}/", {"role": Role.OPERATOR}, format="json")
    assert response.status_code == 400
    assert response.data["code"] == "cannot_change_own_access"
    admin.refresh_from_db()
    assert admin.role == Role.ADMIN


def test_admin_cannot_deactivate_themselves(admin_client, admin):
    response = admin_client.patch(f"{URL}{admin.pk}/", {"is_active": False}, format="json")
    assert response.status_code == 400
    assert response.data["code"] == "cannot_change_own_access"
    admin.refresh_from_db()
    assert admin.is_active is True


def test_admin_can_save_their_own_edit_form_unchanged(admin_client, admin):
    response = admin_client.patch(
        f"{URL}{admin.pk}/",
        {"first_name": "Renamed", "role": Role.ADMIN, "is_active": True},
        format="json",
    )
    assert response.status_code == 200
    admin.refresh_from_db()
    assert admin.first_name == "Renamed"
