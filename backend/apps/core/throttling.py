"""Scoped throttles. Rates live in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]."""

from django.core.cache import caches
from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """5/min by IP — brute-force defence on the most-attacked endpoint."""

    scope = "login"
    cache = caches["throttle"]


class RefreshRateThrottle(AnonRateThrottle):
    scope = "refresh"
    cache = caches["throttle"]
