"""Shared pytest fixtures: an anonymous client, one user per role, and an
authenticated client per role.

force_authenticate bypasses the JWT layer deliberately — Tasks 18 and 19 test the
token flow itself, and every other API test should not pay for a login round-trip.
"""

import pytest
from rest_framework.test import APIClient

from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory


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
