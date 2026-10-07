"""GET /users/assignable/ — the assignee picker's options (D47).

The picker used to page /users/ at the 100-row cap and filter Admins out in the
SPA: users past the first page could never be chosen, and D17 was re-derived on
the client. This endpoint reports the whole assignable set instead.
"""

import pytest
from django.utils import timezone

from apps.core.roles import Role
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/users/assignable/"


def test_it_returns_every_assignable_user_beyond_one_page(supervisor_client, supervisor):
    # More than max_page_size (100): the old picker silently dropped the rest.
    OperatorFactory.create_batch(120)
    response = supervisor_client.get(URL)
    assert response.status_code == 200
    # A plain list, not a page: the picker needs the whole set in one answer.
    assert isinstance(response.data, list)
    assert len(response.data) == 121  # 120 operators + the requesting supervisor


def test_it_never_offers_an_admin(supervisor_client):
    """D17, applied by the server so the SPA no longer has to re-derive it."""
    AdminFactory()
    OperatorFactory()
    roles = {row["role"] for row in supervisor_client.get(URL).data}
    assert Role.ADMIN not in roles
    assert roles == {Role.SUPERVISOR, Role.OPERATOR}


def test_it_excludes_soft_deleted_users(supervisor_client):
    gone = OperatorFactory()
    gone.deleted_at = timezone.now()
    gone.save()
    emails = {row["email"] for row in supervisor_client.get(URL).data}
    assert gone.email not in emails


def test_it_exposes_only_the_minimal_fields(supervisor_client):
    """PRIVILEGE BOUNDARY: a Supervisor sees the minimal shape, as on /users/."""
    OperatorFactory()
    row = supervisor_client.get(URL).data[0]
    assert set(row) == {"id", "email", "first_name", "last_name", "role"}


def test_it_is_ordered_by_email(supervisor_client):
    OperatorFactory(email="zed@example.com")
    OperatorFactory(email="amy@example.com")
    SupervisorFactory(email="mid@example.com")
    emails = [row["email"] for row in supervisor_client.get(URL).data]
    assert emails == sorted(emails)
