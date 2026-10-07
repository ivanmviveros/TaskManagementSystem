"""Carry the request id across the broker, from the request that enqueues a Celery
task to the worker that runs it.

Publishing stamps the id onto the message as a header. Before a task runs, the
id is bound to the worker's context, and after it runs the previous value is
restored. A notification email's log lines therefore share the id of the API
request that caused it, even though they are written by another process.
"""

from contextvars import Token
from typing import Any

from celery.signals import before_task_publish, task_postrun, task_prerun

from apps.core.request_context import (
    accept_request_id,
    bind_request_id,
    get_request_id,
    reset_request_id,
)

MESSAGE_HEADER = "request_id"

# One binding per running task, keyed by task id, so postrun undoes exactly the
# binding its own prerun made, however tasks interleave on a thread.
_bindings: dict[str, Token[str | None]] = {}


def stamp_request_id(headers: dict[str, Any] | None = None, **_: Any) -> None:
    """`before_task_publish`: copy the current request id into the message headers."""
    request_id = get_request_id()
    if headers is not None and request_id is not None:
        headers.setdefault(MESSAGE_HEADER, request_id)


def bind_task_request_id(task_id: str, task: Any, **_: Any) -> None:
    """`task_prerun`: bind the id this task should log under.

    In order of preference:
    1. The id the message carries. A worker exposes message headers as
       attributes of `task.request`; `Task.apply(headers=...)` nests them under
       `task.request.headers` instead.
    2. The id already bound. An eager task runs inside the request that called
       it, which keeps its own id.
    3. The task's own id. Beat's sweep has no originating request, but its lines
       still need grouping.
    """
    request = task.request
    carried = getattr(request, MESSAGE_HEADER, None) or (
        getattr(request, "headers", None) or {}
    ).get(MESSAGE_HEADER)
    # A message is input like any other, so a carried id is validated before it
    # can reach a log line.
    request_id = accept_request_id(carried) if carried else get_request_id() or task_id
    _bindings[task_id] = bind_request_id(request_id)


def reset_task_request_id(task_id: str, **_: Any) -> None:
    """`task_postrun`: restore whatever was bound before the task ran."""
    token = _bindings.pop(task_id, None)
    if token is not None:
        reset_request_id(token)


def connect_request_id_signals() -> None:
    """Connect the three handlers. Idempotent, through the dispatch uids."""
    before_task_publish.connect(
        stamp_request_id, weak=False, dispatch_uid="apps.core.request_id.publish"
    )
    task_prerun.connect(
        bind_task_request_id, weak=False, dispatch_uid="apps.core.request_id.prerun"
    )
    task_postrun.connect(
        reset_task_request_id, weak=False, dispatch_uid="apps.core.request_id.postrun"
    )
