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
