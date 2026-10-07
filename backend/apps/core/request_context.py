"""The id of the request (or Celery task) being served, held in a context variable.

A ContextVar rather than a thread-local: it is isolated per thread *and* per
asyncio task, and a binding is undone with the token it returned, so a nested
binding (an eager Celery task inside a request) restores the outer value exactly.
Log records pick the value up through `RequestIdFilter`; nothing passes it around.
"""

import re
import uuid
from contextvars import ContextVar, Token

REQUEST_ID_HEADER = "X-Request-ID"

# Letters, digits and . _ : - only. A newline or a quote in a client-supplied id
# could otherwise forge or corrupt log lines (backend §28).
_ACCEPTED_REQUEST_ID = re.compile(r"[A-Za-z0-9._:-]{1,128}")

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """Return the id bound to the current context, or None outside a request."""
    return _request_id.get()


def bind_request_id(request_id: str) -> Token[str | None]:
    """Bind `request_id` to the current context.

    Returns:
        The token that `reset_request_id` needs to restore the previous value.
    """
    return _request_id.set(request_id)


def reset_request_id(token: Token[str | None]) -> None:
    """Restore the value that was bound before the binding `token` came from."""
    _request_id.reset(token)


def new_request_id() -> str:
    """Generate a request id: a UUIDv7, time-ordered like every other id here (D28)."""
    return str(uuid.uuid7())


def accept_request_id(candidate: str | None) -> str:
    """Keep a well-formed incoming id, so a caller's logs and ours share one value;
    replace anything missing or malformed with a new id."""
    if candidate and _ACCEPTED_REQUEST_ID.fullmatch(candidate):
        return candidate
    return new_request_id()
