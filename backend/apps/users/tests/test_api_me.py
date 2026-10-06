import pytest

pytestmark = pytest.mark.django_db
URL = "/api/v1/users/me/"


@pytest.mark.parametrize("client_fixture", ["admin_client", "supervisor_client", "operator_client"])
def test_every_authenticated_role_can_read_its_own_identity(request, client_fixture):
    """It is identity, not user management: the SPA needs its role to route."""
    response = request.getfixturevalue(client_fixture).get(URL)
    assert response.status_code == 200
    assert set(response.data) == {"id", "email", "first_name", "last_name", "role"}


def test_unauthenticated_me_is_401(api_client):
    assert api_client.get(URL).status_code == 401
