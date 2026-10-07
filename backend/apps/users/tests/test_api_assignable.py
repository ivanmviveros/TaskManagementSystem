"""GET /users/assignable/ — the assignee picker's options (D61, D64).

The picker used to page /users/ at the 100-row cap and filter Admins out in the
SPA: users past the first page could never be chosen, and D17 was re-derived on
the client. This endpoint reports the assignable set instead — paged and
searchable (D64), so the picker fetches what it shows rather than everyone.
"""

import pytest
from django.utils import timezone

from apps.core.roles import Role
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/users/assignable/"


def test_it_returns_a_page_and_the_total(supervisor_client, supervisor):
    OperatorFactory.create_batch(120)
    response = supervisor_client.get(URL)
    assert response.status_code == 200
    # The standard page envelope, so the picker can say "20 of 121" and ask for more.
    assert response.data["count"] == 121  # 120 operators + the requesting supervisor
    assert len(response.data["results"]) == 20
    assert response.data["next"] is not None


def test_every_assignable_user_is_reachable_page_by_page(supervisor_client, supervisor):
    # More than max_page_size (100): the old picker silently dropped the rest.
    OperatorFactory.create_batch(120)
    first = supervisor_client.get(URL, {"page_size": 100}).data
    second = supervisor_client.get(URL, {"page_size": 100, "page": 2}).data
    ids = {row["id"] for row in first["results"]} | {row["id"] for row in second["results"]}
    assert len(ids) == 121
    assert second["next"] is None


def test_it_searches_email_and_names(supervisor_client):
    OperatorFactory(email="amy@example.com", first_name="Amy", last_name="Pond")
    OperatorFactory(email="rory@example.com", first_name="Rory", last_name="Williams")
    by_name = supervisor_client.get(URL, {"search": "willi"}).data["results"]
    by_email = supervisor_client.get(URL, {"search": "amy@"}).data["results"]
    assert [row["email"] for row in by_name] == ["rory@example.com"]
    assert [row["email"] for row in by_email] == ["amy@example.com"]


def test_it_never_offers_an_admin(supervisor_client):
    """D17, applied by the server so the SPA no longer has to re-derive it."""
    AdminFactory()
    OperatorFactory()
    roles = {row["role"] for row in supervisor_client.get(URL).data["results"]}
    assert Role.ADMIN not in roles
    assert roles == {Role.SUPERVISOR, Role.OPERATOR}


def test_a_search_cannot_surface_an_admin(supervisor_client):
    # The search narrows the assignable set; it never widens it.
    AdminFactory(email="findme-admin@example.com")
    response = supervisor_client.get(URL, {"search": "findme"})
    assert response.data["count"] == 0


def test_it_excludes_soft_deleted_users(supervisor_client):
    gone = OperatorFactory()
    gone.deleted_at = timezone.now()
    gone.save()
    emails = {row["email"] for row in supervisor_client.get(URL).data["results"]}
    assert gone.email not in emails


def test_it_exposes_only_the_minimal_fields(supervisor_client):
    """PRIVILEGE BOUNDARY: a Supervisor sees the minimal shape, as on /users/."""
    OperatorFactory()
    row = supervisor_client.get(URL).data["results"][0]
    assert set(row) == {"id", "email", "first_name", "last_name", "role"}


def test_it_is_ordered_by_email(supervisor_client):
    OperatorFactory(email="zed@example.com")
    OperatorFactory(email="amy@example.com")
    SupervisorFactory(email="mid@example.com")
    emails = [row["email"] for row in supervisor_client.get(URL).data["results"]]
    assert emails == sorted(emails)
