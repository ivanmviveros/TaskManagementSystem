"""Shared pytest fixtures: an anonymous client, one user per role, and an
authenticated client per role.

force_authenticate bypasses the JWT layer deliberately — Tasks 18 and 19 test the
token flow itself, and every other API test should not pay for a login round-trip.
"""

import pytest
from rest_framework.test import APIClient

from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory


@pytest.fixture(autouse=True)
def _clear_throttle_counters():
    """Clear BOTH caches. The scoped login/refresh throttles use caches["throttle"],
    but DRF's AnonRateThrottle and UserRateThrottle use caches["default"] — and a
    LocMemCache lives for the whole pytest process, so an uncleared anon counter
    leaks across tests and surfaces as a mystery 429 in an unrelated module.
    Task 32's matrix suite fires 13 consecutive anonymous requests against a
    20/min limit, which is close enough to matter.
    """
    from django.core.cache import caches

    for alias in ("default", "throttle"):
        caches[alias].clear()
    yield
    for alias in ("default", "throttle"):
        caches[alias].clear()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def admin(db):
    return AdminFactory()


@pytest.fixture
def supervisor(db):
    return SupervisorFactory()


@pytest.fixture
def operator(db):
    return OperatorFactory()


def _authenticated(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin_client(admin) -> APIClient:
    return _authenticated(admin)


@pytest.fixture
def supervisor_client(supervisor) -> APIClient:
    return _authenticated(supervisor)


@pytest.fixture
def operator_client(operator) -> APIClient:
    return _authenticated(operator)
