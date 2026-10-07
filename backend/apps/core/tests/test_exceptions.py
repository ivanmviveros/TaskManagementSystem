from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.exceptions import ApplicationError, exception_handler


class Boom(ApplicationError):
    default_detail = "It broke."
    default_code = "boom"
    status_code = 409


def test_application_error_renders_the_shared_shape():
    response = exception_handler(Boom(), {})
    assert response.status_code == 409
    assert response.data == {"detail": "It broke.", "code": "boom", "errors": None}


def test_validation_error_carries_the_per_field_map():
    response = exception_handler(ValidationError({"assignee": ["nope"]}), {})
    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert response.data["errors"] == {"assignee": ["nope"]}


def test_drf_exception_code_is_preserved():
    """IsTaskCreator raises PermissionDenied(code="delete_requires_creator");
    that code must survive the handler, not be flattened to permission_denied."""
    response = exception_handler(
        PermissionDenied(detail="Only the creator may delete.", code="delete_requires_creator"), {}
    )
    assert response.status_code == 403
    assert response.data["code"] == "delete_requires_creator"


def test_unexpected_exception_is_not_handled_here():
    """A bare exception must fall through to Django's 500 — never leak a trace."""
    assert exception_handler(RuntimeError("secret connection string"), {}) is None
