import pytest

from apps.users.tests.factories import DEFAULT_PASSWORD, OperatorFactory

pytestmark = pytest.mark.django_db
LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
COOKIE = "refresh_token"


def login(api_client, user, password=DEFAULT_PASSWORD):
    return api_client.post(LOGIN, {"email": user.email, "password": password}, format="json")


def test_login_returns_an_access_token_and_the_current_user(api_client):
    user = OperatorFactory()
    response = login(api_client, user)
    assert response.status_code == 200
    assert response.data["access"]
    assert response.data["user"]["email"] == user.email
    assert response.data["user"]["role"] == user.role


def test_login_response_body_contains_no_refresh_token(api_client):
    """Root AGENTS.md § Authentication: the refresh token is only ever a cookie."""
    response = login(api_client, OperatorFactory())
    assert "refresh" not in response.data


def test_refresh_cookie_is_httponly_and_path_scoped(api_client):
    response = login(api_client, OperatorFactory())
    cookie = response.cookies[COOKIE]
    assert cookie["httponly"]
    assert cookie["samesite"].lower() == "strict"
    # Not attached to ordinary API requests — only where it is needed.
    assert cookie["path"] == "/api/v1/auth/"


def test_wrong_password_is_401_and_does_not_set_a_cookie(api_client):
    user = OperatorFactory()
    response = login(api_client, user, password="definitely-wrong")
    assert response.status_code == 401
    assert COOKIE not in response.cookies


def test_a_soft_deleted_user_cannot_log_in(api_client):
    user = OperatorFactory()
    user.soft_delete()
    assert login(api_client, user).status_code == 401


def test_an_inactive_but_undeleted_user_cannot_log_in(api_client):
    user = OperatorFactory()
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert login(api_client, user).status_code == 401


def test_the_sixth_login_attempt_in_a_minute_is_throttled(api_client, settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]},
    }
    user = OperatorFactory()
    for _ in range(5):
        login(api_client, user, password="wrong")
    response = login(api_client, user, password="wrong")
    assert response.status_code == 429
    assert "Retry-After" in response


def test_access_token_authenticates_a_subsequent_request(api_client):
    user = OperatorFactory()
    access = login(api_client, user).data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert api_client.get("/api/v1/users/me/").status_code == 200


def test_refresh_reads_the_cookie_and_returns_a_new_access_token(api_client):
    login(api_client, OperatorFactory())
    response = api_client.post(REFRESH, {}, format="json")
    assert response.status_code == 200
    assert response.data["access"]
    assert "refresh" not in response.data


def test_refresh_rotates_the_cookie(api_client):
    original = login(api_client, OperatorFactory()).cookies[COOKIE].value
    rotated = api_client.post(REFRESH, {}, format="json").cookies[COOKIE].value
    assert rotated != original


def test_refresh_without_a_cookie_is_401(api_client):
    response = api_client.post(REFRESH, {}, format="json")
    assert response.status_code == 401
    assert response.data["code"] == "refresh_cookie_missing"


def test_a_rotated_refresh_token_is_blacklisted(api_client):
    client_cookie = login(api_client, OperatorFactory()).cookies[COOKIE].value
    api_client.post(REFRESH, {}, format="json")  # rotates; blacklists the old one
    api_client.cookies[COOKIE] = client_cookie  # replay the original
    assert api_client.post(REFRESH, {}, format="json").status_code == 401


def test_logout_blacklists_the_token_clears_the_cookie_and_blocks_refresh(api_client):
    user = OperatorFactory()
    access = login(api_client, user).data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.post(LOGOUT, {}, format="json")
    assert response.status_code == 204
    assert response.cookies[COOKIE].value == ""
    assert api_client.post(REFRESH, {}, format="json").status_code == 401


def test_logout_requires_authentication(api_client):
    assert api_client.post(LOGOUT, {}, format="json").status_code == 401
