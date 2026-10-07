"""Every request gets an id, every log line written while serving it carries that
id, the response echoes it, and one access line records how the request ended."""

import logging
import uuid

import pytest
from django.http import HttpResponse
from django.test import RequestFactory

from apps.core.log_formatting import RequestIdFilter
from apps.core.middleware import RequestIdMiddleware
from apps.core.request_context import get_request_id


class _Collector(logging.Handler):
    """Captures records the way the real console handler sees them: through the
    request-id filter, at the moment they are emitted."""

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.addFilter(RequestIdFilter())
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture
def logs():
    collector = _Collector()
    root = logging.getLogger()
    root.addHandler(collector)
    yield collector.records
    root.removeHandler(collector)


def access_lines(records):
    return [r for r in records if r.name == "apps.core.middleware" and r.msg == "http.request"]


@pytest.mark.django_db
def test_a_response_carries_a_generated_request_id(api_client):
    response = api_client.get("/api/v1/users/me/")
    assert uuid.UUID(response["X-Request-ID"]).version == 7


@pytest.mark.django_db
def test_a_well_formed_incoming_request_id_is_echoed(api_client):
    response = api_client.get("/api/v1/users/me/", HTTP_X_REQUEST_ID="edge-proxy.42")
    assert response["X-Request-ID"] == "edge-proxy.42"


@pytest.mark.django_db
def test_a_malformed_incoming_request_id_is_replaced(api_client):
    response = api_client.get("/api/v1/users/me/", HTTP_X_REQUEST_ID="bad id")
    assert uuid.UUID(response["X-Request-ID"]).version == 7


@pytest.mark.django_db
def test_every_line_logged_while_serving_a_request_carries_its_id(api_client, logs, supervisor):
    response = api_client.post(
        "/api/v1/auth/login/",
        {"email": supervisor.email, "password": "wrong"},
        format="json",
    )
    assert response.status_code == 401
    request_id = response["X-Request-ID"]
    failed = [r for r in logs if r.getMessage().startswith("auth.login_failed")]
    assert failed, "the view logs the failed attempt"
    assert {r.request_id for r in failed + access_lines(logs)} == {request_id}


@pytest.mark.django_db
def test_two_requests_never_share_an_id(api_client, logs):
    first = api_client.get("/api/v1/users/me/")["X-Request-ID"]
    second = api_client.get("/api/v1/users/me/")["X-Request-ID"]
    assert first != second
    assert [r.request_id for r in access_lines(logs)] == [first, second]


@pytest.mark.django_db
def test_the_access_line_records_how_the_request_ended(supervisor_client, supervisor, logs):
    supervisor_client.get("/api/v1/tasks/?search=confidential&status=PENDING")
    (line,) = access_lines(logs)
    assert line.levelno == logging.INFO
    assert line.method == "GET"
    # The path only: query strings can hold search terms and emails (backend §28).
    assert line.path == "/api/v1/tasks/"
    assert line.status == 200
    assert isinstance(line.duration_ms, float) and line.duration_ms >= 0
    assert str(line.actor_id) == str(supervisor.pk)


@pytest.mark.django_db
def test_an_anonymous_request_has_no_actor(api_client, logs):
    api_client.get("/api/v1/users/me/")
    (line,) = access_lines(logs)
    assert line.actor_id is None


@pytest.mark.parametrize(
    ("status", "level"),
    [(200, logging.INFO), (302, logging.INFO), (404, logging.WARNING), (503, logging.ERROR)],
)
def test_the_access_line_level_follows_the_status(status, level, logs):
    middleware = RequestIdMiddleware(lambda request: HttpResponse(status=status))
    middleware(RequestFactory().get("/anything/"))
    (line,) = access_lines(logs)
    assert line.levelno == level


def test_the_id_is_bound_while_the_view_runs_and_unbound_afterwards():
    seen = []

    def view(request):
        seen.append(get_request_id())
        return HttpResponse()

    response = RequestIdMiddleware(view)(RequestFactory().get("/", HTTP_X_REQUEST_ID="abc"))
    assert seen == ["abc"]
    assert response["X-Request-ID"] == "abc"
    assert get_request_id() is None


def test_the_id_is_unbound_even_when_the_view_raises():
    def view(request):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        RequestIdMiddleware(view)(RequestFactory().get("/"))
    assert get_request_id() is None


def test_the_middleware_is_outermost(settings):
    # Outermost, so even CORS preflights and responses rejected by inner
    # middleware are logged with an id.
    assert settings.MIDDLEWARE[0] == "apps.core.middleware.RequestIdMiddleware"
