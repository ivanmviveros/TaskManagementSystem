"""The application error hierarchy and the single DRF exception handler.

Every error leaves the API in one shape:
    {"detail": "...", "code": "...", "errors": null}
Stack traces, database errors, secrets and infrastructure details never appear
in a response (backend §18).
"""

import logging

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class ApplicationError(APIException):
    """An expected business error, with a stable machine-readable code."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The request could not be completed."
    default_code = "application_error"


def exception_handler(exc, context) -> Response | None:
    response = drf_exception_handler(exc, context)
    if response is None:
        view = context.get("view")
        logger.exception(
            "api.unhandled_exception", extra={"view": type(view).__name__ if view else None}
        )
        return None  # fall through to Django's 500; never return the detail

    if isinstance(exc, DRFValidationError):
        response.data = {
            "detail": "Invalid input.",
            "code": "validation_error",
            "errors": response.data,
        }
        return response

    code = getattr(exc, "detail", None)
    response.data = {
        "detail": str(exc.detail) if hasattr(exc, "detail") else str(exc),
        "code": getattr(code, "code", None) or getattr(exc, "default_code", "error"),
        "errors": None,
    }
    return response
