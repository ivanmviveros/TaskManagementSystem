import importlib

from django.conf import settings


def test_cors_is_never_wide_open():
    assert getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False) is False
    assert settings.CORS_ALLOWED_ORIGINS


def test_csrf_middleware_is_enabled():
    assert "django.middleware.csrf.CsrfViewMiddleware" in settings.MIDDLEWARE


def test_refresh_tokens_rotate_and_blacklist():
    assert settings.SIMPLE_JWT["ROTATE_REFRESH_TOKENS"] is True
    assert settings.SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"] is True
    assert "rest_framework_simplejwt.token_blacklist" in settings.INSTALLED_APPS


def test_production_settings_assert_the_security_posture(monkeypatch):
    """production.py reads required variables at import time, so they are supplied
    here. A test that needs real secrets to run is a test nobody runs."""
    for name, value in {
        "DJANGO_SECRET_KEY": "test-only-not-a-real-secret",
        "DJANGO_ALLOWED_HOSTS": "example.com",
        "EMAIL_HOST": "smtp.example.com",
        "EMAIL_HOST_USER": "mailer@example.com",
        "EMAIL_HOST_PASSWORD": "test-only-not-a-real-password",
        "DEFAULT_FROM_EMAIL": "no-reply@example.com",
    }.items():
        monkeypatch.setenv(name, value)

    production = importlib.reload(importlib.import_module("config.settings.production"))

    assert production.SECURE_SSL_REDIRECT is True
    assert production.SECURE_HSTS_SECONDS >= 31536000
    assert production.SESSION_COOKIE_SECURE is True
    assert production.CSRF_COOKIE_SECURE is True
    assert production.REFRESH_COOKIE_SECURE is True
    assert production.DEBUG is False
