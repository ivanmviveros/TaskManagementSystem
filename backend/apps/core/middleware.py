"""Request-scoped logging context: a request id for every request, and one access
line per request."""

import logging
import time
from collections.abc import Callable
from typing import Any

from django.http import HttpRequest, HttpResponse

from apps.core.request_context import (
    REQUEST_ID_HEADER,
    accept_request_id,
    bind_request_id,
    reset_request_id,
)

logger = logging.getLogger(__name__)


class RequestIdMiddleware:
    """Bind a request id for the whole request, echo it, and log the outcome.

    Registered first in MIDDLEWARE, so the id is bound before any other
    middleware runs and every log line of the request carries it, through
    `RequestIdFilter`. The id is unbound afterwards even if the view raises, so a
    worker thread never leaks one request's id into the next.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = accept_request_id(request.headers.get(REQUEST_ID_HEADER))
        token = bind_request_id(request_id)
        started = time.perf_counter()
        try:
            response = self.get_response(request)
            response[REQUEST_ID_HEADER] = request_id
            logger.log(
                _level_for(response.status_code),
                "http.request",
                extra={
                    "method": request.method,
                    # The path only. A query string can hold search terms and
                    # email addresses, which do not belong in logs (backend §28).
                    "path": request.path,
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    "actor_id": _actor_id(request),
                },
            )
            return response
        finally:
            reset_request_id(token)


def _level_for(status: int) -> int:
    if status >= 500:
        return logging.ERROR
    if status >= 400:
        return logging.WARNING
    return logging.INFO


def _actor_id(request: HttpRequest) -> Any:
    # DRF writes the authenticated user back onto the Django request, so this
    # reads the JWT user after the view has run. No user, or an anonymous one,
    # means the request was not authenticated.
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None
    return user.pk
