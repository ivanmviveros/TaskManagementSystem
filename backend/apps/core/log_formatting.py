"""Structured log output: one JSON object per line, stamped with the request id.

Standard library only. `RequestIdFilter` copies the id from the context variable
onto each record when it is handled, and `JsonFormatter` writes the record as
JSON. Fields passed through `extra=` become top-level keys, so an event is logged
as `logger.info("task.created", extra={"task_id": ...})`, with its data in fields,
not packed into the message text.
"""

import json
import logging
from datetime import UTC, datetime
from typing import Any

from apps.core.request_context import get_request_id

# Every attribute a bare LogRecord carries. Anything else on a record arrived
# through `extra=` and is emitted as a field of its own.
_RECORD_ATTRIBUTES = frozenset(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {
    "message",
    "asctime",
    "request_id",
}


class RequestIdFilter(logging.Filter):
    """Stamp each record with the request id bound when it is emitted.

    Attached to the handler, so it runs in the emitting thread and context, and
    covers third-party loggers (Django, Celery) as well as our own.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


class JsonFormatter(logging.Formatter):
    """Format a record as a single-line JSON object.

    The core keys come first and cannot be overwritten by an `extra=` field of
    the same name. Values JSON cannot represent (UUIDs, datetimes) are written as
    their `str()`. Newlines inside values are escaped, so one record is always
    exactly one line.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        }
        for key, value in vars(record).items():
            if key not in _RECORD_ATTRIBUTES:
                payload.setdefault(key, value)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)
        return json.dumps(payload, default=str)
