"""One JSON object per log line, each carrying the request id of the request (or
Celery task) that emitted it."""

import json
import logging
import sys
import uuid
from datetime import datetime

from django.utils.log import ServerFormatter

from apps.core.log_formatting import JsonFormatter, RequestIdFilter
from apps.core.request_context import bind_request_id, reset_request_id


def make_record(msg="task.created", args=None, level=logging.INFO, exc_info=None, **extra):
    record = logging.LogRecord(
        name="apps.tasks.services",
        level=level,
        pathname=__file__,
        lineno=1,
        msg=msg,
        args=args,
        exc_info=exc_info,
    )
    record.__dict__.update(extra)
    return record


def emit(record) -> dict:
    """Run a record through the filter and the formatter, as the handler does."""
    RequestIdFilter().filter(record)
    line = JsonFormatter().format(record)
    assert "\n" not in line, "one record must be exactly one line"
    return json.loads(line)


def test_the_filter_stamps_the_bound_request_id():
    token = bind_request_id("req-1")
    try:
        record = make_record()
        assert RequestIdFilter().filter(record) is True
    finally:
        reset_request_id(token)
    assert record.request_id == "req-1"


def test_outside_a_request_the_request_id_is_null():
    assert emit(make_record())["request_id"] is None


def test_a_line_carries_time_level_logger_message_and_request_id():
    token = bind_request_id("req-2")
    try:
        payload = emit(make_record())
    finally:
        reset_request_id(token)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "apps.tasks.services"
    assert payload["message"] == "task.created"
    assert payload["request_id"] == "req-2"
    timestamp = datetime.fromisoformat(payload["timestamp"])
    assert timestamp.utcoffset() is not None and timestamp.utcoffset().total_seconds() == 0
    assert list(payload)[:5] == ["timestamp", "level", "logger", "message", "request_id"]


def test_message_arguments_are_interpolated():
    assert emit(make_record("x=%s y=%s", args=(1, "two")))["message"] == "x=1 y=two"


def test_extra_fields_become_top_level_keys():
    task_id = uuid.uuid7()
    payload = emit(make_record(task_id=task_id, fields=["title"], enqueued=3))
    # Values JSON cannot represent natively are written as their str().
    assert payload["task_id"] == str(task_id)
    assert payload["fields"] == ["title"]
    assert payload["enqueued"] == 3


def test_an_extra_field_cannot_overwrite_a_core_field():
    payload = emit(make_record(level_name="x", logger="spoofed"))
    assert payload["logger"] == "apps.tasks.services"
    assert payload["level_name"] == "x"


def test_standard_record_attributes_are_not_emitted():
    payload = emit(make_record())
    for noise in ("args", "msg", "pathname", "lineno", "process", "thread", "created"):
        assert noise not in payload


def test_an_exception_is_rendered_as_its_traceback():
    try:
        raise ValueError("boom")
    except ValueError:
        payload = emit(make_record(level=logging.ERROR, exc_info=sys.exc_info()))
    assert payload["level"] == "ERROR"
    assert payload["exc_info"].startswith("Traceback")
    assert "ValueError: boom" in payload["exc_info"]


def test_a_requested_stack_is_rendered_too():
    record = make_record()
    record.stack_info = "Stack (most recent call last):\n  File x"
    payload = emit(record)
    assert payload["stack_info"].startswith("Stack (most recent call last)")


def test_settings_route_every_logger_through_the_structured_handler():
    """The LOGGING setting, as Django applied it at startup."""
    (console,) = [h for h in logging.getLogger().handlers if isinstance(h.formatter, JsonFormatter)]
    assert any(isinstance(f, RequestIdFilter) for f in console.filters)
    # Django's own plain-text handlers are gone, so its lines reach the JSON
    # handler through propagation instead of printing a second, unstructured copy.
    assert logging.getLogger("django").handlers == []
    # runserver's own access line is discarded: it carries no request id and logs
    # the full query string, which the middleware's line deliberately omits.
    # pytest attaches capture handlers of its own here, so check for the null
    # handler and the absence of the others rather than the exact list.
    server = logging.getLogger("django.server")
    assert server.propagate is False
    assert any(type(h) is logging.NullHandler for h in server.handlers)
    assert console not in server.handlers
    assert not any(isinstance(h.formatter, ServerFormatter) for h in server.handlers)
    # 4xx lines are the middleware's job; Django's would arrive without an id.
    assert logging.getLogger("django.request").level == logging.ERROR


def test_a_newline_in_a_message_cannot_forge_a_second_line():
    payload = emit(make_record("auth.login_failed email=%s", args=("x\n{forged}",)))
    assert payload["message"] == "auth.login_failed email=x\n{forged}"
