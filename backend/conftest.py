"""Shared pytest fixtures. Role-specific clients are added in Task 16."""

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()
