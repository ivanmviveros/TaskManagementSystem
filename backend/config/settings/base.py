"""Settings shared by every environment. Reads configuration from the environment only."""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise ImproperlyConfigured(f"Missing required environment variable: {name}")
    return value


def env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "insecure-development-key-override-in-env")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "simple_history",
    "corsheaders",
    "drf_spectacular",
    # Local apps are appended by the task that CREATES them — Task 7 (core),
    # Task 12 (users), Task 21 (tasks), Task 33 (notifications). Listing an app
    # before its package exists makes `manage.py check` a ModuleNotFoundError,
    # and `compat` stage 1 ships in Task 5.
]

INSTALLED_APPS += ["apps.core", "apps.users", "apps.tasks", "apps.notifications"]

AUTH_USER_MODEL = "users.User"

# auth.E003 requires USERNAME_FIELD to carry a *total* unique constraint, and
# Options.total_unique_constraints deliberately excludes partial ones. D21 needs
# the constraint to be partial so a deleted user's email becomes reusable, so the
# check cannot be satisfied — only silenced. The guarantee it would have given is
# covered instead by test_two_live_users_cannot_share_an_email (Task 12).
SILENCED_SYSTEM_CHECKS = ["auth.E003"]

MIDDLEWARE = [
    # First, so the request id is bound before anything else runs and every log
    # line of the request carries it.
    "apps.core.middleware.RequestIdMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "taskmanagement"),
        "USER": env("POSTGRES_USER", "taskmanagement"),
        "PASSWORD": env("POSTGRES_PASSWORD", "taskmanagement"),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
    }
}

# Redis, not LocMemCache: LocMemCache is per-process, so each gunicorn worker would
# keep a private throttle counter and the effective limit would be rate x workers.
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "throttle": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL},
}

USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "en-us"
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPageNumberPagination",
    "PAGE_SIZE": 20,
    # SearchFilter is deliberately absent: only UserViewSet searches, and listing it
    # globally would make it a duplicate once that viewset declares it explicitly.
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "apps.core.ordering.TiebrokenOrderingFilter",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "20/min",
        "user": "120/min",
        "login": "5/min",
        "refresh": "30/min",
    },
    "UNAUTHENTICATED_USER": None,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Task Management API",
    "DESCRIPTION": "Role-based task management. Three roles with strictly separated capabilities.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = None  # nothing reads a task result
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = 120
# Keep LOGGING's JSON handler in the worker. By default Celery replaces the root
# logger's handlers with its own plain-text one.
CELERY_WORKER_HIJACK_ROOT_LOGGER = False
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@taskmanagement.local")
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", "http://localhost:5173")

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True  # so the refresh cookie flows
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")
# CORS_ALLOW_ALL_ORIGINS is never set (backend §22). Django's CSRF middleware stays
# enabled and is never globally disabled (backend §21): every endpoint other than
# the two auth routes authenticates via `Authorization: Bearer`, which the browser
# never attaches automatically and which is therefore immune to CSRF.

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    # The default is "id" already, but the claim now carries a UUID *string*, so
    # nothing downstream may assume an integer.
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", False)  # True in production.py

# Structured logs (backend §28): one JSON object per line on stderr, each stamped
# with the request id that RequestIdMiddleware binds. Every logger goes through
# the one handler, so Django's, Celery's and ours share the format.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "apps.core.log_formatting.RequestIdFilter"}},
    "formatters": {"json": {"()": "apps.core.log_formatting.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_id"],
        },
        # A logger with no handlers and no propagation falls through to Python's
        # last-resort handler, which prints warnings as plain text. This one
        # discards them instead.
        "discard": {"class": "logging.NullHandler"},
    },
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
    "loggers": {
        # Django's defaults give these loggers their own plain-text handlers, so
        # each of their lines would also print unstructured. Clearing them leaves
        # propagation to the JSON root handler.
        "django": {"handlers": [], "level": "INFO"},
        # RequestIdMiddleware already logs every request with its status. Django
        # logs a 4xx again *after* the middleware has unbound the id, so only its
        # errors are kept; an unhandled exception is logged inside the request,
        # with its id and traceback.
        "django.request": {"level": "ERROR"},
        # runserver's own access line duplicates the middleware's, but it has no
        # request id and it logs the full query string, which can hold search terms
        # and emails. The middleware's line replaces it.
        "django.server": {"handlers": ["discard"], "propagate": False},
    },
}
