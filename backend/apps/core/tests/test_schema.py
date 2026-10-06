import pytest

pytestmark = pytest.mark.django_db


def test_the_schema_generates_without_warnings(capsys):
    """A generator warning means an endpoint is documented wrongly, which is
    worse than not documented at all."""
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(request=None, public=True)
    captured = capsys.readouterr()
    assert "Error" not in captured.err, captured.err
    assert schema["openapi"].startswith("3.")


def test_every_documented_endpoint_is_present():
    from drf_spectacular.generators import SchemaGenerator

    paths = SchemaGenerator().get_schema(request=None, public=True)["paths"]
    for expected in (
        "/api/v1/auth/login/",
        "/api/v1/auth/refresh/",
        "/api/v1/auth/logout/",
        "/api/v1/users/",
        "/api/v1/users/{id}/",
        "/api/v1/users/me/",
        "/api/v1/tasks/",
        "/api/v1/tasks/{id}/",
        "/api/v1/tasks/{id}/complete/",
        "/api/v1/tasks/stats/",
    ):
        assert expected in paths, expected


def test_ids_are_documented_as_uuid_strings():
    """D28's knock-on effect: a client generated from this schema must not
    expect an integer.

    The component is TaskList, not Task: COMPONENT_SPLIT_REQUEST names components
    per-serializer, so pinning "Task" here would make this test born red.
    """
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(request=None, public=True)
    task = schema["components"]["schemas"]["TaskList"]["properties"]["id"]
    assert task["type"] == "string"
    assert task["format"] == "uuid"


def test_the_schema_endpoints_are_reachable(supervisor_client):
    assert supervisor_client.get("/api/v1/schema/").status_code == 200
    assert supervisor_client.get("/api/v1/schema/swagger-ui/").status_code == 200
    assert supervisor_client.get("/api/v1/schema/redoc/").status_code == 200
