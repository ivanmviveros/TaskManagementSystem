"""The request id crosses the broker: the request that enqueues a task stamps the
message, and the worker binds that id while the task runs. Every signal is sent
through Celery's real dispatcher, so these tests also prove the handlers are
connected."""

import logging
import uuid

import pytest
from celery.app.task import Context
from celery.signals import before_task_publish, task_postrun, task_prerun

from apps.core.log_formatting import RequestIdFilter
from apps.core.request_context import bind_request_id, get_request_id, reset_request_id
from apps.notifications.tasks import send_task_event_email


@pytest.fixture
def bound():
    """Run the test inside a request whose id is 'req-1'."""
    token = bind_request_id("req-1")
    yield "req-1"
    reset_request_id(token)


class FakeTask:
    """Just enough of a Task for the handlers. Hashable, as Celery's receiver cache
    keys on the sender."""

    def __init__(self, request: Context) -> None:
        self.request = request


def run_task(request_fields, task_id="task-1"):
    """Send the prerun signal for a task whose request has these fields, as the
    worker's tracer does, and return the id bound while it 'runs'."""
    task = FakeTask(Context(request_fields))
    task_prerun.send(sender=task, task_id=task_id, task=task, args=(), kwargs={})
    try:
        return get_request_id()
    finally:
        task_postrun.send(
            sender=task, task_id=task_id, task=task, args=(), kwargs={}, retval=None, state=""
        )


def publish() -> dict:
    headers: dict = {}
    before_task_publish.send(sender="some.task", body=None, headers=headers)
    return headers


def test_publishing_inside_a_request_stamps_the_message(bound):
    assert publish() == {"request_id": bound}


def test_publishing_outside_a_request_adds_nothing():
    assert publish() == {}


def test_a_worker_binds_the_id_from_the_message_and_unbinds_it_afterwards():
    # A worker turns message headers into attributes of task.request.
    assert run_task({"request_id": "req-from-web"}) == "req-from-web"
    assert get_request_id() is None


def test_an_eager_apply_with_headers_binds_the_id_from_them():
    # Task.apply() keeps the headers nested under request.headers instead.
    assert run_task({"headers": {"request_id": "req-from-apply"}}) == "req-from-apply"


def test_an_eager_task_inside_a_request_keeps_the_request_id_and_restores_it(bound):
    assert run_task({}) == bound
    assert get_request_id() == bound


def test_a_task_with_no_originating_request_is_identified_by_its_own_id():
    # Beat's hourly sweep has no request; its task id still groups its lines.
    assert run_task({}, task_id="sweep-run-7") == "sweep-run-7"
    assert get_request_id() is None


def test_a_malformed_id_in_a_message_is_replaced():
    bound_while_running = run_task({"request_id": "evil\nforged"})
    assert uuid.UUID(bound_while_running).version == 7


@pytest.mark.django_db
def test_lines_a_task_logs_carry_the_request_id_that_enqueued_it(bound):
    records = []

    class Collector(logging.Handler):
        def emit(self, record):
            records.append(record)

    collector = Collector()
    collector.addFilter(RequestIdFilter())
    logger = logging.getLogger("apps.notifications.tasks")
    logger.addHandler(collector)
    try:
        # Eager under the test settings: runs now, through the real tracer and
        # its prerun/postrun signals. The ids exist nowhere, so the task logs
        # that its target is missing and returns.
        send_task_event_email.delay(
            event="ASSIGNED",
            task_id=str(uuid.uuid7()),
            recipient_id=str(uuid.uuid7()),
            dedupe_key="k",
        )
    finally:
        logger.removeHandler(collector)
    assert records, "the task logged its outcome"
    assert {r.request_id for r in records} == {bound}


def test_celery_leaves_the_root_logger_to_django(settings):
    # Otherwise the worker replaces the JSON handler with its own text one.
    from config.celery import app

    assert settings.CELERY_WORKER_HIJACK_ROOT_LOGGER is False
    assert app.conf.worker_hijack_root_logger is False
