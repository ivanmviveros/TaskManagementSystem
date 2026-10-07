"""The request id lives in a context variable, so every log line emitted while
serving one request (or one Celery task) can carry it without being passed
around explicitly."""

import uuid

import pytest

from apps.core.request_context import (
    accept_request_id,
    bind_request_id,
    get_request_id,
    new_request_id,
    reset_request_id,
)


def test_no_request_id_is_bound_outside_a_request():
    assert get_request_id() is None


def test_binding_is_visible_until_reset_restores_the_previous_value():
    token = bind_request_id("outer")
    try:
        inner = bind_request_id("inner")
        assert get_request_id() == "inner"
        reset_request_id(inner)
        assert get_request_id() == "outer"
    finally:
        reset_request_id(token)
    assert get_request_id() is None


def test_a_new_request_id_is_a_uuid7():
    # UUIDv7 like every other id in the system (D28): time-ordered, so sorting
    # request ids roughly sorts requests by start time.
    assert uuid.UUID(new_request_id()).version == 7


def test_new_request_ids_are_unique():
    assert len({new_request_id() for _ in range(100)}) == 100


@pytest.mark.parametrize(
    "candidate",
    ["0199a0f0-0000-7000-8000-000000000001", "trace.abc_123:xyz", "a" * 128],
)
def test_a_well_formed_incoming_id_is_kept(candidate):
    # A proxy or the caller may already have an id; keeping it lets their logs
    # and ours be joined on one value.
    assert accept_request_id(candidate) == candidate


@pytest.mark.parametrize(
    "candidate",
    [
        None,
        "",
        "a" * 129,
        "has space",
        "line\nbreak",  # log injection: a newline would forge a second log line
        'quote"',
        "ünicode",
    ],
)
def test_a_missing_or_malformed_incoming_id_is_replaced(candidate):
    accepted = accept_request_id(candidate)
    assert accepted != candidate
    assert uuid.UUID(accepted).version == 7
