# Task Management System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the role-based task management system specified in [2026-10-05-task-management-system-design.md](../specs/2026-10-05-task-management-system-design.md) — a Django 6 / DRF JSON API with three strictly-separated roles, asynchronous email notifications, and a React SPA.

**Architecture:** Backend is layered views → serializers → services → repositories, with selectors for reusable reads; repositories are `Protocol` contracts and the DRF ViewSet is the composition root, so no service module ever imports a concrete repository. Authorization is a declarative matrix read by both the permission classes and a parametrized test suite. Notifications are enqueued through `transaction.on_commit` and made idempotent by a unique dedupe key derived from the `django-simple-history` record id. The frontend is a TanStack Router SPA whose only HTTP surface is one centralized API client.

**Tech Stack:** Python 3.14, Django 6.0, DRF 3.18.1, djangorestframework-simplejwt (git pin), drf-spectacular, django-simple-history, django-filter, Celery + Redis, PostgreSQL 16, uv, ruff, mypy, pytest · React 19, TypeScript, Vite 7, TanStack Router + Query, Tailwind, Vitest + RTL + MSW · Docker Compose, GitHub Actions.

---

## How to use this plan

**The spec is normative; this plan is the sequence.** Where a task says "per spec §8.4", open the spec — it carries the exact field lists, the matrix, and the rationale. This document carries the order, the file paths, the commands, and the code that is easy to get wrong.

**Conventions that bind every task** (from the three `AGENTS.md` files, which take precedence over generic habit):

- `backend §1`/`§2` — layering and dependency direction. A service never touches the ORM; a repository never holds a workflow; neither knows about `request` or HTTP status codes.
- `backend §49` — no `utils.py`, no `common.py`, no `helpers.py`. Every module has one named responsibility.
- `backend §13` — input and output serializers are separate; no `fields = "__all__"`.
- `backend §36` — pytest, never Django's `TestCase` runner. Write the test first for new endpoints and business rules.
- `frontend §5` — all HTTP goes through `src/lib/api-client.ts`; components never call `fetch`.
- `frontend §4` — server state is TanStack Query only, never copied into `useState` or Context.
- Root `AGENTS.md §4` — authorization is server-side; frontend guards are UX only.

**Running commands.** Backend commands run against `backend/` via uv's `--directory` flag so each is a single uncompounded command:

```bash
uv run --directory backend pytest -q
uv run --directory backend python manage.py migrate
```

Frontend commands run from `frontend/`:

```bash
npm --prefix frontend run test
```

`DJANGO_SETTINGS_MODULE` is set in `backend/pyproject.toml` under `[tool.pytest.ini_options]`, so no environment variable is needed for tests.

**Commit after every task.** Each task ends with a commit step. Commit messages use Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`, `fix:`).

---

## Definition of Done

Two checklists govern completion. They are not restated per task; instead each task names which rows apply.

### Backend — `backend/AGENTS.md §54`

A backend feature is done when, **where relevant**, each of these is addressed:

| # | Item | What "addressed" means here |
|---|---|---|
| B1 | Model changes | fields, choices, properties |
| B2 | Migrations | generated, committed, and `makemigrations --check` clean |
| B3 | Serializers | separate input/output, explicit field lists |
| B4 | Permissions | matrix row + permission class, plus object-level where the rule is per-row |
| B5 | Querysets/selectors | role scoping lives in a selector, not a view |
| B6 | Application services | the single write path; no `serializer.save()` |
| B7 | Transactions | explicit `transaction.atomic()` around multi-statement writes |
| B8 | Database constraints | invariants enforced at the DB level where expressible |
| B9 | API documentation | drf-spectacular renders the endpoint correctly |
| B10 | Tests | happy path **and** validation failure, unauthorized, ownership, business failure, constraint, concurrency (`backend §52`) |
| B11 | Error handling | `ApplicationError` subclass with a stable `code`, surfaced by the shared handler |
| B12 | Logging/observability | meaningful events logged; never a password, JWT, or `Authorization` header |
| B13 | Security | authorization server-side, secrets from env, no sensitive data in responses |

### Frontend — `frontend/AGENTS.md §9`

| # | Item |
|---|---|
| F1 | Data fetching/mutations wired through TanStack Query hooks |
| F2 | Loading, error, and empty states handled — not just the happy path |
| F3 | Server-side validation errors surfaced to the user, not swallowed |
| F4 | Authorization-driven UI matches what the backend actually enforces |
| F5 | Styling per `frontend §6`, including responsive behaviour at mobile/tablet/desktop |
| F6 | Tests per `frontend §7` for non-trivial logic; no console errors or warnings |
| F7 | No business logic duplicated from the backend |

---

## Two standing obligations

These run **across** phases and are not a single task. Spec §15 explains why: both record what happened, and neither can be reconstructed honestly afterwards.

- **`README.md`** — skeleton committed in Task 6, appended by every phase that makes a decision worth recording, polished in Task 52. The decision log in spec §3 is its source material.
- **`docs-external/PROMPT-LOGS.md`** — appended as work happens, per root `AGENTS.md §7`: which prompts were issued, which output was wrong, what had to be corrected. Task 52 draws on it rather than inventing it.

Every task below that produces a decision worth recording ends with an **append to README** step. Treat a task with an unrecorded decision as incomplete.

---

## File structure

The backend tree is spec §5.3 and the frontend tree is spec §11.1. This section adds the files those trees do not enumerate, and states each module's single responsibility.

### Repository root

```
.
├── .github/workflows/ci.yml          # lint · compat · backend · frontend
├── .pre-commit-config.yaml           # same pinned ruff/mypy as CI (spec §13.1)
├── .env.example                      # committed; .env never is
├── docker-compose.yml                # six services (spec §14.1)
├── README.md                         # grown continuously
├── AGENTS.md / backend/AGENTS.md / frontend/AGENTS.md   # read-only, pre-existing
├── docs/superpowers/specs/           # the design spec
├── docs/superpowers/plans/           # this plan
├── docs-external/PROMPT-LOGS.md      # appended continuously
├── backend/
└── frontend/
```

### Backend modules and their one responsibility

| File | Owns |
|---|---|
| `config/settings/base.py` | everything shared; reads env, never hardcodes a secret |
| `config/settings/local.py` | console email, debug, permissive hosts |
| `config/settings/test.py` | Postgres (not SQLite — partial indexes and a check constraint), locmem email, eager Celery |
| `config/settings/production.py` | the `backend §23` security assertions |
| `config/celery.py` | the Celery app and the single beat schedule entry |
| `config/urls.py` | `/api/v1/` mount points and the schema routes |
| `apps/core/models.py` | `UUIDPrimaryKeyModel`, `TimeStampedModel`, `SoftDeleteModel` |
| `apps/core/managers.py` | `SoftDeleteManager` |
| `apps/core/roles.py` | `Role` — in `core` so the matrix can import it without inverting layering |
| `apps/core/pagination.py` | `DefaultPageNumberPagination` |
| `apps/core/ordering.py` | `TiebrokenOrderingFilter` — appends `-id` so pagination is deterministic |
| `apps/core/constants.py` | `UUID_LOOKUP_REGEX`, the detail-route path pattern |
| `apps/core/exceptions.py` | `ApplicationError` hierarchy + the single `exception_handler` |
| `apps/core/throttling.py` | the `login` and `refresh` scoped throttles |
| `apps/core/permissions/matrix.py` | the declarative source of truth for endpoint reachability |
| `apps/core/permissions/classes.py` | `RolePermission` (matrix-driven), `IsTaskCreator` (D27) |
| `apps/users/models.py` | `User`, `UserManager` |
| `apps/users/repositories.py` | `UserRepository` Protocol + `DjangoUserRepository` |
| `apps/users/selectors.py` | `scoped_users`, `assignable_users` |
| `apps/users/services.py` | `UserService` — imports the Protocol only |
| `apps/users/serializers.py` | the four user serializers (spec §8.2) |
| `apps/users/views.py` | `UserViewSet`, `MeView`, the auth views, and `get_service()` |
| `apps/users/filters.py` | `UserFilterSet` |
| `apps/users/management/commands/seed_demo_data.py` | idempotent demo data, refuses production settings |
| `apps/tasks/models.py` | `Task`, `TaskStatus`, `TRANSITIONS` |
| `apps/tasks/repositories.py` | `TaskRepository` Protocol + `DjangoTaskRepository` |
| `apps/tasks/selectors.py` | `scoped_tasks`, `overdue_candidates`, `task_stats` |
| `apps/tasks/services.py` | `TaskService` — the only write path for a task |
| `apps/tasks/exceptions.py` | the four task `ApplicationError` subclasses |
| `apps/tasks/filters.py` | `TaskFilterSet`, including the `overdue` NULL branch |
| `apps/notifications/models.py` | `Notification`, `NotificationEvent` |
| `apps/notifications/services.py` | `resolve_recipients`, `build_dedupe_key` — pure functions |
| `apps/notifications/dispatchers.py` | `NotificationDispatcher` Protocol + `CeleryNotificationDispatcher` |
| `apps/notifications/repositories.py` | `NotificationRepository` Protocol + Django impl |
| `apps/notifications/emails.py` | subject/body rendering |
| `apps/notifications/tasks.py` | `send_task_event_email`, `sweep_overdue_tasks` |

### Test layout

Tests live in `apps/<app>/tests/`, one module per concern, so a failure name says what broke:

```
apps/core/tests/        test_models_soft_delete.py  test_models_uuid.py
                        test_exceptions.py  test_pagination.py  test_permission_matrix_data.py
apps/users/tests/       factories.py  test_models.py  test_repositories.py  test_services.py
                        test_serializers.py  test_api_users.py  test_api_auth.py  test_api_me.py
apps/tasks/tests/       factories.py  test_models.py  test_repositories.py  test_services.py
                        test_serializers.py  test_selectors.py  test_filters.py
                        test_api_tasks.py  test_api_complete.py  test_api_stats.py
                        test_api_delete_rules.py  test_concurrency.py  test_query_counts.py
apps/core/tests/        test_permission_matrix_api.py   # the parametrized §12.2 suite
apps/notifications/tests/  test_recipients.py  test_dedupe.py  test_tasks.py  test_sweep.py
                           test_on_commit.py
```

`backend/conftest.py` holds the shared fixtures: `api_client`, one authenticated client per role, and `settings` overrides.

### Frontend modules

Spec §11.1 plus:

| File | Owns |
|---|---|
| `src/lib/api-client.ts` | base URL, bearer header, `credentials: "include"`, single-flight refresh, `ApiError` normalization |
| `src/lib/api-error.ts` | the typed `ApiError` carrying `code`, `detail`, `errors` |
| `src/features/auth/AuthContext.tsx` | in-memory access token + current user; never persistent storage |
| `src/app/router.tsx` | the whole route tree and its role guards, in one file |
| `src/app/providers.tsx` | `QueryClientProvider` + `AuthProvider` |
| `src/test/msw-handlers.ts` | MSW handlers shared by the component tests |

---

## Phase 1 — Scaffold and dependency proof

Spec §15 phase 1. The point of this phase is not "a Django project exists" — it is **proving the Django 6.0 / Python 3.14 dependency set resolves, imports and boots**, which is the risk D1/D3/D4 actually carry.

> **Do not run `manage.py migrate` against a persistent database before Task 12.** `AUTH_USER_MODEL` is switched to `users.User` in Task 12, and Django refuses that swap once `auth` has migrated with the default user. Phases 1–2 only ever run `manage.py check`, which is exactly what `compat` stage 1 asks for (spec §13).

### Task 1: Backend project metadata and the git-pinned dependency set

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/uv.lock` (generated)
- Create: `backend/.python-version`

- [ ] **Step 1: Install the Python floor**

D2 makes 3.14 a hard floor because `uuid.uuid7` is a 3.14 stdlib addition.

```bash
uv python install 3.14
```

- [ ] **Step 2: Write `backend/pyproject.toml`**

```toml
[project]
name = "task-management-backend"
version = "0.1.0"
description = "Role-based task management API"
requires-python = ">=3.14"
dependencies = [
    "django>=6.0,<6.1",
    "djangorestframework==3.18.1",
    "djangorestframework-simplejwt",
    "drf-spectacular==0.30.0",
    "django-simple-history==3.13.0",
    "django-filter==26.2",
    "django-cors-headers",
    "celery[redis]>=5.4",
    "redis>=5",
    "psycopg[binary]>=3.2",
]

[dependency-groups]
dev = [
    "pytest",
    "pytest-django",
    "pytest-cov",
    "factory-boy",
    "ruff",
    "mypy",
]

# D3: PyPI simplejwt 5.5.1 predates PR #959 (Django 6.0 + Python 3.14 support).
# uv.lock captures this SHA, so builds stay reproducible.
# Exit criterion: drop this block once a release containing #959 ships.
[tool.uv.sources]
djangorestframework-simplejwt = { git = "https://github.com/jazzband/djangorestframework-simplejwt.git", rev = "a7cb077ea0809f78cc6a99cb6825ab7594eae627" }

[tool.uv]
package = false

[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "DJ", "C4", "SIM", "RUF"]

[tool.ruff.lint.per-file-ignores]
"*/migrations/*" = ["E501", "RUF012"]
"config/settings/*" = ["F403", "F405"]

[tool.mypy]
python_version = "3.14"
ignore_missing_imports = true
files = ["apps"]

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.test"
python_files = ["test_*.py"]
addopts = "--strict-markers --cov=apps --cov-report=term-missing"

[tool.coverage.run]
source = ["apps"]
omit = ["*/migrations/*", "*/tests/*", "*/__init__.py"]
```

`target-version = "py314"` is self-verifying: ruff errors on an unknown value, so if it has not shipped 3.14 support yet, Step 5 fails and you drop to `py313` with a comment.

- [ ] **Step 3: Pin the Python version for uv**

```bash
echo "3.14" > backend/.python-version
```

- [ ] **Step 4: Resolve the lockfile — this is the first real test of D2**

```bash
uv sync --directory backend
```

Expected: resolution succeeds, including the git source. **If any dependency caps below Python 3.14, this fails here with a resolution error** — which is the fast, loud failure spec §16.1 relies on. The documented fallback is Python 3.13 plus the `uuid-utils` package for `uuid7`; that costs one dependency and changes nothing else in the design.

- [ ] **Step 5: Verify the installed stack matches D1/D2/D3**

```bash
uv run --directory backend python -c "import sys, django, uuid; print(sys.version_info); print(django.get_version()); print(uuid.uuid7())"
```

Expected: version info `>= (3, 14)`, Django `6.0.x`, and a printed UUID.

```bash
uv run --directory backend python -c "import rest_framework_simplejwt, drf_spectacular; print(rest_framework_simplejwt.__version__)"
```

Expected: both import without error.

- [ ] **Step 6: Record the resolved ruff version**

Read the `ruff` version uv locked — it must be reused verbatim in `.pre-commit-config.yaml` (Task 3) so a local hook and CI can never disagree (spec §13.1).

```bash
grep -A1 'name = "ruff"' backend/uv.lock
```

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/.python-version
git commit -m "chore: pin Django 6.0 / Python 3.14 dependency set with simplejwt git source"
```

**DoD:** none of B1–B13 yet — this task is tooling.

---

### Task 2: Django project and the settings split

**Files:**
- Create: `backend/manage.py`
- Create: `backend/config/__init__.py`, `backend/config/urls.py`, `backend/config/wsgi.py`, `backend/config/asgi.py`
- Create: `backend/config/settings/__init__.py`, `base.py`, `local.py`, `test.py`, `production.py`
- Create: `backend/apps/__init__.py`
- Create: `.env.example`

- [ ] **Step 1: Generate the project skeleton**

```bash
uv run --directory backend django-admin startproject config .
```

Then split `config/settings.py` into the `config/settings/` package below and delete the single-file version.

- [ ] **Step 2: Write `backend/config/settings/base.py`**

Configuration comes from environment variables only (`backend §24`). The three helpers live in `base.py` itself rather than a utility module, satisfying `backend §49`; a settings dependency is deliberately avoided so the Python 3.14 risk surface stays as small as possible.

```python
"""Settings shared by every environment. Reads configuration from the environment only."""

import os
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

MIDDLEWARE = [
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

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"standard": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "standard"}},
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
}
```

**`DEFAULT_PAGINATION_CLASS`, `PAGE_SIZE`, `DEFAULT_FILTER_BACKENDS` and `EXCEPTION_HANDLER` are deliberately absent here**, and are added by the tasks that create what they point at — Task 9 for pagination and ordering, Task 10 for the exception handler. They are not merely unused until then: DRF's `RestFrameworkConfig.ready()` runs `pagination_system_check`, which **imports** `DEFAULT_PAGINATION_CLASS` at startup, so naming a module that does not exist yet turns every `manage.py check` into a `ModuleNotFoundError` — including the one `compat` stage 1 runs from Task 5 onward.

`PAGE_SIZE` travels with it rather than staying behind, because the same check emits `rest_framework.W001` ("you have specified a default PAGE_SIZE without also specifying a DEFAULT_PAGINATION_CLASS") for that pair. A warning does not fail `manage.py check`, so it would not break anything — it would just make Step 7 and Task 8 Step 3 report one issue where this plan says they report none, which costs an implementer an investigation.

The `django_filters` app label is correct for django-filter 26.x. Step 7's `manage.py check` is what confirms it.

- [ ] **Step 3: Write `backend/config/settings/local.py`**

```python
"""Local development. Console email, debug on, no real SMTP service in Compose."""

from config.settings.base import *  # noqa: F403
from config.settings.base import env_bool, env_list

DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,backend,0.0.0.0")
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
```

- [ ] **Step 4: Write `backend/config/settings/test.py`**

Postgres, **not SQLite** — the schema depends on partial indexes and a check constraint (spec §6.2, §6.3), neither of which SQLite exercises the same way.

```python
"""Test settings. Postgres (partial indexes + a check constraint), locmem email, eager Celery."""

from config.settings.base import *  # noqa: F403

DEBUG = False
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # test speed only
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "throttle": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
}
```

The throttle cache is locmem **in tests only**, so throttle tests do not need a Redis service. Production and local keep Redis for the reason stated in `base.py`.

- [ ] **Step 5: Write `backend/config/settings/production.py`**

```python
"""Production. Asserts the backend §23 security posture rather than assuming it."""

from config.settings.base import *  # noqa: F403
from config.settings.base import env, env_list

DEBUG = False
SECRET_KEY = env("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL")

assert not DEBUG, "DEBUG must be False in production"
assert ALLOWED_HOSTS, "ALLOWED_HOSTS must be set in production"
```

- [ ] **Step 6: Point `manage.py` at local settings and write `.env.example`**

In `backend/manage.py`, the default becomes `config.settings.local`.

`.env.example` at the repository root (committed; `.env` never is):

```dotenv
# Django
DJANGO_SETTINGS_MODULE=config.settings.local
DJANGO_SECRET_KEY=change-me-in-your-own-dot-env
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,backend
DJANGO_LOG_LEVEL=INFO

# Database
POSTGRES_DB=taskmanagement
POSTGRES_USER=taskmanagement
POSTGRES_PASSWORD=taskmanagement
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Redis / Celery
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1

# CORS / CSRF
CORS_ALLOWED_ORIGINS=http://localhost:5173
CSRF_TRUSTED_ORIGINS=http://localhost:5173

# Email
DEFAULT_FROM_EMAIL=no-reply@taskmanagement.local

# Frontend
VITE_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 7: Verify the project boots**

```bash
uv run --directory backend python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 8: Commit**

```bash
git add backend/manage.py backend/config backend/apps/__init__.py .env.example
git commit -m "chore: add Django project with per-environment settings split"
```

**DoD:** B12 (logging configured), B13 (secrets from env only).

---

### Task 3: ruff, mypy, and pre-commit parity

**Files:**
- Create: `.pre-commit-config.yaml`
- Modify: `backend/pyproject.toml` (already carries the ruff/mypy config from Task 1)

- [ ] **Step 1: Write `.pre-commit-config.yaml` using the exact ruff version from Task 1 Step 6**

Spec §13.1. The test hook runs on **pre-push**, not pre-commit, so committing stays fast while nothing broken reaches the remote.

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v5.0.0
    hooks:
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-merge-conflict
      - id: check-yaml
      - id: check-toml

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v<RUFF_VERSION_FROM_UV_LOCK>
    hooks:
      - id: ruff
        args: [--fix]
        files: ^backend/
      - id: ruff-format
        files: ^backend/

  - repo: local
    hooks:
      - id: mypy
        name: mypy (repository contracts)
        entry: uv run --directory backend mypy
        language: system
        pass_filenames: false
        files: ^backend/apps/

      - id: pytest
        name: pytest
        entry: uv run --directory backend pytest -x -q
        language: system
        pass_filenames: false
        stages: [pre-push]
```

- [ ] **Step 2: Verify ruff and format are clean**

```bash
uv run --directory backend ruff check .
```

```bash
uv run --directory backend ruff format --check .
```

Expected: both pass. If `ruff check` rejects `target-version = "py314"`, change it to `py313` and add a one-line comment saying why.

- [ ] **Step 3: Verify mypy runs**

```bash
uv run --directory backend mypy
```

Expected: `Success: no issues found` (there is almost nothing to check yet). mypy's job here is narrow and worth stating in the README: it catches **signature drift** between a repository Protocol and its implementation, which `@abstractmethod` and `isinstance` both miss because the method is still present. It needs no `django-stubs`.

- [ ] **Step 4: Install the hooks and commit**

```bash
pre-commit install --install-hooks
```

```bash
pre-commit install --hook-type pre-push
```

```bash
git add .pre-commit-config.yaml
git commit -m "chore: add pre-commit config with ruff/mypy pinned to the CI versions"
```

**DoD:** tooling task.

---

### Task 4: Docker Compose and the backend image

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `backend/.dockerignore`, `frontend/.dockerignore`

- [ ] **Step 1: Write `backend/Dockerfile`**

Spec §14.2. `git` is installed because D3's dependency is a git source; `uv sync --frozen` runs ahead of the source copy so dependency layers cache.

```dockerfile
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/usr/local

# git: required by D3 so uv can resolve the pinned simplejwt commit.
RUN apt-get update \
 && apt-get install --no-install-recommends -y git \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .
```

- [ ] **Step 2: Write `frontend/Dockerfile`**

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
```

`package-lock.json` does not exist until Task 41, so this image is unbuildable until then. That is expected — the `frontend` Compose service is commented out until Task 41 (Step 3).

- [ ] **Step 3: Write `docker-compose.yml`**

Six services per spec §14.1. **`beat` is the documented override** of root `AGENTS.md` § Local Development (spec §3.4) — the brief requires scheduled overdue notifications, and Celery documents `worker -B` as development-only.

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

  worker:
    build:
      context: ./backend
    command: celery -A config worker -l info
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

  # Overrides root AGENTS.md § Local Development (spec §3.4): the brief requires a
  # scheduled overdue sweep, and `worker -B` is documented by Celery as dev-only.
  beat:
    build:
      context: ./backend
    command: celery -A config beat -l info
    volumes:
      - ./backend:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

  # Uncommented in Task 41, once frontend/package-lock.json exists.
  # frontend:
  #   build:
  #     context: ./frontend
  #   command: npm run dev -- --host 0.0.0.0
  #   volumes:
  #     - ./frontend:/app
  #     - /app/node_modules
  #   ports:
  #     - "5173:5173"
  #   env_file:
  #     - .env

volumes:
  postgres_data:
```

`worker` and `beat` have no `command` entry pointing at code that exists yet — `config/celery.py` lands in Task 36. Bringing them up before then fails; `db`, `redis` and `backend` come up fine.

- [ ] **Step 4: Write the two `.dockerignore` files**

```text
# backend/.dockerignore
.venv
__pycache__
*.pyc
.pytest_cache
.ruff_cache
.mypy_cache
htmlcov
.coverage
```

```text
# frontend/.dockerignore
node_modules
dist
.vite
```

- [ ] **Step 5: Verify the backend image builds and the stack starts**

```bash
cp .env.example .env
```

```bash
docker compose build backend
```

```bash
docker compose up -d db redis backend
```

```bash
docker compose exec backend python manage.py check
```

Expected: no issues. Then tear down:

```bash
docker compose down
```

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore frontend/Dockerfile frontend/.dockerignore docker-compose.yml
git commit -m "chore: add Compose stack and backend image on python:3.14-slim"
```

**DoD:** B13 (configuration via `env_file`, `.env` never committed).

---

### Task 5: CI workflow — the `lint` job and `compat` stage 1

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow with two jobs**

Spec §13. `compat` exists because of D1, D3 and D4: it converts "simplejwt@master and drf-spectacular are untested above Django 6.0" from an assumption into a continuously verified fact, and it is the signal that tells us when D1's exit criterion can be taken. Stage 1 needs **no services**, which is why it can ship on day one.

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
      - run: uv sync --directory backend
      - run: uv run --directory backend ruff check .
      - run: uv run --directory backend ruff format --check .
      - run: uv run --directory backend mypy

  # Verifies the unusual dependency combination this design deliberately chose
  # (D1 Django 6.0, D3 simplejwt git pin, D4 drf-spectacular, D2/D28 Python 3.14).
  # Every other job asks "is my code right?"; this one asks "does this dependency
  # set still assemble and boot at all?". Extended at Task 20 and Task 40.
  compat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - name: Resolve the pinned dependency set, git source included
        run: uv sync --directory backend
      - name: Python floor is 3.14 and uuid.uuid7 is importable (D2, D28)
        run: >
          uv run --directory backend python -c
          "import sys, uuid; assert sys.version_info >= (3, 14), sys.version_info; assert uuid.uuid7().version == 7"
      - name: Django is 6.0.x (D1)
        run: >
          uv run --directory backend python -c
          "import django; assert django.VERSION[:2] == (6, 0), django.get_version()"
      - name: The two at-risk packages import (D3, D4)
        run: >
          uv run --directory backend python -c
          "import rest_framework_simplejwt, drf_spectacular"
      - name: Django boots
        run: uv run --directory backend python manage.py check
```

- [ ] **Step 2: Verify each `compat` step locally before pushing**

Run the four commands above by hand. Expected: all pass. The Django version assert is the one that will fail first if a `uv sync` ever resolves 6.1.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint job and compat stage 1 proving the Django 6.0 stack boots"
```

**DoD:** tooling task.

---

### Task 6: README skeleton

**Files:**
- Create: `README.md`
- Modify: `docs-external/PROMPT-LOGS.md`

Spec §15: a README written at the end documents what its author remembers; one grown alongside the work documents what was actually decided, while the reasoning is still fresh.

- [ ] **Step 1: Write the skeleton with the sections every later phase appends to**

```markdown
# Task Management System

Role-based task management: a Django 6 / DRF API and a React SPA.
Design spec: `docs/superpowers/specs/2026-10-05-task-management-system-design.md`.

## Quick start
## Running the checks
## Demo credentials
## Architecture
## Key implementation decisions
## Deliberate overrides of AGENTS.md
## Known limitations and exit criteria
## GenAI prompt and validation record
```

Fill in now: **Quick start** (`cp .env.example .env`, `docker compose up`, `docker compose exec backend python manage.py migrate`), **Running the checks** (the exact ruff / mypy / pytest / pre-commit commands — a reviewer must be able to reproduce them without guessing, per `backend §44a`), and under **Key implementation decisions** the five decisions already made: D1 (why Django 6.0 and not 6.1), D2 (why Python 3.14 is a hard floor), D3 (the git pin, its consequences, and its exit criterion), D4 (drf-spectacular over drf-yasg), D5 (uv). Under **Deliberate overrides**, the three rows of spec §3.4.

- [ ] **Step 2: Append to `docs-external/PROMPT-LOGS.md`**

Add a `# Implementation` section and record the planning prompt and this phase's prompts, per root `AGENTS.md §7`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs-external/PROMPT-LOGS.md
git commit -m "docs: add README skeleton with phase-1 decisions"
```

**DoD:** documentation task.

---

## Phase 2 — `apps.core`

Spec §15 phase 2. Shared building blocks only. `Role` lives here, not in `users`, because the permission matrix needs it and a shared app importing a feature app inverts the layering D10 exists to protect (spec §6.2).

> **Phase 2 ships only the tests that need no database.** `SoftDeleteModel` is abstract, so exercising it requires a concrete subclass, which requires a migration, which requires `AUTH_USER_MODEL` to exist. The soft-delete *behaviour* tests therefore land in Task 12 against the concrete `User`. What phase 2 can and does test without a database: the `uuid7` default, the exception handler, the pagination class, and the matrix data's internal consistency.

### Task 7: `apps/core` app with the UUIDv7 and timestamp base models

**Files:**
- Create: `backend/apps/core/__init__.py`, `apps.py`, `models.py`
- Create: `backend/apps/core/tests/__init__.py`, `test_models_uuid.py`
- Create: `backend/conftest.py`
- Modify: `backend/config/settings/base.py` (register `apps.core`)

- [ ] **Step 1: Write the failing test**

`backend/apps/core/tests/test_models_uuid.py` — the ordering assertion is the one that matters. Spec §16.2: a silent fall-back from `uuid7` to `uuid4` would break nothing visibly — ids would still be unique and every functional test would still pass, and only index locality, the entire reason for D28, would be lost. This is the only test that would catch it.

```python
import uuid

from apps.core.models import UUIDPrimaryKeyModel


def test_primary_key_default_produces_version_7_uuids():
    field = UUIDPrimaryKeyModel._meta.get_field("id")
    assert field.primary_key is True
    assert field.editable is False
    assert field.default is uuid.uuid7, "the default must be the stdlib callable, passed by reference"
    assert field.default().version == 7


def test_generated_ids_sort_in_creation_order():
    """The property D28's index-locality argument rests on."""
    ids = [str(uuid.uuid7()) for _ in range(500)]
    assert ids == sorted(ids)
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
uv run --directory backend pytest apps/core/tests/test_models_uuid.py -q
```

Expected: `ModuleNotFoundError: No module named 'apps.core'`.

- [ ] **Step 3: Write `backend/apps/core/apps.py` and `backend/apps/core/models.py`**

```python
# apps/core/apps.py
from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
```

```python
# apps/core/models.py
"""Abstract base models shared by every domain app."""

import uuid

from django.db import models


class UUIDPrimaryKeyModel(models.Model):
    """UUIDv7 primary key (D28).

    `uuid.uuid7` is passed by reference, not called, and is a stdlib function, so
    Django serializes it into migrations exactly as `uuid.uuid4` has always been.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

Register it in `config/settings/base.py`, directly after the third-party block:

```python
INSTALLED_APPS += ["apps.core"]
```

- [ ] **Step 4: Write `backend/conftest.py`**

```python
"""Shared pytest fixtures. Role-specific clients are added in Task 16."""

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
uv run --directory backend pytest apps/core/tests/test_models_uuid.py -q
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core backend/conftest.py backend/config/settings/base.py
git commit -m "feat: add UUIDv7 and timestamp abstract base models"
```

**DoD:** B1, B10.

---

### Task 8: Soft-delete base model and manager

**Files:**
- Create: `backend/apps/core/managers.py`
- Modify: `backend/apps/core/models.py`

- [ ] **Step 1: Write `backend/apps/core/managers.py`**

```python
# apps/core/managers.py
"""Managers for soft-deletable models."""

from django.db import models


class SoftDeleteManager(models.Manager):
    """Default manager that hides soft-deleted rows from every query.

    Because this is the default manager, no viewset needs its own `deleted_at`
    filter — which removes the single most likely place for a data leak.
    """

    def get_queryset(self) -> models.QuerySet:
        return super().get_queryset().filter(deleted_at__isnull=True)
```

- [ ] **Step 2: Add `SoftDeleteModel` to `backend/apps/core/models.py`**

```python
from django.conf import settings
from django.utils import timezone

from apps.core.managers import SoftDeleteManager


class SoftDeleteModel(UUIDPrimaryKeyModel):
    """Soft delete (D20). Deletion is a state change, not a row removal.

    `delete()` is deliberately NOT overridden: overriding it would make
    `queryset.delete()` and cascade behaviour surprising, and would hide genuine
    hard deletes during data migrations. Services call `soft_delete()` explicitly.
    """

    # No db_index=True: every concrete subclass declares an explicit partial
    # index on deleted_at in its own Meta, and both would create two indexes on
    # the same column.
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    objects = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def soft_delete(self, by=None) -> None:
        self.deleted_at = timezone.now()
        self.deleted_by = by
        self.save(update_fields=["deleted_at", "deleted_by"])
```

Two deliberate omissions, both load-bearing:

- **`Meta.base_manager_name` is not set.** With it unset and no parent setting it, Django builds a plain `Manager()` for `_base_manager`, so related-object descriptors and `PROTECT` keep using an unfiltered manager and behave predictably. Setting it to the soft-delete manager would make `PROTECT` silently stop seeing deleted rows.
- **Manager declaration order is ambiguous under inheritance.** Django orders managers by creation counter, and a subclass redeclaring `objects` does not reliably become `_default_manager` ahead of an inherited `all_objects`. Task 12 therefore has `User` redeclare **both** managers and set `Meta.default_manager_name = "objects"` explicitly. Authentication depends on this: `ModelBackend` calls `UserModel._default_manager.get_by_natural_key(...)`, and if that resolved to `all_objects`, a soft-deleted user could still log in.

- [ ] **Step 3: Verify the module imports and Django still boots**

```bash
uv run --directory backend python manage.py check
```

Expected: no issues. Behaviour tests land in Task 12 (see the phase note above).

- [ ] **Step 4: Commit**

```bash
git add backend/apps/core/managers.py backend/apps/core/models.py
git commit -m "feat: add soft-delete abstract model and filtering manager"
```

**DoD:** B1.

---

### Task 9: Roles, pagination, ordering, and throttle scopes

**Files:**
- Create: `backend/apps/core/roles.py`, `pagination.py`, `ordering.py`, `throttling.py`
- Create: `backend/apps/core/tests/test_pagination.py`
- Modify: `backend/config/settings/base.py` (`DEFAULT_PAGINATION_CLASS`, `DEFAULT_FILTER_BACKENDS`)

- [ ] **Step 1: Write `backend/apps/core/roles.py`**

```python
# apps/core/roles.py
"""The three roles. Lives in core so the permission matrix can import it
without a shared app depending on a feature app (spec §6.2)."""

from django.db import models


class Role(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    SUPERVISOR = "SUPERVISOR", "Supervisor"
    OPERATOR = "OPERATOR", "Operator"
```

- [ ] **Step 2: Write `backend/apps/core/pagination.py`**

```python
# apps/core/pagination.py
from rest_framework.pagination import PageNumberPagination


class DefaultPageNumberPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
```

- [ ] **Step 3: Write `backend/apps/core/ordering.py`**

```python
# apps/core/ordering.py
"""Ordering filter that guarantees pagination determinism (spec §8.3)."""

from rest_framework.filters import OrderingFilter


class TiebrokenOrderingFilter(OrderingFilter):
    """Always appends `-id` so ordering by a non-unique field stays stable.

    Ordering by `due_date`, `status` or `role` alone is not a total order, so
    rows can reshuffle between page requests and a client can see a row twice or
    never. `-id` is unique, and with UUIDv7 it is also time-correlated.
    """

    def get_ordering(self, request, queryset, view):
        ordering = list(super().get_ordering(request, queryset, view) or [])
        if not any(field.lstrip("-") == "id" for field in ordering):
            ordering.append("-id")
        return ordering
```

Both viewsets use this rather than DRF's `OrderingFilter`, so neither can produce an unstable page.

- [ ] **Step 4: Wire pagination and the filter backends into settings**

Now that both modules exist, add to `REST_FRAMEWORK` in `config/settings/base.py`:

```python
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.DefaultPageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "apps.core.ordering.TiebrokenOrderingFilter",
    ],
```

`PAGE_SIZE` moves in alongside the class, not before it — see the note under Task 2 Step 2.

`SearchFilter` is **not** a default backend: only `UserViewSet` searches, and listing it globally would make it a duplicate when that viewset declares it explicitly.

- [ ] **Step 5: Write `backend/apps/core/throttling.py`**

```python
# apps/core/throttling.py
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
```

Both subclass `AnonRateThrottle` so the key is the **client IP**, not the user — an unauthenticated login attempt has no user to key on.

- [ ] **Step 6: Write and run the pagination test**

```python
# apps/core/tests/test_pagination.py
from apps.core.pagination import DefaultPageNumberPagination


def test_pagination_defaults_match_the_spec():
    pagination = DefaultPageNumberPagination()
    assert pagination.page_size == 20
    assert pagination.page_size_query_param == "page_size"
    assert pagination.max_page_size == 100
```

```bash
uv run --directory backend pytest apps/core/tests/test_pagination.py -q
```

Expected: 1 passed.

- [ ] **Step 7: Confirm `manage.py check` still passes with pagination wired**

```bash
uv run --directory backend python manage.py check
```

Expected: no issues. DRF's `pagination_system_check` imports `DEFAULT_PAGINATION_CLASS` at startup, so this is the step that proves the Task 2 deferral was resolved correctly.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/core backend/config/settings/base.py
git commit -m "feat: add Role choices, pagination, tiebroken ordering and scoped throttles"
```

**DoD:** B10, B13 (throttle counters in Redis, not per-process memory).

---

### Task 10: The single error contract

**Files:**
- Create: `backend/apps/core/exceptions.py`
- Create: `backend/apps/core/tests/test_exceptions.py`
- Modify: `backend/config/settings/base.py` (`EXCEPTION_HANDLER`)

Spec §8.7. One shape for every error, so the frontend can branch on `code` without parsing `detail`.

- [ ] **Step 1: Write the failing tests**

```python
# apps/core/tests/test_exceptions.py
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.exceptions import ApplicationError, exception_handler


class Boom(ApplicationError):
    default_detail = "It broke."
    default_code = "boom"
    status_code = 409


def test_application_error_renders_the_shared_shape():
    response = exception_handler(Boom(), {})
    assert response.status_code == 409
    assert response.data == {"detail": "It broke.", "code": "boom", "errors": None}


def test_validation_error_carries_the_per_field_map():
    response = exception_handler(ValidationError({"assignee": ["nope"]}), {})
    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert response.data["errors"] == {"assignee": ["nope"]}


def test_drf_exception_code_is_preserved():
    """IsTaskCreator raises PermissionDenied(code="delete_requires_creator");
    that code must survive the handler, not be flattened to permission_denied."""
    response = exception_handler(
        PermissionDenied(detail="Only the creator may delete.", code="delete_requires_creator"), {}
    )
    assert response.status_code == 403
    assert response.data["code"] == "delete_requires_creator"


def test_unexpected_exception_is_not_handled_here():
    """A bare exception must fall through to Django's 500 — never leak a trace."""
    assert exception_handler(RuntimeError("secret connection string"), {}) is None
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/core/tests/test_exceptions.py -q
```

Expected: `ModuleNotFoundError: apps.core.exceptions`.

- [ ] **Step 3: Write `backend/apps/core/exceptions.py`**

```python
# apps/core/exceptions.py
"""The application error hierarchy and the single DRF exception handler.

Every error leaves the API in one shape:
    {"detail": "...", "code": "...", "errors": null}
Stack traces, database errors, secrets and infrastructure details never appear
in a response (backend §18).
"""

import logging

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class ApplicationError(APIException):
    """An expected business error, with a stable machine-readable code."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The request could not be completed."
    default_code = "application_error"


def exception_handler(exc, context) -> Response | None:
    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled exception in %s", context.get("view"))
        return None  # fall through to Django's 500; never return the detail

    if isinstance(exc, DRFValidationError):
        response.data = {
            "detail": "Invalid input.",
            "code": "validation_error",
            "errors": response.data,
        }
        return response

    code = getattr(exc, "detail", None)
    response.data = {
        "detail": str(exc.detail) if hasattr(exc, "detail") else str(exc),
        "code": getattr(code, "code", None) or getattr(exc, "default_code", "error"),
        "errors": None,
    }
    return response
```

`getattr(code, "code", None)` is the part that matters: DRF stores the per-instance code on the `ErrorDetail` string, so this preserves `PermissionDenied(code="delete_requires_creator")` instead of flattening it to the class default. Spec §8.7 requires that code to be **raised, not returned** from `has_object_permission` for exactly this reason.

Now that the module exists, register it in `REST_FRAMEWORK` in `config/settings/base.py`:

```python
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
```

Unlike pagination, DRF resolves this lazily per request rather than at startup — but deferring it to the task that creates it keeps the settings file honest about what exists.

- [ ] **Step 4: Run to verify they pass**

```bash
uv run --directory backend pytest apps/core/tests/test_exceptions.py -q
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/exceptions.py backend/apps/core/tests/test_exceptions.py backend/config/settings/base.py
git commit -m "feat: add ApplicationError hierarchy and the single error contract"
```

**DoD:** B10, B11, B12, B13.

---

### Task 11: The permission matrix and `RolePermission`

**Files:**
- Create: `backend/apps/core/permissions/__init__.py`, `matrix.py`, `classes.py`
- Create: `backend/apps/core/tests/test_permission_matrix_data.py`

D11. The matrix is read by both the permission classes and the parametrized suite in Task 32, so the rules and their enforcement cannot drift. Scope is **endpoint-level reachability only** — spec §12.2 fixes the division of labour with object-level rules.

- [ ] **Step 1: Write the failing data-integrity test**

This test guards the matrix as data, before any view consumes it.

```python
# apps/core/tests/test_permission_matrix_data.py
import pytest

from apps.core.permissions.matrix import MATRIX, Resource, is_allowed
from apps.core.roles import Role


def test_every_resource_action_pair_covers_all_three_roles():
    for key, allowed_roles in MATRIX.items():
        assert isinstance(key, tuple) and len(key) == 2, key
        for role in allowed_roles:
            assert role in Role.values, (key, role)


def test_admin_has_no_task_surface_at_all():
    """D13's most unusual claim, asserted as data before any view exists."""
    task_actions = [action for resource, action in MATRIX if resource == Resource.TASK]
    assert task_actions, "the task rows must exist"
    for action in task_actions:
        assert not is_allowed(Role.ADMIN, Resource.TASK, action), action


def test_supervisor_reads_users_but_writes_none():
    assert is_allowed(Role.SUPERVISOR, Resource.USER, "list")
    assert is_allowed(Role.SUPERVISOR, Resource.USER, "retrieve")
    for action in ("create", "partial_update", "update", "destroy"):
        assert not is_allowed(Role.SUPERVISOR, Resource.USER, action)


def test_operator_has_no_user_surface():
    for action in ("list", "retrieve", "create", "partial_update", "update", "destroy"):
        assert not is_allowed(Role.OPERATOR, Resource.USER, action)


@pytest.mark.parametrize("role", Role.values)
def test_unknown_resource_action_pair_denies_rather_than_raises(role):
    assert is_allowed(role, "nonexistent", "nope") is False
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/core/tests/test_permission_matrix_data.py -q
```

Expected: `ModuleNotFoundError: apps.core.permissions`.

- [ ] **Step 3: Write `backend/apps/core/permissions/matrix.py`**

The task rows are present from the start even though `apps.tasks` does not exist until Task 21 — the matrix is data, and D13's central claim (Admin is 403 everywhere under `/tasks/`) is worth asserting before the views that honour it exist.

```python
# apps/core/permissions/matrix.py
"""The declarative source of truth for endpoint reachability (D11).

Read by apps.core.permissions.classes.RolePermission AND by the parametrized
suite in apps/core/tests/test_permission_matrix_api.py, so the rules and their
enforcement cannot drift. Mirrors spec §7.1.

Scope: "may this role call this endpoint at all?" — nothing else. Object-level
outcomes (D27's Operator delete rule) belong to IsTaskCreator; spec §12.2
explains why this file does not grow a richer value type for one rule.
"""

from typing import Final

from apps.core.roles import Role

ADMIN: Final = Role.ADMIN
SUPERVISOR: Final = Role.SUPERVISOR
OPERATOR: Final = Role.OPERATOR

ALL_ROLES: Final = frozenset({ADMIN, SUPERVISOR, OPERATOR})


class Resource:
    USER = "user"
    TASK = "task"


MATRIX: Final[dict[tuple[str, str], frozenset[str]]] = {
    # Admin manages users; Supervisor reads them (assignee picker, task holder);
    # Operator has no user surface at all.
    (Resource.USER, "list"): frozenset({ADMIN, SUPERVISOR}),
    (Resource.USER, "retrieve"): frozenset({ADMIN, SUPERVISOR}),
    (Resource.USER, "create"): frozenset({ADMIN}),
    (Resource.USER, "partial_update"): frozenset({ADMIN}),
    (Resource.USER, "destroy"): frozenset({ADMIN}),
    # "me" is identity, not user management: every authenticated role needs it to
    # route the SPA and render the right navigation.
    (Resource.USER, "me"): ALL_ROLES,
    # D13: Admin has no task surface whatsoever, stats included.
    (Resource.TASK, "list"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "retrieve"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "create"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "partial_update"): frozenset({SUPERVISOR, OPERATOR}),
    # Reachable for an Operator; whether THIS row may be deleted is IsTaskCreator's
    # question (D27). Spec §12.2 records the division of labour.
    (Resource.TASK, "destroy"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "complete"): frozenset({SUPERVISOR, OPERATOR}),
    (Resource.TASK, "stats"): frozenset({SUPERVISOR, OPERATOR}),
}


def is_allowed(role: str, resource: str, action: str) -> bool:
    """Deny by default: an unlisted pair is unreachable, not unrestricted."""
    return role in MATRIX.get((resource, action), frozenset())
```

`MATRIX.get(..., frozenset())` is the fail-closed default: a new action added to a viewset without a matrix row is **denied**, not silently allowed.

**There is no `update` (PUT) row.** Spec §8.1 registers `PATCH` only, so PUT is genuinely unsupported rather than forbidden — and Step 4's `action is None` guard is what makes it answer 405 instead of 403.

- [ ] **Step 4: Write `backend/apps/core/permissions/classes.py`**

```python
# apps/core/permissions/classes.py
"""Permission classes. RolePermission answers endpoint reachability from the
matrix; IsTaskCreator (Task 31) answers the one object-level rule."""

from rest_framework.permissions import BasePermission

from apps.core.permissions.matrix import is_allowed


class RolePermission(BasePermission):
    """Matrix-driven endpoint reachability (D11).

    The view declares `permission_resource`; the DRF action supplies the rest.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # DRF runs permissions BEFORE handler lookup, so an HTTP method the router
        # never mapped arrives with action=None. Denying it would answer 403 for a
        # method that is simply not supported; let DRF answer 405 instead.
        if getattr(view, "action", None) is None:
            return True
        resource = getattr(view, "permission_resource", None)
        if resource is None:
            raise AssertionError(
                f"{view.__class__.__name__} must declare permission_resource "
                "to use RolePermission"
            )
        return is_allowed(user.role, resource, view.action)
```

Two deliberate choices:

- **Raising on a missing `permission_resource`** rather than returning `False`: a misconfigured view must fail loudly in development, not quietly 403 in production.
- **`action is None` returns `True`.** DRF's `dispatch()` calls `initial()` — which checks permissions — *before* it looks up the method handler, so an unmapped method (a `PUT` to `/users/{id}/`) reaches the permission class with `view.action` set to `None`. Denying there would turn "this method is not supported" into "you are not allowed", and an Admin would see 403 where 405 is correct. Task 16 asserts this.

- [ ] **Step 5: Run to verify they pass**

```bash
uv run --directory backend pytest apps/core/tests/test_permission_matrix_data.py -q
```

Expected: 7 passed.

- [ ] **Step 6: Run the whole suite and `check`**

```bash
uv run --directory backend pytest -q
```

```bash
uv run --directory backend python manage.py check
```

- [ ] **Step 7: Append to README and commit**

Under **Key implementation decisions**, add D10 (why a `core` app with named modules rather than `utils.py`) and D11 (the matrix as data, and what it proves).

```bash
git add backend/apps/core README.md
git commit -m "feat: add declarative permission matrix and RolePermission"
```

**DoD:** B4, B10.

---

## Phase 3 — `apps.users`

Spec §15 phase 3. Users come before tasks because `AUTH_USER_MODEL` must exist before any migration references it (spec §5.4).

### Task 12: The custom `User` model

**Files:**
- Create: `backend/apps/users/__init__.py`, `apps.py`, `models.py`, `admin.py`
- Create: `backend/apps/users/migrations/__init__.py`
- Create: `backend/apps/users/tests/__init__.py`, `factories.py`, `test_models.py`
- Modify: `backend/config/settings/base.py` (`INSTALLED_APPS`, `AUTH_USER_MODEL`, `SILENCED_SYSTEM_CHECKS`)

- [ ] **Step 1: Write the failing tests**

`backend/apps/users/tests/test_models.py`:

```python
import uuid

import pytest
from django.db import IntegrityError, transaction

from apps.core.roles import Role
from apps.users.models import User
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_user_gets_a_uuid7_primary_key():
    user = UserFactory()
    assert uuid.UUID(str(user.pk)).version == 7


def test_email_is_normalized_to_lowercase():
    user = UserFactory(email="Mixed.Case@Example.COM")
    assert user.email == "mixed.case@example.com"


def test_two_live_users_cannot_share_an_email():
    UserFactory(email="taken@example.com")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(
            email="taken@example.com", password="pass12345", first_name="A", last_name="B",
            role=Role.OPERATOR,
        )


def test_a_soft_deleted_users_email_becomes_reusable():
    """The direct test of the partial unique index (D21)."""
    original = UserFactory(email="recycled@example.com")
    original.soft_delete()
    replacement = User.objects.create_user(
        email="recycled@example.com", password="pass12345", first_name="New", last_name="Owner",
        role=Role.OPERATOR,
    )
    assert replacement.pk != original.pk


def test_soft_deleted_users_are_invisible_to_the_default_manager():
    user = UserFactory()
    user.soft_delete()
    assert not User.objects.filter(pk=user.pk).exists()
    assert User.all_objects.filter(pk=user.pk).exists()


def test_default_manager_is_the_filtering_one():
    """Authentication calls User._default_manager.get_by_natural_key(); if that
    resolved to all_objects, a soft-deleted user could still log in."""
    assert User._default_manager.__class__.__name__ == "UserManager"


def test_soft_delete_also_revokes_authentication():
    """D22: is_active and deleted_at are not synonyms, but deletion sets both."""
    user = UserFactory()
    user.soft_delete()
    reloaded = User.all_objects.get(pk=user.pk)
    assert reloaded.deleted_at is not None
    assert reloaded.is_active is False


def test_history_records_the_deletion_and_keeps_the_pre_deletion_state():
    user = UserFactory(first_name="Original")
    user.soft_delete()
    history = list(User.all_objects.get(pk=user.pk).history.all())
    latest, previous = history[0], history[1]
    # Deletion is recorded as an ordinary update, so the trail stays continuous.
    assert latest.history_type == "~"
    assert latest.deleted_at is not None
    # And the state before deletion is still recoverable.
    assert previous.deleted_at is None
    assert previous.first_name == "Original"


def test_history_id_stays_an_integer():
    """dedupe_key composes history_id (spec §10.3b); an integer keeps it short."""
    user = UserFactory()
    assert isinstance(user.history.first().history_id, int)


def test_history_does_not_store_the_password_hash():
    user = UserFactory()
    assert not hasattr(user.history.first(), "password")
```

- [ ] **Step 2: Write `backend/apps/users/tests/factories.py`**

`_create` routes through `create_user` so every factory-made user exercises the real manager — password hashing and email normalization included.

```python
import factory
from factory.django import DjangoModelFactory

from apps.core.roles import Role
from apps.users.models import User

DEFAULT_PASSWORD = "factory-pass-12345"


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = "Test"
    last_name = "User"
    role = Role.OPERATOR

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("password", DEFAULT_PASSWORD)
        return model_class.objects.create_user(password=password, **kwargs)


class AdminFactory(UserFactory):
    email = factory.Sequence(lambda n: f"admin{n}@example.com")
    role = Role.ADMIN
    is_staff = True


class SupervisorFactory(UserFactory):
    email = factory.Sequence(lambda n: f"supervisor{n}@example.com")
    role = Role.SUPERVISOR


class OperatorFactory(UserFactory):
    email = factory.Sequence(lambda n: f"operator{n}@example.com")
    role = Role.OPERATOR
```

- [ ] **Step 3: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users -q
```

Expected: `ModuleNotFoundError: No module named 'apps.users'`.

- [ ] **Step 4: Write `backend/apps/users/apps.py` and `models.py`**

The app label must be exactly `users` so `AUTH_USER_MODEL = "users.User"` resolves.

```python
# apps/users/apps.py
from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = "apps.users"
    label = "users"
```

```python
# apps/users/models.py
"""The custom user. USERNAME_FIELD is email; uniqueness is partial (D21)."""

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.models import SoftDeleteModel
from apps.core.roles import Role


class UserManager(BaseUserManager):
    """Hides soft-deleted users; owns email normalization (D24) and hashing."""

    def get_queryset(self) -> models.QuerySet:
        return super().get_queryset().filter(deleted_at__isnull=True)

    def create_user(self, email: str, password: str | None = None, **extra):
        if not email:
            raise ValueError("A user requires an email address.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.setdefault("role", Role.ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if not (extra["is_staff"] and extra["is_superuser"]):
            raise ValueError("A superuser must have is_staff and is_superuser set.")
        return self.create_user(email, password, **extra)


class AllUsersManager(BaseUserManager):
    """Escape hatch for tests, data repair and audit queries. Sees deleted rows."""


class User(SoftDeleteModel, AbstractBaseUser, PermissionsMixin):
    # Not unique=True: uniqueness is the partial constraint below, so a deleted
    # user's email becomes reusable (D21).
    email = models.EmailField(max_length=254)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    role = models.CharField(max_length=16, choices=Role.choices)
    # Django's authentication gate. NOT a synonym for deleted_at (D22): an Admin
    # may deactivate a user without deleting them.
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    # Redeclared explicitly, and pinned by default_manager_name below, because
    # manager order under multiple inheritance is not reliable (see Task 8).
    objects = UserManager()
    all_objects = AllUsersManager()

    # The hash is excluded: an audit trail needs to know a password changed,
    # not to keep a second copy of every hash a user ever had.
    history = HistoricalRecords(excluded_fields=["password"])

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        default_manager_name = "objects"
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=Q(deleted_at__isnull=True),
                name="uniq_active_user_email",
            )
        ]
        indexes = [
            models.Index(
                fields=["role"],
                condition=Q(deleted_at__isnull=True),
                name="user_role_live_idx",
            ),
            models.Index(fields=["deleted_at"], name="user_deleted_at_idx"),
        ]

    def __str__(self) -> str:
        return self.email

    def soft_delete(self, by=None) -> None:
        """Deletion also revokes authentication (D22)."""
        self.deleted_at = timezone.now()
        self.deleted_by = by
        self.is_active = False
        self.save(update_fields=["deleted_at", "deleted_by", "is_active"])
```

- [ ] **Step 5: Register the app and silence the one check a partial unique index forces**

In `config/settings/base.py`:

```python
INSTALLED_APPS += ["apps.users"]   # append in place, after "apps.core"

AUTH_USER_MODEL = "users.User"

# auth.E003 requires USERNAME_FIELD to carry a *total* unique constraint, and
# Options.total_unique_constraints deliberately excludes partial ones. D21 needs
# the constraint to be partial so a deleted user's email becomes reusable, so the
# check cannot be satisfied — only silenced. The guarantee it would have given is
# covered instead by test_two_live_users_cannot_share_an_email (Task 12).
SILENCED_SYSTEM_CHECKS = ["auth.E003"]
```

Silencing a security-adjacent check is the kind of thing that must not be discovered later by reading settings — record it in the README's **Known limitations** section in Step 9.

- [ ] **Step 6: Write a minimal `admin.py`**

Per `backend §43`: useful fields, no unnecessary sensitive data.

```python
# apps/users/admin.py
from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.users.models import User


@admin.register(User)
class UserAdmin(SimpleHistoryAdmin):
    list_display = ("email", "first_name", "last_name", "role", "is_active", "deleted_at")
    list_filter = ("role", "is_active")
    search_fields = ("email", "first_name", "last_name")
    readonly_fields = ("date_joined", "last_login", "deleted_at", "deleted_by")
    exclude = ("password",)
```

- [ ] **Step 7: Generate the migration**

```bash
uv run --directory backend python manage.py makemigrations users
```

Expected: `users/migrations/0001_initial.py` creating `User` and `HistoricalUser`. Open it and confirm three things: `id` defaults to `uuid.uuid7`, the `UniqueConstraint` carries its `condition`, and `HistoricalUser.history_id` is an `AutoField`/`BigAutoField` — not a UUID.

- [ ] **Step 8: Run the tests**

A Postgres instance must be reachable (`docker compose up -d db`).

```bash
uv run --directory backend pytest apps/users/tests/test_models.py -q
```

Expected: 10 passed.

- [ ] **Step 9: Append to README and commit**

Record D20/D21/D22 (soft delete, reusable email, `is_active` vs `deleted_at`), D24 (lowercase email in a plain `EmailField`, avoiding the `citext` extension), D28 (UUIDv7), and the `auth.E003` silencing with its justification.

```bash
git add backend/apps/users backend/config/settings/base.py README.md
git commit -m "feat: add custom User with partial unique email and audit history"
```

**DoD:** B1, B2, B8, B10, B13.

---

### Task 13: `UserRepository` — the Protocol and its Django implementation

**Files:**
- Create: `backend/apps/users/repositories.py`
- Create: `backend/apps/users/tests/test_repositories.py`
- Create: `backend/apps/users/tests/fakes.py`

D8a, spec §5.2.1. The Protocol and its implementation are **co-located in one module** — contract at the top, implementation below — so a reader never has to ask where the real code is.

- [ ] **Step 1: Write the failing conformance tests**

Of the two, only the second earns its place: fakes do not inherit the Protocol, so nothing else catches a fake drifting from the real contract.

```python
# apps/users/tests/test_repositories.py
import pytest

from apps.core.roles import Role
from apps.users.repositories import DjangoUserRepository, UserRepository
from apps.users.tests.fakes import FakeUserRepository
from apps.users.tests.factories import UserFactory


def test_django_implementation_conforms_to_the_protocol():
    assert isinstance(DjangoUserRepository(), UserRepository)


def test_the_test_fake_conforms_to_the_same_protocol():
    """Fakes don't inherit the Protocol, so this is the only thing that catches a
    fake drifting from a signature the production repository no longer has."""
    assert isinstance(FakeUserRepository(), UserRepository)


def test_an_incomplete_fake_does_not_conform():
    class Incomplete:
        def get(self, user_id):
            return None

    assert not isinstance(Incomplete(), UserRepository)


@pytest.mark.django_db
class TestDjangoUserRepository:
    def test_get_by_email_normalizes_case(self):
        """No caller can accidentally do a case-sensitive lookup (D24)."""
        user = UserFactory(email="person@example.com")
        assert DjangoUserRepository().get_by_email("PERSON@Example.COM") == user

    def test_get_by_email_ignores_soft_deleted_users(self):
        user = UserFactory(email="gone@example.com")
        user.soft_delete()
        assert DjangoUserRepository().get_by_email("gone@example.com") is None

    def test_add_hashes_the_password(self):
        repository = DjangoUserRepository()
        user = repository.add(
            email="New@Example.com", password="plain-text-12345",
            first_name="A", last_name="B", role=Role.OPERATOR,
        )
        assert user.password != "plain-text-12345"
        assert user.check_password("plain-text-12345")

    def test_soft_delete_sets_marker_and_actor_together(self):
        actor = UserFactory()
        target = UserFactory()
        DjangoUserRepository().soft_delete(target, by=actor)
        reloaded = type(target).all_objects.get(pk=target.pk)
        assert reloaded.deleted_at is not None
        assert reloaded.deleted_by == actor
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_repositories.py -q
```

Expected: `ModuleNotFoundError: apps.users.repositories`.

- [ ] **Step 3: Write `backend/apps/users/repositories.py`**

Four rules, each with a reason (spec §5.2.1): the implementation inherits the Protocol explicitly; **every** Protocol member is `@abstractmethod`; the Protocol is `@runtime_checkable`; the abstraction takes the plain name.

```python
# apps/users/repositories.py
"""Persistence boundary for User — the only module in this app that touches the ORM."""

from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from apps.users.models import User


@runtime_checkable
class UserRepository(Protocol):
    """What a service may ask of user storage."""

    @abstractmethod
    def get(self, user_id: UUID) -> User | None: ...

    @abstractmethod
    def get_by_email(self, email: str) -> User | None:
        """Case-insensitive by construction, so no caller can get it wrong (D24)."""

    @abstractmethod
    def add(self, *, email: str, password: str, first_name: str, last_name: str, role: str) -> User:
        """Creates a user with a hashed password."""

    @abstractmethod
    def save(self, user: User) -> User: ...

    @abstractmethod
    def soft_delete(self, user: User, *, by: User) -> None: ...


class DjangoUserRepository(UserRepository):
    """ORM-backed UserRepository."""

    def get(self, user_id: UUID) -> User | None:
        return User.objects.filter(pk=user_id).first()

    def get_by_email(self, email: str) -> User | None:
        return User.objects.filter(email=email.strip().lower()).first()

    def add(self, *, email: str, password: str, first_name: str, last_name: str, role: str) -> User:
        return User.objects.create_user(
            email=email, password=password,
            first_name=first_name, last_name=last_name, role=role,
        )

    def save(self, user: User) -> User:
        user.save()
        return user

    def soft_delete(self, user: User, *, by: User) -> None:
        user.deleted_at = timezone.now()
        user.deleted_by = by
        user.is_active = False
        user.save(update_fields=["deleted_at", "deleted_by", "is_active"])
```

`from django.utils import timezone` goes at the top of the module with the other imports.

Two signature choices worth stating, both matching spec §5.2's method inventory exactly:

- **`save(user)` takes no `update_fields`.** A partial save sounds safer but is not: a `password` change and a `role` change travel through the same method, and an omitted field list is one more thing to get wrong. Full saves, and the row was just read.
- **`soft_delete` sets `deleted_at`, `deleted_by` and `is_active` in one `save()`**, so a soft delete can never be half-applied.

**Why `Protocol` rather than a plain `ABC`**, given the explicit inheritance and `@abstractmethod` make it look like one: a test fake conforms **without inheriting**, which is what Step 4 relies on.

- [ ] **Step 4: Write `backend/apps/users/tests/fakes.py`**

```python
# apps/users/tests/fakes.py
"""In-memory repositories for service unit tests. These deliberately do NOT
inherit the Protocol — test_repositories.py asserts structural conformance."""

from uuid import UUID

from apps.users.models import User


class FakeUserRepository:
    def __init__(self, users: list[User] | None = None):
        self._users = {u.pk: u for u in (users or [])}
        self.deleted: list[User] = []

    def get(self, user_id: UUID) -> User | None:
        return self._users.get(user_id)

    def get_by_email(self, email: str) -> User | None:
        wanted = email.strip().lower()
        return next((u for u in self._users.values() if u.email == wanted), None)

    def add(self, *, email, password, first_name, last_name, role) -> User:
        user = User(email=email.lower(), first_name=first_name, last_name=last_name, role=role)
        user.set_password(password)
        self._users[user.pk] = user
        return user

    def save(self, user: User) -> User:
        self._users[user.pk] = user
        return user

    def soft_delete(self, user: User, *, by: User) -> None:
        user.is_active = False
        self.deleted.append(user)
```

- [ ] **Step 5: Run to verify, and run mypy**

```bash
uv run --directory backend pytest apps/users/tests/test_repositories.py -q
```

Expected: 7 passed.

```bash
uv run --directory backend mypy
```

Expected: clean. This is mypy's actual job here — it catches **signature drift** between the Protocol and `DjangoUserRepository`, which `@abstractmethod` and `isinstance` both miss because the method is still present.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/users/repositories.py backend/apps/users/tests/test_repositories.py backend/apps/users/tests/fakes.py
git commit -m "feat: add UserRepository Protocol with ORM implementation and conformance tests"
```

**DoD:** B6, B10.

---

### Task 14: User selectors and `UserService`

**Files:**
- Create: `backend/apps/users/selectors.py`, `services.py`
- Create: `backend/apps/users/tests/test_services.py`

- [ ] **Step 1: Write `backend/apps/users/selectors.py`**

```python
# apps/users/selectors.py
"""Reusable user reads. Returns querysets; called by views and services."""

from django.db.models import QuerySet

from apps.core.roles import Role
from apps.users.models import User


def scoped_users(user: User) -> QuerySet[User]:
    """Rows visible to `user`.

    Admin and Supervisor see the same rows today; what differs is the SERIALIZER
    (spec §7.2 rule 2), not the row set. This selector owns the deterministic
    ordering pagination requires (spec §8.3) — `email` is unique among live rows,
    so it is a valid tiebreaker on its own.
    """
    return User.objects.all().order_by("email")


def assignable_users() -> QuerySet[User]:
    """Users who may hold a task: Supervisor or Operator, never Admin (D17).

    Assigning to an Admin would create a task nobody can open, given D13.
    """
    return User.objects.filter(role__in=(Role.SUPERVISOR, Role.OPERATOR)).order_by("email")
```

- [ ] **Step 2: Write the failing service tests**

The fake repository is the whole persistence layer — **no row is ever written** — but the module still carries `django_db`. That is not a contradiction: `UserService` wraps its writes in `transaction.atomic()`, and `Atomic.__enter__` calls `connection.get_autocommit()`, which pytest-django patches to raise `RuntimeError: Database access not allowed` for any test without the marker. The marker buys a connection, not a fixture.

```python
# apps/users/tests/test_services.py
import pytest

from apps.core.roles import Role
from apps.users.models import User
from apps.users.services import EmailAlreadyInUse, UserService
from apps.users.tests.fakes import FakeUserRepository

# Needed for transaction.atomic(), not for persistence: the fake repository
# stores everything in memory and nothing reaches a table.
pytestmark = pytest.mark.django_db


def service(users=None) -> UserService:
    return UserService(users=FakeUserRepository(users or []))


def test_create_hashes_the_password_and_normalizes_the_email():
    created = service().create(
        data={
            "email": "New.Person@Example.COM", "password": "a-good-password-1",
            "first_name": "New", "last_name": "Person", "role": Role.OPERATOR,
        },
        actor=User(email="admin@example.com", role=Role.ADMIN),
    )
    assert created.email == "new.person@example.com"
    assert created.check_password("a-good-password-1")


def test_create_rejects_an_email_already_held_by_a_live_user():
    existing = User(email="taken@example.com", role=Role.OPERATOR)
    with pytest.raises(EmailAlreadyInUse) as caught:
        service([existing]).create(
            data={
                "email": "TAKEN@example.com", "password": "a-good-password-1",
                "first_name": "A", "last_name": "B", "role": Role.OPERATOR,
            },
            actor=User(email="admin@example.com", role=Role.ADMIN),
        )
    assert caught.value.default_code == "email_already_in_use"


def test_update_applies_only_the_supplied_fields():
    target = User(email="target@example.com", first_name="Old", last_name="Name",
                  role=Role.OPERATOR, is_active=True)
    updated = service([target]).update(
        user=target, data={"first_name": "New"},
        actor=User(email="admin@example.com", role=Role.ADMIN),
    )
    assert updated.first_name == "New"
    assert updated.last_name == "Name"


def test_update_rehashes_a_supplied_password():
    target = User(email="target@example.com", role=Role.OPERATOR)
    target.set_password("original-password")
    updated = service([target]).update(
        user=target, data={"password": "replacement-password"},
        actor=User(email="admin@example.com", role=Role.ADMIN),
    )
    assert updated.check_password("replacement-password")


def test_delete_soft_deletes_and_records_the_actor():
    target = User(email="target@example.com", role=Role.OPERATOR)
    actor = User(email="admin@example.com", role=Role.ADMIN)
    repository = FakeUserRepository([target])
    UserService(users=repository).delete(user=target, actor=actor)
    assert repository.deleted == [target]
```

- [ ] **Step 3: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_services.py -q
```

Expected: `ModuleNotFoundError: apps.users.services`.

- [ ] **Step 4: Write `backend/apps/users/services.py`**

**The import list is the contract.** This module imports `UserRepository` and never `DjangoUserRepository`; Task 32 asserts that as a test rather than leaving it to review.

```python
# apps/users/services.py
"""User use cases. Imports the UserRepository Protocol — never a concrete repository."""

import logging

from django.db import transaction

from apps.core.exceptions import ApplicationError
from apps.users.models import User
from apps.users.repositories import UserRepository  # the Protocol, and that is all

logger = logging.getLogger(__name__)


class EmailAlreadyInUse(ApplicationError):
    default_detail = "A user with this email address already exists."
    default_code = "email_already_in_use"
    status_code = 400


class UserService:
    def __init__(self, *, users: UserRepository):
        self._users = users

    def create(self, *, data: dict, actor: User) -> User:
        email = data["email"].strip().lower()
        if self._users.get_by_email(email) is not None:
            raise EmailAlreadyInUse
        with transaction.atomic():
            user = self._users.add(
                email=email,
                password=data["password"],
                first_name=data["first_name"],
                last_name=data["last_name"],
                role=data["role"],
            )
        logger.info("user.created id=%s role=%s by=%s", user.pk, user.role, actor.pk)
        return user

    def update(self, *, user: User, data: dict, actor: User) -> User:
        changed: list[str] = []
        for name in ("first_name", "last_name", "role", "is_active"):
            if name in data:
                setattr(user, name, data[name])
                changed.append(name)
        if "password" in data:
            user.set_password(data["password"])
            changed.append("password")
        if not changed:
            return user
        with transaction.atomic():
            self._users.save(user)
        # Field NAMES only — never a password, and never the new value.
        logger.info("user.updated id=%s fields=%s by=%s", user.pk, sorted(changed), actor.pk)
        return user

    def delete(self, *, user: User, actor: User) -> None:
        with transaction.atomic():
            self._users.soft_delete(user, by=actor)
        logger.info("user.soft_deleted id=%s by=%s", user.pk, actor.pk)
```

The `logger.info` in `update` logs field **names**, never values — `backend §28` forbids logging a password, and `fields` would carry `"password"` as a name only.

- [ ] **Step 5: Run to verify they pass**

```bash
uv run --directory backend pytest apps/users/tests/test_services.py -q
```

Expected: 5 passed. No table is touched, but a connection is opened — see Step 2.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/users/selectors.py backend/apps/users/services.py backend/apps/users/tests/test_services.py
git commit -m "feat: add user selectors and UserService on the repository Protocol"
```

**DoD:** B5, B6, B7, B10, B11, B12.

---

### Task 15: User serializers

**Files:**
- Create: `backend/apps/users/serializers.py`, `filters.py`
- Create: `backend/apps/users/tests/test_serializers.py`

Spec §8.2. Input and output contracts are separate (`backend §13`); no `fields = "__all__"`.

- [ ] **Step 1: Write the failing tests**

The field-list assertion on `UserMinimalSerializer` is a **privilege boundary test** (spec §16.2): adding a field there widens what a Supervisor can see.

```python
# apps/users/tests/test_serializers.py
import pytest

from apps.core.roles import Role
from apps.users.serializers import (
    UserCreateSerializer,
    UserMinimalSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_minimal_serializer_exposes_exactly_the_allowed_fields():
    """A privilege boundary: this is what a Supervisor may see (spec §7.2 rule 2)."""
    assert set(UserMinimalSerializer().fields) == {
        "id", "email", "first_name", "last_name", "role",
    }


def test_minimal_serializer_withholds_the_admin_only_fields():
    rendered = UserMinimalSerializer(UserFactory()).data
    for withheld in ("is_active", "is_staff", "is_superuser", "date_joined", "last_login", "password"):
        assert withheld not in rendered


def test_admin_serializer_never_renders_a_password():
    assert "password" not in UserSerializer(UserFactory()).data


def test_create_serializer_is_not_a_model_serializer():
    """D9 made structural: a plain Serializer has nothing to bypass, because
    there is no create()/update() inherited from ModelSerializer."""
    from rest_framework import serializers

    assert not isinstance(UserCreateSerializer(), serializers.ModelSerializer)
    assert not isinstance(UserUpdateSerializer(), serializers.ModelSerializer)


def test_create_serializer_rejects_a_weak_password():
    serializer = UserCreateSerializer(data={
        "email": "new@example.com", "password": "123",
        "first_name": "A", "last_name": "B", "role": Role.OPERATOR,
    })
    assert not serializer.is_valid()
    assert "password" in serializer.errors


def test_create_serializer_normalizes_email_case():
    serializer = UserCreateSerializer(data={
        "email": "  Mixed@Example.COM ", "password": "a-strong-password-1",
        "first_name": "A", "last_name": "B", "role": Role.OPERATOR,
    })
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["email"] == "mixed@example.com"


def test_create_serializer_rejects_an_unknown_role():
    serializer = UserCreateSerializer(data={
        "email": "new@example.com", "password": "a-strong-password-1",
        "first_name": "A", "last_name": "B", "role": "WIZARD",
    })
    assert not serializer.is_valid()
    assert "role" in serializer.errors


def test_update_serializer_accepts_a_partial_payload():
    serializer = UserUpdateSerializer(data={"first_name": "Only"})
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data == {"first_name": "Only"}
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_serializers.py -q
```

- [ ] **Step 3: Write `backend/apps/users/serializers.py`**

```python
# apps/users/serializers.py
"""User input and output contracts (spec §8.2).

Read serializers are ModelSerializer; WRITE serializers are plain Serializer
subclasses with no model binding, so D9's "no serializer persists" rule is
structural rather than conventional — there is no inherited create()/update()
to bypass the service with.
"""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.core.roles import Role
from apps.users.models import User


class UserMinimalSerializer(serializers.ModelSerializer):
    """What a Supervisor may see, and the shape of GET /users/me/.

    PRIVILEGE BOUNDARY: adding a field here widens Supervisor visibility.
    apps/users/tests/test_serializers.py pins the exact field set.
    """

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role"]


class UserSerializer(serializers.ModelSerializer):
    """Admin read."""

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "role",
            "is_active", "is_staff", "date_joined", "last_login",
        ]


def _validate_password_strength(value: str) -> str:
    try:
        validate_password(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return value


class UserCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=Role.choices)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()

    def validate_password(self, value: str) -> str:
        return _validate_password_strength(value)


class UserUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    role = serializers.ChoiceField(choices=Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)
    password = serializers.CharField(write_only=True, required=False)

    def validate_password(self, value: str) -> str:
        return _validate_password_strength(value)
```

Uniqueness is **not** checked in the serializer: it lives in `UserService.create`, which raises `EmailAlreadyInUse` (400, code `email_already_in_use`). One rule, one place — and the partial unique index is the final boundary beneath it.

- [ ] **Step 4: Write `backend/apps/users/filters.py`**

```python
# apps/users/filters.py
from django_filters import rest_framework as filters

from apps.core.roles import Role
from apps.users.models import User


class UserFilterSet(filters.FilterSet):
    role = filters.ChoiceFilter(choices=Role.choices)
    is_active = filters.BooleanFilter()

    class Meta:
        model = User
        fields = ["role", "is_active"]
```

No model field becomes filterable implicitly (`backend §16`). Free-text `search` is DRF's `SearchFilter` over `email`/`first_name`/`last_name`, configured on the viewset in Task 16.

- [ ] **Step 5: Run to verify**

```bash
uv run --directory backend pytest apps/users/tests/test_serializers.py -q
```

Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/users/serializers.py backend/apps/users/filters.py backend/apps/users/tests/test_serializers.py
git commit -m "feat: add user serializers with separate read and write contracts"
```

**DoD:** B3, B10.

---

### Task 16: `UserViewSet`, `/users/me/`, and the composition root

**Files:**
- Create: `backend/apps/users/views.py`, `urls.py`
- Create: `backend/apps/core/constants.py`
- Create: `backend/apps/users/tests/test_api_users.py`, `test_api_me.py`
- Modify: `backend/config/urls.py`, `backend/conftest.py`

- [ ] **Step 1: Add the role fixtures to `backend/conftest.py`**

```python
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
```

`force_authenticate` bypasses the JWT layer deliberately — Task 18 and 19 test the token flow itself, and every other API test should not pay for a login round-trip.

- [ ] **Step 2: Write the failing API tests**

```python
# apps/users/tests/test_api_users.py
import pytest

from apps.core.roles import Role
from apps.users.models import User
from apps.users.tests.factories import OperatorFactory, UserFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/users/"


def test_unauthenticated_requests_are_rejected(api_client):
    assert api_client.get(URL).status_code == 401


def test_admin_lists_users_with_the_full_serializer(admin_client):
    UserFactory()
    response = admin_client.get(URL)
    assert response.status_code == 200
    assert "is_staff" in response.data["results"][0]
    assert "count" in response.data and "next" in response.data


def test_supervisor_lists_users_with_the_minimal_serializer(supervisor_client):
    """The direct test of spec §7.2 rule 2."""
    UserFactory()
    response = supervisor_client.get(URL)
    assert response.status_code == 200
    row = response.data["results"][0]
    assert set(row) == {"id", "email", "first_name", "last_name", "role"}
    assert "is_staff" not in row
    assert "last_login" not in row


def test_supervisor_cannot_write_users(supervisor_client, operator):
    payload = {"email": "x@example.com", "password": "a-strong-password-1",
               "first_name": "A", "last_name": "B", "role": Role.OPERATOR}
    assert supervisor_client.post(URL, payload, format="json").status_code == 403
    assert supervisor_client.patch(f"{URL}{operator.pk}/", {"first_name": "X"},
                                   format="json").status_code == 403
    assert supervisor_client.delete(f"{URL}{operator.pk}/").status_code == 403


def test_operator_has_no_user_surface(operator_client, supervisor):
    assert operator_client.get(URL).status_code == 403
    assert operator_client.get(f"{URL}{supervisor.pk}/").status_code == 403


def test_admin_creates_a_user(admin_client):
    response = admin_client.post(URL, {
        "email": "Created@Example.com", "password": "a-strong-password-1",
        "first_name": "Created", "last_name": "Person", "role": Role.OPERATOR,
    }, format="json")
    assert response.status_code == 201
    assert response.data["email"] == "created@example.com"
    assert "password" not in response.data
    assert User.objects.filter(email="created@example.com").exists()


def test_creating_a_duplicate_live_email_returns_the_application_error(admin_client):
    UserFactory(email="dupe@example.com")
    response = admin_client.post(URL, {
        "email": "dupe@example.com", "password": "a-strong-password-1",
        "first_name": "A", "last_name": "B", "role": Role.OPERATOR,
    }, format="json")
    assert response.status_code == 400
    assert response.data["code"] == "email_already_in_use"


def test_admin_patches_a_user(admin_client):
    target = OperatorFactory()
    response = admin_client.patch(f"{URL}{target.pk}/", {"first_name": "Renamed"}, format="json")
    assert response.status_code == 200
    target.refresh_from_db()
    assert target.first_name == "Renamed"


def test_admin_delete_is_a_soft_delete(admin_client, admin):
    target = OperatorFactory()
    assert admin_client.delete(f"{URL}{target.pk}/").status_code == 204
    assert not User.objects.filter(pk=target.pk).exists()
    archived = User.all_objects.get(pk=target.pk)
    assert archived.deleted_at is not None
    assert archived.deleted_by == admin
    assert archived.is_active is False


def test_a_soft_deleted_user_is_absent_from_the_list(admin_client):
    deleted = UserFactory()
    deleted.soft_delete()
    emails = [row["email"] for row in admin_client.get(URL).data["results"]]
    assert deleted.email not in emails


def test_a_malformed_id_returns_404_without_touching_the_database(admin_client):
    assert admin_client.get(f"{URL}not-a-uuid/").status_code == 404


def test_put_is_method_not_allowed_rather_than_forbidden(admin_client, operator):
    """RolePermission returns True for an unmapped action so DRF can answer 405."""
    assert admin_client.put(f"{URL}{operator.pk}/", {}, format="json").status_code == 405


def test_role_and_is_active_filters(admin_client):
    OperatorFactory()
    inactive = OperatorFactory()
    inactive.is_active = False
    inactive.save(update_fields=["is_active"])
    assert all(r["role"] == Role.OPERATOR
               for r in admin_client.get(f"{URL}?role=OPERATOR").data["results"])
    assert admin_client.get(f"{URL}?is_active=false").data["count"] == 1


def test_page_size_override(admin_client):
    UserFactory.create_batch(5)
    assert len(admin_client.get(f"{URL}?page_size=2").data["results"]) == 2


def test_page_size_is_capped_at_max_page_size(admin_client):
    """Assert the number of ROWS RETURNED, not `count` — `count` is the total and
    `page_size` never affects it, so an assertion on `count` cannot fail."""
    UserFactory.create_batch(4)   # 4 + the admin fixture = 5 live users
    response = admin_client.get(f"{URL}?page_size=5000")
    total = response.data["count"]
    assert len(response.data["results"]) == min(total, 100)


def test_ordering_by_a_non_unique_field_is_tiebroken(admin_client):
    """TiebrokenOrderingFilter appends -id, so paging by `role` is stable."""
    UserFactory.create_batch(6, role=Role.OPERATOR)
    page1 = admin_client.get(f"{URL}?ordering=role&page_size=3").data["results"]
    page2 = admin_client.get(f"{URL}?ordering=role&page_size=3&page=2").data["results"]
    ids = [row["id"] for row in page1 + page2]
    assert len(set(ids)) == len(ids)
```

```python
# apps/users/tests/test_api_me.py
import pytest

pytestmark = pytest.mark.django_db
URL = "/api/v1/users/me/"


@pytest.mark.parametrize("client_fixture", ["admin_client", "supervisor_client", "operator_client"])
def test_every_authenticated_role_can_read_its_own_identity(request, client_fixture):
    """It is identity, not user management: the SPA needs its role to route."""
    response = request.getfixturevalue(client_fixture).get(URL)
    assert response.status_code == 200
    assert set(response.data) == {"id", "email", "first_name", "last_name", "role"}


def test_unauthenticated_me_is_401(api_client):
    assert api_client.get(URL).status_code == 401
```

- [ ] **Step 3: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_api_users.py -q
```

Expected: 404s everywhere — the routes do not exist.

- [ ] **Step 4: Write `backend/apps/core/constants.py`**

```python
# apps/core/constants.py
"""Values shared across apps that are not a model, a role, or a setting."""

# The canonical hyphenated 8-4-4-4-12 hex form. Deliberately NOT a UUID*v4*
# pattern: pinning the version nibble to 4 and the variant to [89ab] would reject
# every UUIDv7 id and 404 every detail route, while a malformed-id test would
# still pass — so nothing would catch it (spec §6.6).
UUID_LOOKUP_REGEX = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
```

- [ ] **Step 5: Write `backend/apps/users/views.py`**

No `CreateModelMixin`/`UpdateModelMixin`/`DestroyModelMixin`: those call `serializer.save()`, which D9 forbids. The read mixins are fine.

```python
# apps/users/views.py
"""User HTTP surface. The composition root for UserService lives here."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import UUID_LOOKUP_REGEX
from apps.core.ordering import TiebrokenOrderingFilter
from apps.core.permissions.classes import RolePermission
from apps.core.permissions.matrix import Resource
from apps.core.roles import Role
from apps.users.filters import UserFilterSet
from apps.users.repositories import DjangoUserRepository
from apps.users.selectors import scoped_users
from apps.users.serializers import (
    UserCreateSerializer,
    UserMinimalSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.users.services import UserService


class UserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_resource = Resource.USER
    permission_classes = [RolePermission]
    lookup_value_regex = UUID_LOOKUP_REGEX
    filterset_class = UserFilterSet
    # SearchFilter is listed explicitly rather than globally, because this is the
    # only viewset that searches. TiebrokenOrderingFilter, not DRF's
    # OrderingFilter: `?ordering=role` is not a total order on its own.
    filter_backends = [DjangoFilterBackend, SearchFilter, TiebrokenOrderingFilter]
    search_fields = ["email", "first_name", "last_name"]
    ordering_fields = ["email", "role", "date_joined"]
    ordering = ["email"]

    def get_queryset(self):
        return scoped_users(self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action == "partial_update":
            return UserUpdateSerializer
        # Spec §7.2 rule 2: a Supervisor gets a different SERIALIZER, not a flag.
        if self.request.user.role == Role.ADMIN:
            return UserSerializer
        return UserMinimalSerializer

    def get_service(self) -> UserService:
        """The composition root: the only place a concrete repository is named."""
        return UserService(users=DjangoUserRepository())

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = self.get_service().create(data=serializer.validated_data, actor=request.user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = UserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = self.get_service().update(
            user=user, data=serializer.validated_data, actor=request.user
        )
        return Response(UserSerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        self.get_service().delete(user=user, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET /users/me/ — identity, not user management, so every role may call it."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserMinimalSerializer(request.user).data)
```

`MeView` uses `IsAuthenticated` rather than `RolePermission`: it is an `APIView` with no DRF `action`, and the matrix row `(USER, "me")` is `ALL_ROLES` anyway. The matrix row stays because Task 32's suite asserts the cell.

- [ ] **Step 6: Wire the URLs**

```python
# apps/users/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.users.views import MeView, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    # Registered BEFORE the router so "me" is not captured as a user id. The
    # router's lookup_value_regex would reject it anyway; explicit order means
    # the guarantee does not depend on that.
    path("users/me/", MeView.as_view(), name="user-me"),
    path("", include(router.urls)),
]
```

```python
# config/urls.py
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.users.urls")),
]
```

- [ ] **Step 7: Run the tests**

```bash
uv run --directory backend pytest apps/users -q
```

Expected: all pass. If `test_put_is_method_not_allowed_rather_than_forbidden` returns 403, the `action is None` guard in `RolePermission` is missing.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/users/views.py backend/apps/users/urls.py backend/apps/core/constants.py backend/config/urls.py backend/conftest.py backend/apps/users/tests
git commit -m "feat: add user CRUD endpoints with role-scoped serializers"
```

**DoD:** B3, B4, B5, B6, B9, B10, B11, B13.

---

### Task 17: The `backend` CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

Spec §13. Coverage is **reported, not gated**, until Task 51 — a job that is red for several phases trains people to ignore it.

- [ ] **Step 1: Add the job**

```yaml
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: taskmanagement
          POSTGRES_USER: taskmanagement
          POSTGRES_PASSWORD: taskmanagement
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    env:
      POSTGRES_HOST: localhost
      POSTGRES_DB: taskmanagement
      POSTGRES_USER: taskmanagement
      POSTGRES_PASSWORD: taskmanagement
      REDIS_URL: redis://localhost:6379/0
      DJANGO_SECRET_KEY: ci-only-not-a-real-secret
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
      - run: uv sync --directory backend
      # Fails the build if a model change was committed without its migration.
      - run: uv run --directory backend python manage.py makemigrations --check --dry-run
      - run: uv run --directory backend python manage.py migrate
      # Coverage is REPORTED here, not gated. --cov-fail-under=80 lands in Task 51.
      - run: uv run --directory backend pytest --cov=apps --cov-report=term-missing
```

`makemigrations --check` runs under the **test** settings module (set in `pyproject.toml`), which targets Postgres — so the service is needed even for the check step.

- [ ] **Step 2: Verify locally, then commit**

```bash
uv run --directory backend python manage.py makemigrations --check --dry-run
```

Expected: `No changes detected`.

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add backend job with Postgres and Redis services"
```

**DoD:** B2, B10.

---

## Phase 4 — Authentication

Spec §15 phase 4 and §9. The access token lives only in frontend memory; the refresh token is only ever an HttpOnly cookie and **never appears in a JSON body**.

### Task 18: Cookie-based login

**Files:**
- Create: `backend/apps/users/auth_serializers.py`, `auth_views.py`, `cookies.py`
- Create: `backend/apps/users/tests/test_api_auth.py`
- Modify: `backend/config/settings/base.py` (`SIMPLE_JWT`), `backend/apps/users/urls.py`

- [ ] **Step 1: Write the failing tests**

```python
# apps/users/tests/test_api_auth.py
import pytest

from apps.users.tests.factories import DEFAULT_PASSWORD, OperatorFactory

pytestmark = pytest.mark.django_db
LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
COOKIE = "refresh_token"


def login(api_client, user, password=DEFAULT_PASSWORD):
    return api_client.post(LOGIN, {"email": user.email, "password": password}, format="json")


def test_login_returns_an_access_token_and_the_current_user(api_client):
    user = OperatorFactory()
    response = login(api_client, user)
    assert response.status_code == 200
    assert response.data["access"]
    assert response.data["user"]["email"] == user.email
    assert response.data["user"]["role"] == user.role


def test_login_response_body_contains_no_refresh_token(api_client):
    """Root AGENTS.md § Authentication: the refresh token is only ever a cookie."""
    response = login(api_client, OperatorFactory())
    assert "refresh" not in response.data


def test_refresh_cookie_is_httponly_and_path_scoped(api_client):
    response = login(api_client, OperatorFactory())
    cookie = response.cookies[COOKIE]
    assert cookie["httponly"]
    assert cookie["samesite"].lower() == "strict"
    # Not attached to ordinary API requests — only where it is needed.
    assert cookie["path"] == "/api/v1/auth/"


def test_wrong_password_is_401_and_does_not_set_a_cookie(api_client):
    user = OperatorFactory()
    response = login(api_client, user, password="definitely-wrong")
    assert response.status_code == 401
    assert COOKIE not in response.cookies


def test_a_soft_deleted_user_cannot_log_in(api_client):
    user = OperatorFactory()
    user.soft_delete()
    assert login(api_client, user).status_code == 401


def test_an_inactive_but_undeleted_user_cannot_log_in(api_client):
    user = OperatorFactory()
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert login(api_client, user).status_code == 401


def test_the_sixth_login_attempt_in_a_minute_is_throttled(api_client, settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]},
    }
    user = OperatorFactory()
    for _ in range(5):
        login(api_client, user, password="wrong")
    response = login(api_client, user, password="wrong")
    assert response.status_code == 429
    assert "Retry-After" in response


def test_access_token_authenticates_a_subsequent_request(api_client):
    user = OperatorFactory()
    access = login(api_client, user).data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert api_client.get("/api/v1/users/me/").status_code == 200
```

Throttle counters must be cleared between tests; add this to `conftest.py`:

```python
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_api_auth.py -q
```

Expected: 404 — no auth routes.

- [ ] **Step 3: Add `SIMPLE_JWT` to `config/settings/base.py`**

```python
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", False)  # True in production.py
```

`USER_ID_FIELD = "id"` matters: the default is `"id"` already, but the claim now carries a **UUID string**, so nothing downstream may assume an integer.

Add to `production.py`: `REFRESH_COOKIE_SECURE = True`.

- [ ] **Step 4: Write `backend/apps/users/cookies.py`**

```python
# apps/users/cookies.py
"""The refresh-token cookie. One module so its attributes are set in one place."""

from django.conf import settings
from rest_framework.response import Response


def set_refresh_cookie(response: Response, token: str, *, max_age_seconds: int) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=max_age_seconds,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
        path=settings.REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite="Strict",
    )
```

`SameSite=Strict` is the primary CSRF defence for these endpoints: a cross-site request will not carry the cookie at all. Spec §9.2 records the deployment constraint this creates — the SPA and API must stay same-site, or refresh silently stops working with no CORS error to explain it. Put that in the README's **Known limitations**.

- [ ] **Step 5: Write `backend/apps/users/auth_serializers.py`**

```python
# apps/users/auth_serializers.py
"""Token serializers that add the current user to the login payload."""

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.users.serializers import UserMinimalSerializer


class LoginSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        data = super().validate(attrs)
        # The SPA needs its role to pick a landing page; one round trip instead of two.
        data["user"] = UserMinimalSerializer(self.user).data
        return data
```

simplejwt authenticates through `django.contrib.auth.authenticate`, which goes to `ModelBackend` → `User._default_manager.get_by_natural_key()` → the filtering `UserManager`, and then checks `user_can_authenticate()` (`is_active`). That is why both the soft-deleted and the inactive login tests pass with no extra code — and why Task 12's `test_default_manager_is_the_filtering_one` is load-bearing rather than decorative.

- [ ] **Step 6: Write the login view in `backend/apps/users/auth_views.py`**

```python
# apps/users/auth_views.py
"""Auth endpoints. The refresh token moves from the response body to a cookie."""

import logging

from django.conf import settings
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.throttling import LoginRateThrottle
from apps.users.auth_serializers import LoginSerializer
from apps.users.cookies import set_refresh_cookie

logger = logging.getLogger(__name__)


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [LoginRateThrottle]
    permission_classes = []

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)
        if refresh is not None:
            set_refresh_cookie(
                response,
                refresh,
                max_age_seconds=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            )
        return response

    def handle_exception(self, exc):
        # backend §20: log the attempt with IP and email. NEVER the password.
        if getattr(exc, "status_code", None) in (401, 400):
            logger.warning(
                "auth.login_failed ip=%s email=%s",
                self.request.META.get("REMOTE_ADDR"),
                self.request.data.get("email"),
            )
        return super().handle_exception(exc)
```

- [ ] **Step 7: Route it**

In `apps/users/urls.py`, add before the router include:

```python
path("auth/login/", LoginView.as_view(), name="auth-login"),
```

- [ ] **Step 8: Run the tests**

```bash
uv run --directory backend pytest apps/users/tests/test_api_auth.py -q
```

Expected: 8 passed. Step 1 writes **only** the login tests — the refresh and logout tests are added in Task 19 Step 1, so this file is fully green here rather than being filtered with `-k`, which would also deselect two login tests whose names contain "refresh".

- [ ] **Step 9: Commit**

```bash
git add backend/apps/users/auth_serializers.py backend/apps/users/auth_views.py backend/apps/users/cookies.py backend/apps/users/urls.py backend/config/settings backend/conftest.py backend/apps/users/tests/test_api_auth.py
git commit -m "feat: add cookie-based JWT login with per-IP throttling"
```

**DoD:** B4, B10, B12, B13.

---

### Task 19: Refresh and logout

**Files:**
- Modify: `backend/apps/users/auth_views.py`, `urls.py`
- Modify: `backend/apps/users/tests/test_api_auth.py`

- [ ] **Step 1: Add the failing tests**

```python
def test_refresh_reads_the_cookie_and_returns_a_new_access_token(api_client):
    login(api_client, OperatorFactory())
    response = api_client.post(REFRESH, {}, format="json")
    assert response.status_code == 200
    assert response.data["access"]
    assert "refresh" not in response.data


def test_refresh_rotates_the_cookie(api_client):
    original = login(api_client, OperatorFactory()).cookies[COOKIE].value
    rotated = api_client.post(REFRESH, {}, format="json").cookies[COOKIE].value
    assert rotated != original


def test_refresh_without_a_cookie_is_401(api_client):
    response = api_client.post(REFRESH, {}, format="json")
    assert response.status_code == 401
    assert response.data["code"] == "refresh_cookie_missing"


def test_a_rotated_refresh_token_is_blacklisted(api_client):
    client_cookie = login(api_client, OperatorFactory()).cookies[COOKIE].value
    api_client.post(REFRESH, {}, format="json")   # rotates; blacklists the old one
    api_client.cookies[COOKIE] = client_cookie     # replay the original
    assert api_client.post(REFRESH, {}, format="json").status_code == 401


def test_logout_blacklists_the_token_clears_the_cookie_and_blocks_refresh(api_client):
    user = OperatorFactory()
    access = login(api_client, user).data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = api_client.post(LOGOUT, {}, format="json")
    assert response.status_code == 204
    assert response.cookies[COOKIE].value == ""
    assert api_client.post(REFRESH, {}, format="json").status_code == 401


def test_logout_requires_authentication(api_client):
    assert api_client.post(LOGOUT, {}, format="json").status_code == 401
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_api_auth.py -q
```

- [ ] **Step 3: Add the two views to `auth_views.py`**

```python
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.core.exceptions import ApplicationError
from apps.core.throttling import RefreshRateThrottle
from apps.users.cookies import clear_refresh_cookie, set_refresh_cookie


class RefreshCookieMissing(ApplicationError):
    default_detail = "No refresh token cookie was presented."
    default_code = "refresh_cookie_missing"
    status_code = status.HTTP_401_UNAUTHORIZED


class RefreshView(TokenRefreshView):
    """Reads the refresh token from the cookie, never the request body."""

    throttle_classes = [RefreshRateThrottle]
    permission_classes = []

    def post(self, request, *args, **kwargs):
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not token:
            raise RefreshCookieMissing
        # Inject the cookie value where simplejwt expects the body field.
        request._full_data = {**request.data, "refresh": token}
        response = super().post(request, *args, **kwargs)
        rotated = response.data.pop("refresh", None)
        if rotated is not None:
            set_refresh_cookie(
                response,
                rotated,
                max_age_seconds=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            )
        return response


class LogoutView(APIView):
    """Blacklists the presented refresh token so logout genuinely revokes."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                # Already expired or blacklisted: logout is idempotent.
                logger.info("auth.logout_with_unusable_token user=%s", request.user.pk)
        clear_refresh_cookie(response)
        logger.info("auth.logout user=%s", request.user.pk)
        return response
```

`request._full_data` is the documented-by-convention way to substitute parsed data on a DRF request; it is set **after** `request.data` has been read once, which the line above guarantees by referencing `request.data` in the same expression.

- [ ] **Step 4: Route both**

```python
path("auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
```

Both sit under `/api/v1/auth/`, which is exactly the cookie's `Path` scope — so the browser attaches the refresh cookie to these two endpoints and to nothing else.

- [ ] **Step 5: Run the full auth suite**

```bash
uv run --directory backend pytest apps/users/tests/test_api_auth.py -q
```

Expected: all pass. `rest_framework_simplejwt.token_blacklist` is already in `INSTALLED_APPS` from Task 2, so its migrations exist.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/users/auth_views.py backend/apps/users/urls.py backend/apps/users/tests/test_api_auth.py
git commit -m "feat: add cookie refresh with rotation and revoking logout"
```

**DoD:** B4, B10, B12, B13.

---

### Task 20: CORS, CSRF, and `compat` stage 2

**Files:**
- Modify: `backend/config/settings/base.py`, `production.py`
- Modify: `.github/workflows/ci.yml`
- Create: `backend/apps/users/tests/test_security_settings.py`

- [ ] **Step 1: Add the CORS and CSRF configuration**

```python
# config/settings/base.py
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOW_CREDENTIALS = True   # so the refresh cookie flows
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:5173")
# CORS_ALLOW_ALL_ORIGINS is never set (backend §22).
```

Django's CSRF middleware stays **enabled** and is never globally disabled (`backend §21`). Every endpoint other than the two auth routes authenticates via `Authorization: Bearer`, which the browser never attaches automatically and which is therefore immune to CSRF.

- [ ] **Step 2: Write the settings-assertion tests**

Security configuration is easy to weaken by accident, so assert it rather than trusting review.

```python
# apps/users/tests/test_security_settings.py
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


def test_production_settings_assert_the_security_posture():
    import importlib

    production = importlib.import_module("config.settings.production")
    assert production.SECURE_SSL_REDIRECT is True
    assert production.SECURE_HSTS_SECONDS >= 31536000
    assert production.SESSION_COOKIE_SECURE is True
    assert production.CSRF_COOKIE_SECURE is True
    assert production.REFRESH_COOKIE_SECURE is True
    assert production.DEBUG is False
```

`test_production_settings_assert_the_security_posture` imports `production.py`, which calls `env("DJANGO_SECRET_KEY")` and friends. Set those via `monkeypatch.setenv` in the test, or mark it `xfail`-free by giving the test module a fixture that populates the required variables — do the former; a test that needs real secrets to run is a test nobody runs.

- [ ] **Step 3: Extend `compat` with stage 2**

Spec §13: a login round-trip needs a real database, and the test settings target Postgres because the schema depends on partial indexes and a check constraint.

```yaml
  compat:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: taskmanagement
          POSTGRES_USER: taskmanagement
          POSTGRES_PASSWORD: taskmanagement
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      POSTGRES_HOST: localhost
      POSTGRES_DB: taskmanagement
      POSTGRES_USER: taskmanagement
      POSTGRES_PASSWORD: taskmanagement
      DJANGO_SECRET_KEY: ci-only-not-a-real-secret
    steps:
      # ... stage 1 steps unchanged ...
      # Stage 2: the git-pinned simplejwt actually issues and verifies a token
      # on Django 6.0 — the single most load-bearing claim in D3.
      - name: Login round-trip against the cookie auth views
        run: uv run --directory backend pytest apps/users/tests/test_api_auth.py -q
```

- [ ] **Step 4: Run everything and verify**

```bash
uv run --directory backend pytest -q
```

```bash
uv run --directory backend python manage.py check --deploy --settings=config.settings.production
```

The `--deploy` check will list warnings for anything missing in the production posture; resolve or consciously accept each one.

- [ ] **Step 5: Append to README and commit**

Record the §9.1 token flow (access in memory, refresh as HttpOnly cookie, 15 min / 7 days), the §9.3 throttle rates **and why the throttle cache is Redis rather than LocMemCache**, and the §9.2 same-site deployment constraint under **Known limitations**.

```bash
git add backend/config/settings .github/workflows/ci.yml backend/apps/users/tests/test_security_settings.py README.md
git commit -m "feat: configure CORS/CSRF posture and extend compat with a login round-trip"
```

**DoD:** B10, B12, B13.

---

## Phase 5 — `apps.tasks`

Spec §15 phase 5. **`simple-history` on `Task` is a phase 5 deliverable, not a phase 7 one**, because the notification `dedupe_key` is derived from `HistoricalTask.history_id` (spec §10.3b).

### Task 21: The `Task` model, its check constraint and its partial indexes

**Files:**
- Create: `backend/apps/tasks/__init__.py`, `apps.py`, `models.py`, `admin.py`
- Create: `backend/apps/tasks/migrations/__init__.py`
- Create: `backend/apps/tasks/tests/__init__.py`, `factories.py`, `test_models.py`
- Modify: `backend/config/settings/base.py` (`INSTALLED_APPS`)

- [ ] **Step 1: Write the failing tests**

```python
# apps/tasks/tests/test_models.py
import uuid
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.utils import timezone

from apps.tasks.models import TRANSITIONS, Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory

pytestmark = pytest.mark.django_db


def test_task_gets_a_uuid7_primary_key():
    assert uuid.UUID(str(TaskFactory().pk)).version == 7


def test_completed_at_must_accompany_a_completed_status():
    """The DB is the final boundary: this must fail even from a direct ORM write,
    the Django admin, or a data migration (D18)."""
    with pytest.raises(IntegrityError), transaction.atomic():
        TaskFactory(status=TaskStatus.COMPLETED, completed_at=None)


def test_completed_at_must_be_null_for_any_other_status():
    with pytest.raises(IntegrityError), transaction.atomic():
        TaskFactory(status=TaskStatus.PENDING, completed_at=timezone.now())


def test_completed_task_with_a_timestamp_is_accepted():
    task = TaskFactory(status=TaskStatus.COMPLETED, completed_at=timezone.now())
    assert task.completed_at is not None


def test_protect_prevents_hard_deleting_a_user_who_holds_tasks():
    """Nothing is ever hard-deleted, so this should never fire — and if it does
    it must fail loudly rather than silently null an audit record (D25)."""
    holder = OperatorFactory()
    TaskFactory(assignee=holder, created_by=holder)
    with pytest.raises(ProtectedError):
        type(holder).all_objects.filter(pk=holder.pk).delete()


def test_is_overdue_is_a_property_computed_from_loaded_data():
    past = timezone.now() - timedelta(days=1)
    assert TaskFactory(due_date=past, status=TaskStatus.PENDING).is_overdue is True
    assert TaskFactory(due_date=None, status=TaskStatus.PENDING).is_overdue is False
    assert TaskFactory(
        due_date=past, status=TaskStatus.COMPLETED, completed_at=timezone.now()
    ).is_overdue is False
    assert "is_overdue" not in {f.name for f in Task._meta.get_fields()}


def test_terminal_statuses_have_no_outgoing_transitions():
    assert TRANSITIONS[TaskStatus.COMPLETED] == frozenset()
    assert TRANSITIONS[TaskStatus.CANCELLED] == frozenset()


def test_completed_is_not_reachable_by_any_patch_transition():
    """D18: POST /complete/ is the only path to COMPLETED."""
    for reachable in TRANSITIONS.values():
        assert TaskStatus.COMPLETED not in reachable


def test_a_soft_deleted_task_is_invisible_to_the_default_manager():
    task = TaskFactory()
    task.soft_delete()
    assert not Task.objects.filter(pk=task.pk).exists()
    assert Task.all_objects.filter(pk=task.pk).exists()


def test_history_records_the_soft_delete_as_an_update():
    task = TaskFactory()
    task.soft_delete()
    latest = Task.all_objects.get(pk=task.pk).history.first()
    assert latest.history_type == "~"
    assert isinstance(latest.history_id, int)
```

- [ ] **Step 2: Write `backend/apps/tasks/tests/factories.py`**

```python
import factory
from factory.django import DjangoModelFactory

from apps.tasks.models import Task, TaskStatus
from apps.users.tests.factories import OperatorFactory, SupervisorFactory


class TaskFactory(DjangoModelFactory):
    class Meta:
        model = Task

    title = factory.Sequence(lambda n: f"Task {n}")
    description = ""
    status = TaskStatus.PENDING
    due_date = None
    completed_at = None
    assignee = factory.SubFactory(OperatorFactory)
    created_by = factory.SubFactory(SupervisorFactory)
```

- [ ] **Step 3: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks -q
```

- [ ] **Step 4: Write `backend/apps/tasks/apps.py` and `models.py`**

```python
# apps/tasks/apps.py
from django.apps import AppConfig


class TasksConfig(AppConfig):
    name = "apps.tasks"
    label = "tasks"
```

```python
# apps/tasks/models.py
"""The Task entity, its status vocabulary, and the transition map.

TRANSITIONS is module-level data consumed by BOTH the service and its tests, so
the rule and its enforcement cannot drift.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.models import SoftDeleteModel, TimeStampedModel


class TaskStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    IN_PROGRESS = "IN_PROGRESS", "In progress"
    COMPLETED = "COMPLETED", "Completed"
    CANCELLED = "CANCELLED", "Cancelled"


#: Statuses a task can still move out of, and which count toward "overdue".
OPEN_STATUSES: tuple[str, ...] = (TaskStatus.PENDING, TaskStatus.IN_PROGRESS)
#: Terminal statuses (D19). Reopening is a documented future extension.
TERMINAL_STATUSES: tuple[str, ...] = (TaskStatus.COMPLETED, TaskStatus.CANCELLED)

#: Transitions reachable by PATCH. COMPLETED is absent from every value on
#: purpose: POST /tasks/{id}/complete/ is the only path to it (D18), which is
#: what guarantees completed_at is always set alongside the status.
TRANSITIONS: dict[str, frozenset[str]] = {
    TaskStatus.PENDING: frozenset({TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED}),
    TaskStatus.IN_PROGRESS: frozenset({TaskStatus.PENDING, TaskStatus.CANCELLED}),
    TaskStatus.COMPLETED: frozenset(),
    TaskStatus.CANCELLED: frozenset(),
}


class Task(SoftDeleteModel, TimeStampedModel):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=TaskStatus.choices, default=TaskStatus.PENDING)
    # DateTimeField, not DateField: the hourly sweep compares to timezone.now(),
    # which needs a time of day (D23). Nullable — a task may have no deadline.
    due_date = models.DateTimeField(null=True, blank=True)
    # Grants visibility (D14).
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="assigned_tasks",
    )
    # Grants NO visibility, but gates delete (D27) and shapes recipients (D26).
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_tasks",
    )
    completed_at = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        # Deliberately NO Meta.ordering: ordering is applied per queryset so
        # pagination determinism is a conscious choice (spec §8.3).
        constraints = [
            models.CheckConstraint(
                condition=Q(status=TaskStatus.COMPLETED, completed_at__isnull=False)
                | (~Q(status=TaskStatus.COMPLETED) & Q(completed_at__isnull=True)),
                name="task_completed_at_matches_status",
            )
        ]
        # Every index is partial, scoped to live rows only.
        indexes = [
            models.Index(
                fields=["status", "due_date"],
                condition=Q(deleted_at__isnull=True),
                name="task_status_due_live_idx",
            ),
            models.Index(
                fields=["assignee", "status"],
                condition=Q(deleted_at__isnull=True),
                name="task_assignee_status_live_idx",
            ),
            models.Index(
                fields=["due_date"],
                condition=Q(deleted_at__isnull=True),
                name="task_due_live_idx",
            ),
            models.Index(fields=["deleted_at"], name="task_deleted_at_idx"),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def is_overdue(self) -> bool:
        """Computed from already-loaded data, so serializing it adds no query.
        Filtering uses the equivalent database Q() in TaskFilterSet."""
        return (
            self.due_date is not None
            and self.status in OPEN_STATUSES
            and self.due_date < timezone.now()
        )
```

**There is deliberately no index on `created_by`**, even though D27 makes it load-bearing for authorization: the check is `task.created_by_id == user.id` on a row the request has *already* fetched, so no `WHERE created_by = ...` is ever issued. `backend §30`'s evidence-driven rule therefore says no index. If a "created by" **filter** is ever added, the index comes with it.

**The "assignee is not an Admin" rule (D17) is absent from `constraints`** on purpose — it is a cross-table assertion and not expressible as a `CheckConstraint`. Tasks 26 and 25 enforce it at the serializer *and* service layers, with tests at both.

- [ ] **Step 5: Register the app and write `admin.py`**

```python
INSTALLED_APPS += ["apps.tasks"]
```

```python
# apps/tasks/admin.py
from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.tasks.models import Task


@admin.register(Task)
class TaskAdmin(SimpleHistoryAdmin):
    list_display = ("title", "status", "due_date", "assignee", "created_by", "deleted_at")
    list_filter = ("status",)
    search_fields = ("title", "description")
    readonly_fields = ("created_at", "updated_at", "completed_at", "deleted_at", "deleted_by")
    autocomplete_fields = ("assignee", "created_by")
```

- [ ] **Step 6: Generate the migration and inspect it**

```bash
uv run --directory backend python manage.py makemigrations tasks
```

Open the migration and confirm: all four indexes carry their `condition`, the `CheckConstraint` is present, both FKs are `PROTECT`, and `HistoricalTask.history_id` is an auto field.

- [ ] **Step 7: Run the tests**

```bash
uv run --directory backend pytest apps/tasks/tests/test_models.py -q
```

Expected: 10 passed.

- [ ] **Step 8: Append to README and commit**

Record D19 (terminal statuses), D23 (`DateTimeField`, nullable), D25 (`PROTECT`), the check constraint, and the no-index-on-`created_by` reasoning.

```bash
git add backend/apps/tasks backend/config/settings/base.py README.md
git commit -m "feat: add Task model with completion check constraint and partial indexes"
```

**DoD:** B1, B2, B8, B10.

---

### Task 22: `TaskRepository` — Protocol and implementation

**Files:**
- Create: `backend/apps/tasks/repositories.py`
- Create: `backend/apps/tasks/tests/fakes.py`, `test_repositories.py`

- [ ] **Step 1: Write the failing tests**

```python
# apps/tasks/tests/test_repositories.py
import pytest

from apps.tasks.models import Task, TaskStatus
from apps.tasks.repositories import DjangoTaskRepository, TaskRepository
from apps.tasks.tests.fakes import FakeTaskRepository
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import SupervisorFactory


def test_django_implementation_conforms_to_the_protocol():
    assert isinstance(DjangoTaskRepository(), TaskRepository)


def test_the_test_fake_conforms_to_the_same_protocol():
    assert isinstance(FakeTaskRepository(), TaskRepository)


def test_an_incomplete_fake_does_not_conform():
    class Incomplete:
        def get(self, task_id):
            return None

    assert not isinstance(Incomplete(), TaskRepository)


def test_a_missing_method_cannot_even_be_instantiated():
    """Without @abstractmethod, explicit inheritance would supply a `...` body
    returning None and this class would construct happily (spec §5.2.1)."""
    class Partial(TaskRepository):
        def get(self, task_id):
            return None

    with pytest.raises(TypeError, match="abstract"):
        Partial()


@pytest.mark.django_db
class TestDjangoTaskRepository:
    def test_get_ignores_soft_deleted_rows(self):
        task = TaskFactory()
        task.soft_delete()
        assert DjangoTaskRepository().get(task.pk) is None

    def test_get_for_update_returns_the_row(self):
        task = TaskFactory()
        from django.db import transaction

        with transaction.atomic():
            assert DjangoTaskRepository().get_for_update(task.pk) == task

    def test_add_persists_a_new_task(self):
        creator = SupervisorFactory()
        task = DjangoTaskRepository().add(
            Task(title="Fresh", created_by=creator, status=TaskStatus.PENDING)
        )
        assert Task.objects.filter(pk=task.pk).exists()

    def test_soft_delete_sets_marker_and_actor_together(self):
        actor = SupervisorFactory()
        task = TaskFactory()
        DjangoTaskRepository().soft_delete(task, by=actor)
        archived = Task.all_objects.get(pk=task.pk)
        assert archived.deleted_at is not None
        assert archived.deleted_by == actor
```

`test_a_missing_method_cannot_even_be_instantiated` is the one that proves the `@abstractmethod` rule is actually in force — spec §16.2 names "a Protocol member added without `@abstractmethod`" as a likely future regression.

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_repositories.py -q
```

- [ ] **Step 3: Write `backend/apps/tasks/repositories.py`**

```python
# apps/tasks/repositories.py
"""Persistence boundary for Task — the only module in this app that touches the ORM."""

from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from django.utils import timezone

from apps.tasks.models import Task
from apps.users.models import User


@runtime_checkable
class TaskRepository(Protocol):
    """What a service may ask of task storage."""

    @abstractmethod
    def get(self, task_id: UUID) -> Task | None: ...

    @abstractmethod
    def get_for_update(self, task_id: UUID) -> Task | None:
        """Row-locked fetch, for transitions that must not interleave."""

    @abstractmethod
    def add(self, task: Task) -> Task: ...

    @abstractmethod
    def save(self, task: Task) -> Task: ...

    @abstractmethod
    def soft_delete(self, task: Task, *, by: User) -> None: ...


class DjangoTaskRepository(TaskRepository):
    """ORM-backed TaskRepository."""

    def get(self, task_id: UUID) -> Task | None:
        return Task.objects.filter(pk=task_id).first()

    def get_for_update(self, task_id: UUID) -> Task | None:
        # The concurrency guard TaskService.complete depends on. Must run inside
        # transaction.atomic() or Postgres raises.
        return Task.objects.select_for_update().filter(pk=task_id).first()

    def add(self, task: Task) -> Task:
        task.save()
        return task

    def save(self, task: Task) -> Task:
        task.save()
        return task

    def soft_delete(self, task: Task, *, by: User) -> None:
        task.deleted_at = timezone.now()
        task.deleted_by = by
        task.save(update_fields=["deleted_at", "deleted_by"])
```

`save()` is a full save rather than a partial one: `Task` carries `auto_now` on `updated_at` and a `CheckConstraint` spanning `status` and `completed_at`, and a partial save that omitted either field could commit a row the constraint would otherwise have rejected.

- [ ] **Step 4: Write `backend/apps/tasks/tests/fakes.py`**

```python
# apps/tasks/tests/fakes.py
"""In-memory task repository and a recording dispatcher, for service unit tests.
Neither inherits its Protocol — conformance is asserted structurally."""

from uuid import UUID

from apps.tasks.models import Task
from apps.users.models import User


class FakeTaskRepository:
    def __init__(self, tasks: list[Task] | None = None):
        self._tasks = {t.pk: t for t in (tasks or [])}
        self.saved: list[Task] = []
        self.deleted: list[Task] = []
        self.locked: list[UUID] = []

    def get(self, task_id: UUID) -> Task | None:
        return self._tasks.get(task_id)

    def get_for_update(self, task_id: UUID) -> Task | None:
        self.locked.append(task_id)
        return self._tasks.get(task_id)

    def add(self, task: Task) -> Task:
        self._tasks[task.pk] = task
        self.saved.append(task)
        return task

    def save(self, task: Task) -> Task:
        self._tasks[task.pk] = task
        self.saved.append(task)
        return task

    def soft_delete(self, task: Task, *, by: User) -> None:
        self.deleted.append(task)


class RecordingDispatcher:
    """Records the notification calls a service made, in order."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def task_assigned(self, **kwargs) -> None:
        self.calls.append(("task_assigned", kwargs))

    def task_status_changed(self, **kwargs) -> None:
        self.calls.append(("task_status_changed", kwargs))

    def task_due_date_changed(self, **kwargs) -> None:
        self.calls.append(("task_due_date_changed", kwargs))

    @property
    def events(self) -> list[str]:
        return [name for name, _ in self.calls]
```

- [ ] **Step 5: Run the tests and mypy**

```bash
uv run --directory backend pytest apps/tasks/tests/test_repositories.py -q
```

```bash
uv run --directory backend mypy
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tasks/repositories.py backend/apps/tasks/tests/fakes.py backend/apps/tasks/tests/test_repositories.py
git commit -m "feat: add TaskRepository Protocol with row-locking implementation"
```

**DoD:** B6, B10.

---

### Task 23: Task selectors — scoping, the sweep candidate query, and stats

**Files:**
- Create: `backend/apps/tasks/selectors.py`
- Create: `backend/apps/tasks/tests/test_selectors.py`

> **One deliberate refinement of spec §10.4.** `overdue_candidates()` selects **four** columns, not three: `created_by__role` is joined because the recipient read-access gate (D26) needs it, and the sweep has no model instance to read it from. It is one extra column on a query that already runs, and it keeps D26 applying to the sweep as well as to the API path. Task 38's `test_an_operator_creator_who_no_longer_holds_the_task_is_not_swept_in` is what it buys.

- [ ] **Step 1: Write the failing tests**

```python
# apps/tasks/tests/test_selectors.py
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tasks.models import TaskStatus
from apps.tasks.selectors import overdue_candidates, scoped_tasks, task_stats
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db


def test_supervisor_sees_every_live_task():
    TaskFactory.create_batch(3)
    assert scoped_tasks(SupervisorFactory()).count() == 3


def test_operator_sees_only_tasks_assigned_to_them():
    operator = OperatorFactory()
    TaskFactory(assignee=operator)
    TaskFactory()  # someone else's
    assert scoped_tasks(operator).count() == 1


def test_a_task_an_operator_created_but_no_longer_holds_is_invisible():
    """The direct test of D14: created_by grants no visibility whatsoever."""
    operator = OperatorFactory()
    TaskFactory(created_by=operator, assignee=OperatorFactory())
    assert scoped_tasks(operator).count() == 0


def test_admin_scope_is_empty():
    """Belt and braces: the permission layer already answers 403 (D13)."""
    TaskFactory()
    assert scoped_tasks(AdminFactory()).count() == 0


def test_soft_deleted_tasks_are_excluded_from_every_scope():
    task = TaskFactory()
    task.soft_delete()
    assert scoped_tasks(SupervisorFactory()).count() == 0


def test_overdue_candidates_finds_only_live_non_terminal_past_due_tasks():
    past, future = timezone.now() - timedelta(days=1), timezone.now() + timedelta(days=1)
    wanted = TaskFactory(due_date=past, status=TaskStatus.PENDING)
    TaskFactory(due_date=future, status=TaskStatus.PENDING)
    TaskFactory(due_date=past, status=TaskStatus.CANCELLED)
    TaskFactory(due_date=past, status=TaskStatus.COMPLETED, completed_at=timezone.now())
    TaskFactory(due_date=None, status=TaskStatus.PENDING)
    deleted = TaskFactory(due_date=past, status=TaskStatus.PENDING)
    deleted.soft_delete()

    rows = list(overdue_candidates())
    assert [row[0] for row in rows] == [wanted.pk]
    assert len(rows[0]) == 4, "id, assignee_id, created_by_id, created_by__role"


def test_stats_matches_the_response_contract(django_assert_num_queries):
    supervisor = SupervisorFactory()
    now = timezone.now()
    TaskFactory(status=TaskStatus.PENDING, due_date=now - timedelta(days=2))
    TaskFactory(status=TaskStatus.IN_PROGRESS, due_date=now + timedelta(days=3))
    TaskFactory(status=TaskStatus.COMPLETED, completed_at=now)
    TaskFactory(status=TaskStatus.CANCELLED)

    with django_assert_num_queries(1):
        stats = task_stats(supervisor)

    assert stats["total"] == 4
    assert stats["by_status"] == {
        "PENDING": 1, "IN_PROGRESS": 1, "COMPLETED": 1, "CANCELLED": 1,
    }
    assert stats["overdue"] == 1
    assert stats["due_next_7_days"] == 1


def test_due_next_7_days_excludes_terminal_and_undated_tasks():
    """The figure the dashboard tile links against (spec §11.5)."""
    now = timezone.now()
    TaskFactory(status=TaskStatus.COMPLETED, completed_at=now, due_date=now + timedelta(days=2))
    TaskFactory(status=TaskStatus.PENDING, due_date=None)
    assert task_stats(SupervisorFactory())["due_next_7_days"] == 0
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_selectors.py -q
```

- [ ] **Step 3: Write `backend/apps/tasks/selectors.py`**

```python
# apps/tasks/selectors.py
"""Reusable task reads: role scoping, the sweep candidate query, and aggregation.

Owns "which rows, under what rules" — never eager loading. The viewset chains
.select_related(...) per action because eager loading follows the SERIALIZER in
use (spec §8.6), which keeps this module reusable by the sweep and by task_stats,
neither of which wants a join at all.
"""

from datetime import timedelta
from typing import Any

from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from apps.core.roles import Role
from apps.tasks.models import OPEN_STATUSES, Task, TaskStatus
from apps.users.models import User


def scoped_tasks(user: User) -> QuerySet[Task]:
    """Rows that exist from `user`'s perspective (D13, D14).

    This is what makes list visibility correct AND makes a detail request for a
    non-participant return 404 rather than 403 — list and detail cannot disagree
    because they read the same queryset.
    """
    if user.role == Role.SUPERVISOR:
        return Task.objects.all()
    if user.role == Role.OPERATOR:
        # assignee only. created_by grants no visibility (D14).
        return Task.objects.filter(assignee=user)
    return Task.objects.none()


def overdue_candidates():
    """Live, non-terminal, past-due tasks, as plain tuples.

    values_list(...).iterator() means a large backlog never materialises as model
    instances. created_by__role is joined because the recipient read-access gate
    (D26) needs it; it is one extra column on a query that already runs.
    Served by the ("status", "due_date") partial index.
    """
    return (
        Task.objects.filter(status__in=OPEN_STATUSES, due_date__lt=timezone.now())
        .values_list("id", "assignee_id", "created_by_id", "created_by__role")
        .iterator()
    )


def task_stats(user: User) -> dict[str, Any]:
    """The GET /tasks/stats/ payload, in ONE database round trip.

    Returns the finished nested shape rather than a queryset: aggregation is the
    one read this module owns end to end, and reshaping it in the view would put
    arithmetic back in the HTTP layer.

    `Count(filter=Q(...))` compiles to COUNT(*) FILTER (WHERE ...) on Postgres —
    the same single aggregate as a conditional Case/When, expressed directly.
    """
    now = timezone.now()
    horizon = now + timedelta(days=7)
    still_open = Q(status__in=OPEN_STATUSES)

    aggregated = scoped_tasks(user).aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status=TaskStatus.PENDING)),
        in_progress=Count("id", filter=Q(status=TaskStatus.IN_PROGRESS)),
        completed=Count("id", filter=Q(status=TaskStatus.COMPLETED)),
        cancelled=Count("id", filter=Q(status=TaskStatus.CANCELLED)),
        overdue=Count("id", filter=Q(due_date__lt=now) & still_open),
        # Excludes nulls AND terminal statuses, so the dashboard tile's
        # drill-through link in spec §11.5 can reproduce this number exactly.
        due_next_7_days=Count(
            "id", filter=Q(due_date__gte=now, due_date__lte=horizon) & still_open
        ),
    )
    return {
        "total": aggregated["total"],
        "by_status": {
            TaskStatus.PENDING.value: aggregated["pending"],
            TaskStatus.IN_PROGRESS.value: aggregated["in_progress"],
            TaskStatus.COMPLETED.value: aggregated["completed"],
            TaskStatus.CANCELLED.value: aggregated["cancelled"],
        },
        "overdue": aggregated["overdue"],
        "due_next_7_days": aggregated["due_next_7_days"],
    }
```

- [ ] **Step 4: Run the tests**

```bash
uv run --directory backend pytest apps/tasks/tests/test_selectors.py -q
```

Expected: 8 passed, including the single-query assertion on `stats`.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tasks/selectors.py backend/apps/tasks/tests/test_selectors.py
git commit -m "feat: add task selectors with single-query stats aggregation"
```

**DoD:** B5, B10.

---

### Task 24: Task errors and the notification dispatcher contract

**Files:**
- Create: `backend/apps/tasks/exceptions.py`
- Create: `backend/apps/notifications/__init__.py`, `dispatchers.py`

Spec §8.7. **The two assignee errors are distinct rules and must not share a code** — the frontend needs to tell them apart from `code` alone, without parsing `detail`.

- [ ] **Step 1: Write `backend/apps/tasks/exceptions.py`**

```python
# apps/tasks/exceptions.py
"""Task business errors. Each carries a stable code the frontend branches on."""

from rest_framework import status

from apps.core.exceptions import ApplicationError


class TaskNotFound(ApplicationError):
    """The row vanished between the view's scoped fetch and the service's locked
    re-read. Not the normal non-participant path — spec §7.3 keeps that a 404
    produced by queryset scoping."""

    default_detail = "That task no longer exists."
    default_code = "task_not_found"
    status_code = status.HTTP_404_NOT_FOUND


class InvalidStatusTransition(ApplicationError):
    default_detail = "That status change is not allowed from the task's current status."
    default_code = "invalid_status_transition"
    status_code = status.HTTP_409_CONFLICT


class CompletionRequiresCompleteAction(ApplicationError):
    default_detail = "Complete a task with POST /tasks/{id}/complete/."
    default_code = "use_complete_action"
    status_code = status.HTTP_400_BAD_REQUEST


class AssigneeNotAssignable(ApplicationError):
    """That USER cannot hold tasks: any role assigning to an Admin (D17)."""

    default_detail = "An Admin cannot be assigned tasks."
    default_code = "assignee_not_assignable"
    status_code = status.HTTP_400_BAD_REQUEST


class AssigneeImmutableForRole(ApplicationError):
    """YOUR ROLE cannot choose an assignee at all (D15, D16).

    400, not 403, for two reasons: the Operator create-side case is already a 400,
    so the same rule on update must not return a different status; and spec §7.3
    reserves 403 for the two permission layers, which keeps all four enforcement
    layers distinguishable from the response code alone.
    """

    default_detail = "Your role cannot choose a task's assignee."
    default_code = "assignee_immutable"
    status_code = status.HTTP_400_BAD_REQUEST
```

- [ ] **Step 2: Write `backend/apps/notifications/dispatchers.py`**

The Protocol lands now so `TaskService` is complete and unit-testable in this phase; `CeleryNotificationDispatcher` replaces the null implementation in Task 37.

```python
# apps/notifications/dispatchers.py
"""The notification boundary a task service depends on.

Only ids cross this boundary, never model instances: the real implementation
enqueues Celery messages, and a pickled model carries a stale snapshot.
"""

import logging
from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

logger = logging.getLogger(__name__)


@runtime_checkable
class NotificationDispatcher(Protocol):
    """What a service may ask of notification delivery."""

    @abstractmethod
    def task_assigned(self, *, task_id: UUID, history_id: int, actor_id: UUID) -> None: ...

    @abstractmethod
    def task_status_changed(self, *, task_id: UUID, history_id: int, actor_id: UUID) -> None: ...

    @abstractmethod
    def task_due_date_changed(self, *, task_id: UUID, history_id: int, actor_id: UUID) -> None: ...


class NullNotificationDispatcher(NotificationDispatcher):
    """Placeholder until Task 37 wires Celery. Logs rather than failing silently,
    so a phase-5 or phase-6 run makes the gap visible.
    """

    def task_assigned(self, *, task_id, history_id, actor_id) -> None:
        logger.info("notifications.not_wired event=ASSIGNED task=%s", task_id)

    def task_status_changed(self, *, task_id, history_id, actor_id) -> None:
        logger.info("notifications.not_wired event=STATUS_CHANGED task=%s", task_id)

    def task_due_date_changed(self, *, task_id, history_id, actor_id) -> None:
        logger.info("notifications.not_wired event=DUE_DATE_CHANGED task=%s", task_id)
```

Task 37 **must** delete `NullNotificationDispatcher` and swap the composition root. A test there asserts the swap happened — a silently-null dispatcher is exactly the kind of thing that ships unnoticed.

- [ ] **Step 3: Verify the modules import and commit**

```bash
uv run --directory backend python -c "import apps.tasks.exceptions, apps.notifications.dispatchers"
```

```bash
git add backend/apps/tasks/exceptions.py backend/apps/notifications
git commit -m "feat: add task error codes and the notification dispatcher Protocol"
```

**DoD:** B11.

---

### Task 25: `TaskService` — the single write path

**Files:**
- Create: `backend/apps/tasks/services.py`
- Create: `backend/apps/tasks/tests/test_services.py`

Spec §5.2.2. **The import list is the contract:** this module imports `TaskRepository` and `NotificationDispatcher`, and never a concrete implementation of either.

- [ ] **Step 1: Write the failing tests**

No Celery and no persisted rows — the fakes are the whole infrastructure layer. Two pytest-django facts shape how these are written, and both will otherwise waste an afternoon:

1. **`django_db` is required even though nothing is persisted.** Every method wraps its body in `transaction.atomic()`, and `Atomic.__enter__` calls `connection.get_autocommit()`, which pytest-django patches to raise `RuntimeError: Database access not allowed` without the marker. `_latest_history_id` also issues a real (empty) query.
2. **Every assertion on `dispatcher.events` needs `django_capture_on_commit_callbacks(execute=True)`.** `_enqueue` registers the callback inside the atomic block, and pytest-django rolls that transaction back, so the callbacks never fire on their own. The negative assertions (`events == []`) need the fixture *most*: without it they pass whatever the code does, which is the worst kind of green.

```python
# apps/tasks/tests/test_services.py
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core.roles import Role
from apps.tasks.exceptions import (
    AssigneeNotAssignable,
    CompletionRequiresCompleteAction,
    InvalidStatusTransition,
    TaskNotFound,
)
from apps.tasks.models import Task, TaskStatus
from apps.tasks.services import TaskService
from apps.tasks.tests.fakes import FakeTaskRepository, RecordingDispatcher
from apps.users.models import User

# For transaction.atomic(), not for persistence — see Step 1, note 1.
pytestmark = pytest.mark.django_db


def make_user(role=Role.OPERATOR, email="person@example.com") -> User:
    return User(email=email, role=role, first_name="A", last_name="B")


def build(tasks=None):
    repository = FakeTaskRepository(tasks or [])
    dispatcher = RecordingDispatcher()
    return TaskService(tasks=repository, notifications=dispatcher), repository, dispatcher


def test_create_assigns_the_supplied_assignee():
    supervisor, operator = make_user(Role.SUPERVISOR), make_user(email="op@example.com")
    service, repository, _ = build()
    task = service.create(
        data={"title": "Do it", "description": "", "due_date": None, "assignee": operator},
        actor=supervisor,
    )
    assert task.assignee == operator
    assert task.created_by == supervisor
    assert task.status == TaskStatus.PENDING
    assert repository.saved == [task]


def test_create_rejects_an_admin_assignee_at_the_service_layer():
    """D17 is re-checked here, not only in the serializer."""
    service, _, _ = build()
    with pytest.raises(AssigneeNotAssignable):
        service.create(
            data={"title": "x", "description": "", "due_date": None,
                  "assignee": make_user(Role.ADMIN, "admin@example.com")},
            actor=make_user(Role.SUPERVISOR),
        )


def test_create_notifies_the_new_assignee(django_capture_on_commit_callbacks):
    operator = make_user(email="op@example.com")
    service, _, dispatcher = build()
    with django_capture_on_commit_callbacks(execute=True):
        service.create(
            data={"title": "x", "description": "", "due_date": None, "assignee": operator},
            actor=make_user(Role.SUPERVISOR),
        )
    assert dispatcher.events == ["task_assigned"]


def test_create_without_an_assignee_notifies_nobody(django_capture_on_commit_callbacks):
    service, _, dispatcher = build()
    with django_capture_on_commit_callbacks(execute=True):
        service.create(
            data={"title": "x", "description": "", "due_date": None, "assignee": None},
            actor=make_user(Role.SUPERVISOR),
        )
    assert dispatcher.events == []


def test_update_of_title_only_notifies_nobody(django_capture_on_commit_callbacks):
    """Title and description edits are intentionally silent (spec §10.1)."""
    task = Task(title="Before", status=TaskStatus.PENDING, created_by=make_user(Role.SUPERVISOR))
    service, _, dispatcher = build([task])
    with django_capture_on_commit_callbacks(execute=True):
        service.update(task_id=task.pk, data={"title": "After"}, actor=make_user(Role.SUPERVISOR))
    assert dispatcher.events == []


def test_update_emits_one_event_per_meaningful_change(django_capture_on_commit_callbacks):
    operator = make_user(email="op@example.com")
    task = Task(title="t", status=TaskStatus.PENDING, created_by=make_user(Role.SUPERVISOR))
    service, _, dispatcher = build([task])
    with django_capture_on_commit_callbacks(execute=True):
        service.update(
            task_id=task.pk,
            data={"assignee": operator, "status": TaskStatus.IN_PROGRESS,
                  "due_date": timezone.now() + timedelta(days=1)},
            actor=make_user(Role.SUPERVISOR),
        )
    assert sorted(dispatcher.events) == [
        "task_assigned", "task_due_date_changed", "task_status_changed",
    ]


def test_patching_status_to_completed_is_refused():
    """D18: one audited path to COMPLETED."""
    task = Task(title="t", status=TaskStatus.PENDING, created_by=make_user(Role.SUPERVISOR))
    service, _, _ = build([task])
    with pytest.raises(CompletionRequiresCompleteAction):
        service.update(task_id=task.pk, data={"status": TaskStatus.COMPLETED},
                       actor=make_user(Role.SUPERVISOR))


@pytest.mark.parametrize("terminal", [TaskStatus.COMPLETED, TaskStatus.CANCELLED])
def test_no_transition_leaves_a_terminal_status(terminal):
    """D19."""
    task = Task(title="t", status=terminal, created_by=make_user(Role.SUPERVISOR),
                completed_at=timezone.now() if terminal == TaskStatus.COMPLETED else None)
    service, _, _ = build([task])
    with pytest.raises(InvalidStatusTransition):
        service.update(task_id=task.pk, data={"status": TaskStatus.PENDING},
                       actor=make_user(Role.SUPERVISOR))


def test_complete_sets_status_and_timestamp_together_and_locks_the_row(
    django_capture_on_commit_callbacks,
):
    task = Task(title="t", status=TaskStatus.IN_PROGRESS, created_by=make_user(Role.SUPERVISOR))
    service, repository, dispatcher = build([task])
    with django_capture_on_commit_callbacks(execute=True):
        completed = service.complete(task_id=task.pk, actor=make_user(Role.SUPERVISOR))
    assert completed.status == TaskStatus.COMPLETED
    assert completed.completed_at is not None
    assert repository.locked == [task.pk]
    assert dispatcher.events == ["task_status_changed"]


def test_completing_an_already_completed_task_conflicts():
    task = Task(title="t", status=TaskStatus.COMPLETED, completed_at=timezone.now(),
                created_by=make_user(Role.SUPERVISOR))
    service, _, _ = build([task])
    with pytest.raises(InvalidStatusTransition):
        service.complete(task_id=task.pk, actor=make_user(Role.SUPERVISOR))


def test_operating_on_a_vanished_task_is_a_404():
    import uuid

    service, _, _ = build()
    with pytest.raises(TaskNotFound):
        service.complete(task_id=uuid.uuid7(), actor=make_user(Role.SUPERVISOR))


def test_delete_soft_deletes_and_records_the_actor():
    actor = make_user(Role.SUPERVISOR)
    task = Task(title="t", status=TaskStatus.PENDING, created_by=actor)
    service, repository, _ = build([task])
    service.delete(task=task, actor=actor)
    assert repository.deleted == [task]
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_services.py -q
```

- [ ] **Step 3: Write `backend/apps/tasks/services.py`**

```python
# apps/tasks/services.py
"""Task use cases — the only path that mutates a Task.

Imports the TaskRepository and NotificationDispatcher Protocols, never a concrete
implementation of either; the view supplies both (spec §5.2.2). A test in
apps/core/tests asserts this module names no Django*Repository.
"""

import logging
from functools import partial
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.core.roles import Role
from apps.notifications.dispatchers import NotificationDispatcher
from apps.tasks.exceptions import (
    AssigneeNotAssignable,
    CompletionRequiresCompleteAction,
    InvalidStatusTransition,
    TaskNotFound,
)
from apps.tasks.models import OPEN_STATUSES, TRANSITIONS, Task, TaskStatus
from apps.tasks.repositories import TaskRepository  # the Protocol, and that is all
from apps.users.models import User

logger = logging.getLogger(__name__)

_MUTABLE_FIELDS = ("title", "description", "due_date", "assignee", "status")


class TaskService:
    def __init__(self, *, tasks: TaskRepository, notifications: NotificationDispatcher):
        self._tasks = tasks
        self._notifications = notifications

    # ---------- use cases ----------

    def create(self, *, data: dict, actor: User) -> Task:
        assignee = data.get("assignee")
        self._reject_admin_assignee(assignee)
        task = Task(
            title=data["title"],
            description=data.get("description", ""),
            due_date=data.get("due_date"),
            assignee=assignee,
            created_by=actor,
            status=TaskStatus.PENDING,
        )
        with transaction.atomic():
            self._tasks.add(task)
            if assignee is not None:
                self._enqueue("task_assigned", task, actor)
        logger.info("task.created id=%s by=%s assignee=%s", task.pk, actor.pk, task.assignee_id)
        return task

    def update(self, *, task_id: UUID, data: dict, actor: User) -> Task:
        with transaction.atomic():
            task = self._tasks.get_for_update(task_id)
            if task is None:
                raise TaskNotFound
            before = (task.assignee_id, task.status, task.due_date)

            if "status" in data and data["status"] != task.status:
                self._validate_transition(task.status, data["status"])
            if "assignee" in data:
                self._reject_admin_assignee(data["assignee"])

            for field in _MUTABLE_FIELDS:
                if field in data:
                    setattr(task, field, data[field])
            self._tasks.save(task)

            assignee_changed = task.assignee_id != before[0] and task.assignee_id is not None
            if assignee_changed:
                self._enqueue("task_assigned", task, actor)
            if task.status != before[1]:
                self._enqueue("task_status_changed", task, actor)
            if task.due_date != before[2]:
                self._enqueue("task_due_date_changed", task, actor)

        logger.info("task.updated id=%s fields=%s by=%s", task.pk, sorted(data), actor.pk)
        return task

    def complete(self, *, task_id: UUID, actor: User) -> Task:
        with transaction.atomic():
            task = self._tasks.get_for_update(task_id)
            if task is None:
                raise TaskNotFound
            if task.status not in OPEN_STATUSES:
                raise InvalidStatusTransition
            task.status = TaskStatus.COMPLETED
            task.completed_at = timezone.now()
            self._tasks.save(task)
            self._enqueue("task_status_changed", task, actor)
        logger.info("task.completed id=%s by=%s", task.pk, actor.pk)
        return task

    def delete(self, *, task: Task, actor: User) -> None:
        with transaction.atomic():
            self._tasks.soft_delete(task, by=actor)
        logger.info("task.soft_deleted id=%s by=%s", task.pk, actor.pk)

    # ---------- rules ----------

    @staticmethod
    def _validate_transition(current: str, requested: str) -> None:
        if requested == TaskStatus.COMPLETED:
            raise CompletionRequiresCompleteAction
        if requested not in TRANSITIONS[current]:
            raise InvalidStatusTransition

    @staticmethod
    def _reject_admin_assignee(assignee: User | None) -> None:
        """D17, re-checked here as well as in the serializer. Not expressible as a
        CheckConstraint — it is a cross-table assertion."""
        if assignee is not None and assignee.role == Role.ADMIN:
            raise AssigneeNotAssignable

    # ---------- enqueue ----------

    def _enqueue(self, method_name: str, task: Task, actor: User) -> None:
        """Always through transaction.on_commit.

        Calling .delay() inside atomic() can deliver the message to a worker
        BEFORE the transaction commits, so the worker reads a row that does not
        yet exist, or a pre-update version (spec §10.3a). Services enqueue; views
        never do.
        """
        history_id = self._latest_history_id(task)
        send = getattr(self._notifications, method_name)
        # functools.partial, not a lambda: a lambda in a loop captures by
        # reference and every callback would fire with the last iteration's values.
        transaction.on_commit(
            partial(send, task_id=task.pk, history_id=history_id, actor_id=actor.pk)
        )

    @staticmethod
    def _latest_history_id(task: Task) -> int | None:
        """The simple-history record id for the change just written, which ties
        each email to the exact audited change that caused it (spec §10.3b).

        Returns None when there is no history row — which only happens with a
        fake repository in a unit test, never against the ORM.
        """
        record = task.history.first() if task.pk and hasattr(task, "history") else None
        return record.history_id if record is not None else None
```

- [ ] **Step 4: Run the tests**

```bash
uv run --directory backend pytest apps/tasks/tests/test_services.py -q
```

Expected: 13 passed. If the five event assertions fail with an empty `dispatcher.events`, the `django_capture_on_commit_callbacks(execute=True)` wrapper is missing — see Step 1, note 2.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tasks/services.py backend/apps/tasks/tests/test_services.py
git commit -m "feat: add TaskService as the single write path with on_commit enqueue"
```

**DoD:** B6, B7, B10, B11, B12.

---

### Task 26: Task serializers

**Files:**
- Create: `backend/apps/tasks/serializers.py`
- Create: `backend/apps/tasks/tests/test_serializers.py`

- [ ] **Step 1: Write the failing tests**

The assignee-error collision test is the important one: spec §8.7 requires the two codes to stay distinct.

```python
# apps/tasks/tests/test_serializers.py
import pytest
from rest_framework.test import APIRequestFactory

from apps.tasks.exceptions import AssigneeImmutableForRole, AssigneeNotAssignable
from apps.tasks.models import TaskStatus
from apps.tasks.serializers import (
    TaskCreateSerializer,
    TaskDetailSerializer,
    TaskListSerializer,
    TaskUpdateSerializer,
)
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db


def context_for(user):
    request = APIRequestFactory().post("/api/v1/tasks/")
    request.user = user
    return {"request": request}


def test_list_serializer_renders_exactly_the_contracted_fields():
    rendered = TaskListSerializer(TaskFactory()).data
    assert set(rendered) == {
        "id", "title", "status", "due_date", "assignee", "is_overdue", "created_at",
    }
    assert "created_by" not in rendered, "joining it would fetch a column nobody reads"


def test_detail_serializer_adds_the_detail_only_fields():
    rendered = TaskDetailSerializer(TaskFactory()).data
    assert set(rendered) == {
        "id", "title", "status", "due_date", "assignee", "is_overdue", "created_at",
        "description", "created_by", "completed_at", "updated_at",
    }


def test_nested_assignee_uses_the_minimal_shape():
    rendered = TaskListSerializer(TaskFactory()).data
    assert set(rendered["assignee"]) == {"id", "email", "first_name", "last_name", "role"}


def test_write_serializers_are_not_model_serializers():
    """D9 made structural (spec §3.2)."""
    from rest_framework import serializers

    assert not isinstance(TaskCreateSerializer(), serializers.ModelSerializer)
    assert not isinstance(TaskUpdateSerializer(), serializers.ModelSerializer)


def test_create_serializer_accepts_no_status_field():
    """A new task is always PENDING, so the frontend must not render a status
    select on create (spec §11.5)."""
    assert "status" not in TaskCreateSerializer().fields


def test_operator_create_defaults_assignee_to_self():
    """D16, default half."""
    operator = OperatorFactory()
    serializer = TaskCreateSerializer(data={"title": "Mine"}, context=context_for(operator))
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["assignee"] == operator


def test_operator_create_with_another_assignee_is_refused():
    """D16, explicit-mismatch half: silently coercing a value the client sent
    would hide a client bug."""
    serializer = TaskCreateSerializer(
        data={"title": "Theirs", "assignee": str(OperatorFactory().pk)},
        context=context_for(OperatorFactory()),
    )
    with pytest.raises(AssigneeImmutableForRole):
        serializer.is_valid(raise_exception=True)


def test_operator_update_cannot_touch_assignee_even_to_themselves():
    """D15 / spec §8.7: `assignee_immutable` covers ANY assignee on update, so
    there is no self-assignment escape — the actor here supplies their own id."""
    operator = OperatorFactory()
    serializer = TaskUpdateSerializer(
        data={"assignee": str(operator.pk)}, partial=True, context=context_for(operator)
    )
    with pytest.raises(AssigneeImmutableForRole):
        serializer.is_valid(raise_exception=True)


def test_operator_update_of_other_fields_is_unaffected():
    operator = OperatorFactory()
    serializer = TaskUpdateSerializer(
        data={"title": "Renamed", "status": TaskStatus.IN_PROGRESS},
        partial=True,
        context=context_for(operator),
    )
    assert serializer.is_valid(), serializer.errors


def test_supervisor_assigning_to_an_admin_is_refused_with_the_other_code():
    """The two assignee errors must not collide (spec §8.7)."""
    serializer = TaskCreateSerializer(
        data={"title": "x", "assignee": str(AdminFactory().pk)},
        context=context_for(SupervisorFactory()),
    )
    with pytest.raises(AssigneeNotAssignable):
        serializer.is_valid(raise_exception=True)


def test_supervisor_may_set_a_valid_assignee_and_status():
    operator = OperatorFactory()
    serializer = TaskUpdateSerializer(
        data={"assignee": str(operator.pk), "status": TaskStatus.IN_PROGRESS},
        partial=True,
        context=context_for(SupervisorFactory()),
    )
    assert serializer.is_valid(), serializer.errors


def test_an_unknown_assignee_id_is_a_field_validation_error():
    import uuid

    serializer = TaskCreateSerializer(
        data={"title": "x", "assignee": str(uuid.uuid7())},
        context=context_for(SupervisorFactory()),
    )
    assert not serializer.is_valid()
    assert "assignee" in serializer.errors


def test_title_is_required_and_bounded():
    serializer = TaskCreateSerializer(data={"title": ""}, context=context_for(SupervisorFactory()))
    assert not serializer.is_valid()
    assert "title" in serializer.errors
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_serializers.py -q
```

- [ ] **Step 3: Write `backend/apps/tasks/serializers.py`**

```python
# apps/tasks/serializers.py
"""Task input and output contracts (spec §8.2).

Write serializers are plain Serializer subclasses (D9) and apply D15/D16/D17 in
validate(), receiving the request user through serializer context. None of them
implements create() or update(); the view hands validated_data to the service.
"""

from typing import Any

from rest_framework import serializers

from apps.core.roles import Role
from apps.tasks.exceptions import AssigneeImmutableForRole, AssigneeNotAssignable
from apps.tasks.models import Task, TaskStatus
from apps.users.models import User
from apps.users.serializers import UserMinimalSerializer


class TaskListSerializer(serializers.ModelSerializer):
    assignee = UserMinimalSerializer(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = ["id", "title", "status", "due_date", "assignee", "is_overdue", "created_at"]


class TaskDetailSerializer(serializers.ModelSerializer):
    assignee = UserMinimalSerializer(read_only=True)
    created_by = UserMinimalSerializer(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "status", "due_date",
            "assignee", "created_by", "is_overdue",
            "completed_at", "created_at", "updated_at",
        ]


class _AssigneeRules:
    """D15/D16/D17, shared by the two write serializers so the rules live once."""

    # Declared for mypy: the mixin reads the serializer's context but has no
    # base class of its own, so without this it reports "has no attribute".
    context: dict[str, Any]

    def _apply_assignee_rules(self, attrs: dict, *, is_create: bool) -> dict:
        actor = self.context["request"].user
        supplied = "assignee" in attrs
        assignee = attrs.get("assignee")

        if actor.role == Role.OPERATOR:
            if is_create:
                if not supplied:
                    attrs["assignee"] = actor         # D16, default half
                elif assignee is None or assignee.pk != actor.pk:
                    raise AssigneeImmutableForRole    # D16, explicit-mismatch half
            elif supplied:
                # D15: an Operator cannot change the assignee at all on update —
                # not even to themselves. Spec §8.7 defines assignee_immutable as
                # "any assignee on update", so there is no self-assignment escape.
                raise AssigneeImmutableForRole

        final = attrs.get("assignee")
        if final is not None and final.role == Role.ADMIN:
            raise AssigneeNotAssignable              # D17
        return attrs


def _assignee_field() -> serializers.PrimaryKeyRelatedField:
    """Resolved against ALL live users, not assignable_users(), deliberately: a
    narrowed queryset would report an Admin assignee as "does not exist" instead
    of the specific assignee_not_assignable code the frontend branches on."""
    return serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )


class TaskCreateSerializer(_AssigneeRules, serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    due_date = serializers.DateTimeField(required=False, allow_null=True, default=None)
    assignee = _assignee_field()
    # No `status` field: a new task is always PENDING.

    def validate(self, attrs):
        return self._apply_assignee_rules(attrs, is_create=True)


class TaskUpdateSerializer(_AssigneeRules, serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    due_date = serializers.DateTimeField(required=False, allow_null=True)
    assignee = _assignee_field()
    status = serializers.ChoiceField(choices=TaskStatus.choices, required=False)

    def validate(self, attrs):
        return self._apply_assignee_rules(attrs, is_create=False)
```

**Why the assignee errors propagate rather than becoming field errors.** They are `ApplicationError` (an `APIException`), not `ValidationError`, so `is_valid(raise_exception=True)` does not catch them — they travel to the shared handler and produce a **top-level** `code`, which is what spec §8.7 specifies. A `ValidationError` would bury the code inside `errors` where the frontend would have to parse `detail` to tell the two rules apart.

- [ ] **Step 4: Run the tests**

```bash
uv run --directory backend pytest apps/tasks/tests/test_serializers.py -q
```

Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tasks/serializers.py backend/apps/tasks/tests/test_serializers.py
git commit -m "feat: add task serializers enforcing the assignee rules"
```

**DoD:** B3, B10, B11.

---

### Task 27: `TaskFilterSet`

**Files:**
- Create: `backend/apps/tasks/filters.py`
- Create: `backend/apps/tasks/tests/test_filters.py`

Spec §8.4. The `overdue` filter is a deliberate addition beyond the brief: the dashboard surfaces an overdue count, and that count must be clickable through to the matching list.

- [ ] **Step 1: Write the failing tests**

The partition test is the one that matters — a bare negation silently drops every undated task.

```python
# apps/tasks/tests/test_filters.py
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tasks.filters import TaskFilterSet
from apps.tasks.models import Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def filtered(params):
    return TaskFilterSet(params, queryset=Task.objects.all()).qs


@pytest.fixture
def spread():
    now = timezone.now()
    return {
        "past_open": TaskFactory(due_date=now - timedelta(days=2), status=TaskStatus.PENDING),
        "soon": TaskFactory(due_date=now + timedelta(days=3), status=TaskStatus.IN_PROGRESS),
        "far": TaskFactory(due_date=now + timedelta(days=90), status=TaskStatus.PENDING),
        "undated": TaskFactory(due_date=None, status=TaskStatus.PENDING),
        "past_done": TaskFactory(
            due_date=now - timedelta(days=5), status=TaskStatus.COMPLETED, completed_at=now
        ),
        "past_cancelled": TaskFactory(
            due_date=now - timedelta(days=5), status=TaskStatus.CANCELLED
        ),
    }


def test_status_accepts_multiple_values(spread):
    result = filtered({"status": [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]})
    assert set(result) == {spread["past_open"], spread["soon"], spread["far"], spread["undated"]}


def test_due_date_range_filters(spread):
    now = timezone.now()
    after = filtered({"due_date_after": (now + timedelta(days=1)).isoformat()})
    assert set(after) == {spread["soon"], spread["far"]}
    before = filtered({"due_date_before": now.isoformat()})
    assert set(before) == {spread["past_open"], spread["past_done"], spread["past_cancelled"]}
    assert spread["undated"] not in before, "due_date__lte excludes nulls automatically"


def test_overdue_true_finds_only_open_past_due_tasks(spread):
    assert set(filtered({"overdue": "true"})) == {spread["past_open"]}


def test_overdue_false_includes_undated_and_terminal_tasks(spread):
    """The direct test of the NULL branch. In SQL, NOT (due_date < now) is NULL,
    not TRUE, for an undated row — so a bare negation drops it silently."""
    result = set(filtered({"overdue": "false"}))
    assert spread["undated"] in result
    assert spread["past_done"] in result
    assert spread["past_cancelled"] in result
    assert spread["past_open"] not in result


def test_overdue_true_and_false_partition_the_queryset_exactly(spread):
    everything = set(Task.objects.all())
    yes, no = set(filtered({"overdue": "true"})), set(filtered({"overdue": "false"}))
    assert yes | no == everything
    assert yes & no == set()


def test_assignee_filter(spread):
    target = spread["soon"]
    assert set(filtered({"assignee": str(target.assignee_id)})) == {target}


def test_filters_combine(spread):
    now = timezone.now()
    result = filtered({
        "status": [TaskStatus.PENDING, TaskStatus.IN_PROGRESS],
        "due_date_after": now.isoformat(),
        "due_date_before": (now + timedelta(days=7)).isoformat(),
    })
    assert set(result) == {spread["soon"]}, "the due-soon tile's exact predicate"
```

The last test is deliberately the dashboard's due-soon drill-through predicate from spec §11.5 — if these parameters ever stop composing to the same set `due_next_7_days` counts, the tile and its list would visibly disagree.

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_filters.py -q
```

- [ ] **Step 3: Write `backend/apps/tasks/filters.py`**

```python
# apps/tasks/filters.py
"""Task query parameters. django-filter only — no manual parsing, and no model
field becomes filterable implicitly (backend §16)."""

from django.db.models import Q
from django.utils import timezone
from django_filters import rest_framework as filters

from apps.tasks.models import OPEN_STATUSES, TERMINAL_STATUSES, Task, TaskStatus


class TaskFilterSet(filters.FilterSet):
    status = filters.MultipleChoiceFilter(
        field_name="status", choices=TaskStatus.choices
    )
    due_date_after = filters.IsoDateTimeFilter(field_name="due_date", lookup_expr="gte")
    due_date_before = filters.IsoDateTimeFilter(field_name="due_date", lookup_expr="lte")
    overdue = filters.BooleanFilter(method="filter_overdue")
    # Useful to a Supervisor; harmless for an Operator, whose queryset is already
    # self-scoped by scoped_tasks().
    assignee = filters.UUIDFilter(field_name="assignee_id")

    class Meta:
        model = Task
        fields = ["status", "due_date_after", "due_date_before", "overdue", "assignee"]

    def filter_overdue(self, queryset, name, value):
        now = timezone.now()
        if value:
            return queryset.filter(Q(due_date__lt=now) & Q(status__in=OPEN_STATUSES))
        # The false branch MUST be expressed positively. `NOT (due_date < now AND
        # status IN (...))` evaluates to NULL — not TRUE — for a row with
        # due_date IS NULL, so .exclude() would silently drop every undated task.
        # Both of these count as not overdue: no deadline, or already terminal.
        return queryset.filter(
            Q(due_date__isnull=True)
            | Q(due_date__gte=now)
            | Q(status__in=TERMINAL_STATUSES)
        )
```

- [ ] **Step 4: Run the tests**

```bash
uv run --directory backend pytest apps/tasks/tests/test_filters.py -q
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tasks/filters.py backend/apps/tasks/tests/test_filters.py
git commit -m "feat: add task filters with a correct overdue=false NULL branch"
```

**DoD:** B10.

---

### Task 28: `TaskViewSet`, `complete/`, `stats/`, and the query-count guards

**Files:**
- Create: `backend/apps/tasks/views.py`, `urls.py`
- Create: `backend/apps/tasks/tests/test_api_tasks.py`, `test_api_complete.py`, `test_api_stats.py`, `test_query_counts.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Write the failing API tests**

```python
# apps/tasks/tests/test_api_tasks.py
import pytest

from apps.tasks.models import Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/tasks/"


def test_unauthenticated_is_401(api_client):
    assert api_client.get(URL).status_code == 401


def test_operator_list_shows_only_their_assigned_tasks(operator_client, operator):
    mine = TaskFactory(assignee=operator)
    TaskFactory()
    response = operator_client.get(URL)
    assert response.status_code == 200
    assert [row["id"] for row in response.data["results"]] == [str(mine.pk)]


def test_an_operator_who_created_but_no_longer_holds_a_task_gets_404(operator_client, operator):
    """The direct test of D14."""
    orphaned = TaskFactory(created_by=operator, assignee=OperatorFactory())
    assert operator_client.get(f"{URL}{orphaned.pk}/").status_code == 404


def test_supervisor_sees_every_task(supervisor_client):
    TaskFactory.create_batch(3)
    assert supervisor_client.get(URL).data["count"] == 3


def test_supervisor_creates_a_task_for_anyone(supervisor_client, supervisor):
    assignee = OperatorFactory()
    response = supervisor_client.post(
        URL, {"title": "Assigned work", "assignee": str(assignee.pk)}, format="json"
    )
    assert response.status_code == 201
    assert response.data["assignee"]["id"] == str(assignee.pk)
    assert response.data["created_by"]["id"] == str(supervisor.pk)
    assert response.data["status"] == TaskStatus.PENDING


def test_operator_create_without_assignee_self_assigns(operator_client, operator):
    response = operator_client.post(URL, {"title": "Mine"}, format="json")
    assert response.status_code == 201
    assert response.data["assignee"]["id"] == str(operator.pk)


def test_operator_create_for_someone_else_is_400_assignee_immutable(operator_client):
    response = operator_client.post(
        URL, {"title": "Theirs", "assignee": str(OperatorFactory().pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "assignee_immutable"


def test_operator_update_of_assignee_is_400_assignee_immutable(operator_client, operator):
    task = TaskFactory(assignee=operator)
    response = operator_client.patch(
        f"{URL}{task.pk}/", {"assignee": str(OperatorFactory().pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "assignee_immutable"


def test_supervisor_assigning_to_an_admin_is_400_assignee_not_assignable(supervisor_client):
    from apps.users.tests.factories import AdminFactory

    response = supervisor_client.post(
        URL, {"title": "x", "assignee": str(AdminFactory().pk)}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "assignee_not_assignable"


def test_operator_updates_their_own_task(operator_client, operator):
    task = TaskFactory(assignee=operator, status=TaskStatus.PENDING)
    response = operator_client.patch(
        f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json"
    )
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.status == TaskStatus.IN_PROGRESS


def test_patching_status_to_completed_is_400_use_complete_action(supervisor_client):
    task = TaskFactory(status=TaskStatus.PENDING)
    response = supervisor_client.patch(
        f"{URL}{task.pk}/", {"status": TaskStatus.COMPLETED}, format="json"
    )
    assert response.status_code == 400
    assert response.data["code"] == "use_complete_action"


def test_leaving_a_terminal_status_is_409(supervisor_client):
    task = TaskFactory(status=TaskStatus.CANCELLED)
    response = supervisor_client.patch(
        f"{URL}{task.pk}/", {"status": TaskStatus.PENDING}, format="json"
    )
    assert response.status_code == 409
    assert response.data["code"] == "invalid_status_transition"


def test_supervisor_delete_is_a_soft_delete(supervisor_client, supervisor):
    task = TaskFactory()
    assert supervisor_client.delete(f"{URL}{task.pk}/").status_code == 204
    assert not Task.objects.filter(pk=task.pk).exists()
    assert Task.all_objects.get(pk=task.pk).deleted_by == supervisor


def test_a_soft_deleted_task_is_absent_from_list_and_detail(supervisor_client):
    task = TaskFactory()
    task.soft_delete()
    assert supervisor_client.get(URL).data["count"] == 0
    assert supervisor_client.get(f"{URL}{task.pk}/").status_code == 404


def test_a_malformed_id_returns_404_without_a_database_lookup(supervisor_client):
    assert supervisor_client.get(f"{URL}not-a-uuid/").status_code == 404


def test_pagination_is_stable_when_ordering_by_a_non_unique_field(supervisor_client):
    from datetime import timedelta
    from django.utils import timezone

    same_due = timezone.now() + timedelta(days=5)
    TaskFactory.create_batch(10, due_date=same_due)
    page1 = supervisor_client.get(f"{URL}?ordering=due_date&page_size=5").data["results"]
    page2 = supervisor_client.get(f"{URL}?ordering=due_date&page_size=5&page=2").data["results"]
    ids = [row["id"] for row in page1 + page2]
    assert len(set(ids)) == 10, "a non-unique sort key must still be tiebroken by -id"
```

```python
# apps/tasks/tests/test_api_complete.py
import pytest

from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def url(task):
    return f"/api/v1/tasks/{task.pk}/complete/"


def test_complete_sets_status_and_timestamp_together(supervisor_client):
    task = TaskFactory(status=TaskStatus.IN_PROGRESS)
    response = supervisor_client.post(url(task), {}, format="json")
    assert response.status_code == 200
    task.refresh_from_db()
    assert task.status == TaskStatus.COMPLETED
    assert task.completed_at is not None


def test_completing_an_already_completed_task_is_409(supervisor_client):
    from django.utils import timezone

    task = TaskFactory(status=TaskStatus.COMPLETED, completed_at=timezone.now())
    response = supervisor_client.post(url(task), {}, format="json")
    assert response.status_code == 409
    assert response.data["code"] == "invalid_status_transition"


def test_an_operator_can_complete_their_assigned_task(operator_client, operator):
    task = TaskFactory(assignee=operator, status=TaskStatus.PENDING)
    assert supervisor_or_operator_ok(operator_client.post(url(task), {}, format="json"))


def supervisor_or_operator_ok(response):
    assert response.status_code == 200
    return True


def test_an_operator_cannot_complete_someone_elses_task(operator_client):
    task = TaskFactory(status=TaskStatus.PENDING)
    assert operator_client.post(url(task), {}, format="json").status_code == 404
```

```python
# apps/tasks/tests/test_api_stats.py
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/tasks/stats/"


def test_stats_shape(supervisor_client):
    response = supervisor_client.get(URL)
    assert response.status_code == 200
    assert set(response.data) == {"total", "by_status", "overdue", "due_next_7_days"}
    assert set(response.data["by_status"]) == {
        "PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED",
    }


def test_stats_are_scoped_the_same_way_as_the_list(operator_client, operator):
    TaskFactory(assignee=operator)
    TaskFactory()
    assert operator_client.get(URL).data["total"] == 1


def test_stats_counts_match_the_data(supervisor_client):
    now = timezone.now()
    TaskFactory(status=TaskStatus.PENDING, due_date=now - timedelta(days=1))
    TaskFactory(status=TaskStatus.IN_PROGRESS, due_date=now + timedelta(days=2))
    data = supervisor_client.get(URL).data
    assert data["total"] == 2
    assert data["overdue"] == 1
    assert data["due_next_7_days"] == 1


def test_stats_excludes_soft_deleted_tasks(supervisor_client):
    task = TaskFactory()
    task.soft_delete()
    assert supervisor_client.get(URL).data["total"] == 0
```

```python
# apps/tasks/tests/test_query_counts.py
"""An N+1 introduced later fails CI instead of being discovered in production."""

import pytest

from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_task_list_query_count_is_flat(supervisor_client, django_assert_num_queries):
    TaskFactory.create_batch(10)
    with django_assert_num_queries(2):   # 1 count + 1 page with select_related
        supervisor_client.get("/api/v1/tasks/")


def test_task_detail_joins_both_user_fields(supervisor_client, django_assert_num_queries):
    task = TaskFactory()
    with django_assert_num_queries(1):
        supervisor_client.get(f"/api/v1/tasks/{task.pk}/")


def test_stats_is_exactly_one_aggregate_query(supervisor_client, django_assert_num_queries):
    TaskFactory.create_batch(10)
    with django_assert_num_queries(1):
        supervisor_client.get("/api/v1/tasks/stats/")


def test_user_list_query_count_is_flat(admin_client, django_assert_num_queries):
    UserFactory.create_batch(10)
    with django_assert_num_queries(2):
        admin_client.get("/api/v1/users/")
```

If a count differs by one in practice, adjust the expected number **and write down why** in a comment — the value of these tests is that the number is deliberate, not that it is 2.

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_api_tasks.py -q
```

- [ ] **Step 3: Write `backend/apps/tasks/views.py`**

```python
# apps/tasks/views.py
"""Task HTTP surface. The composition root for TaskService lives here."""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.constants import UUID_LOOKUP_REGEX
from apps.core.ordering import TiebrokenOrderingFilter
from apps.core.permissions.classes import RolePermission
from apps.core.permissions.matrix import Resource
from apps.notifications.dispatchers import NullNotificationDispatcher
from apps.tasks.filters import TaskFilterSet
from apps.tasks.repositories import DjangoTaskRepository
from apps.tasks.selectors import scoped_tasks, task_stats
from apps.tasks.serializers import (
    TaskCreateSerializer,
    TaskDetailSerializer,
    TaskListSerializer,
    TaskUpdateSerializer,
)
from apps.tasks.services import TaskService


class TaskViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_resource = Resource.TASK
    permission_classes = [RolePermission]
    lookup_value_regex = UUID_LOOKUP_REGEX
    filter_backends = [DjangoFilterBackend, TiebrokenOrderingFilter]
    filterset_class = TaskFilterSet
    ordering_fields = ["due_date", "created_at", "status"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        # scoped_tasks owns the authorization rules; eager loading follows the
        # SERIALIZER in use, so it is chained here per action (spec §8.6).
        queryset = scoped_tasks(self.request.user)
        if self.action == "list":
            # assignee only: TaskListSerializer does not render created_by, so
            # joining it would fetch a column nobody reads.
            return queryset.select_related("assignee")
        return queryset.select_related("assignee", "created_by")

    def get_serializer_class(self):
        return {
            "list": TaskListSerializer,
            "create": TaskCreateSerializer,
            "partial_update": TaskUpdateSerializer,
        }.get(self.action, TaskDetailSerializer)

    def get_service(self) -> TaskService:
        """The composition root: the only place concrete infrastructure is named."""
        return TaskService(
            tasks=DjangoTaskRepository(),
            notifications=NullNotificationDispatcher(),  # replaced in Task 37
        )

    def create(self, request, *args, **kwargs):
        serializer = TaskCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = self.get_service().create(data=serializer.validated_data, actor=request.user)
        return Response(TaskDetailSerializer(task).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        task = self.get_object()
        serializer = TaskUpdateSerializer(
            data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        updated = self.get_service().update(
            task_id=task.pk, data=serializer.validated_data, actor=request.user
        )
        return Response(TaskDetailSerializer(updated).data)

    def destroy(self, request, *args, **kwargs):
        # get_object() runs queryset scoping (404) AND object permissions (403).
        task = self.get_object()
        self.get_service().delete(task=task, actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, *args, **kwargs):
        """The ONLY path to COMPLETED (D18), which is what guarantees
        completed_at is always set alongside the status."""
        task = self.get_object()
        completed = self.get_service().complete(task_id=task.pk, actor=request.user)
        return Response(TaskDetailSerializer(completed).data)

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request, *args, **kwargs):
        return Response(task_stats(request.user))
```

`stats` is `detail=False`, so DRF's router registers it **before** the detail route and `/tasks/stats/` cannot be captured as an id. `lookup_value_regex` would reject `stats` anyway; the route order means the guarantee does not depend on that.

- [ ] **Step 4: Wire the URLs**

```python
# apps/tasks/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.tasks.views import TaskViewSet

router = DefaultRouter()
router.register("tasks", TaskViewSet, basename="task")

urlpatterns = [path("", include(router.urls))]
```

In `config/urls.py`, add `path("api/v1/", include("apps.tasks.urls"))`.

- [ ] **Step 5: Run every task test**

```bash
uv run --directory backend pytest apps/tasks -q
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tasks/views.py backend/apps/tasks/urls.py backend/config/urls.py backend/apps/tasks/tests
git commit -m "feat: add task endpoints with complete and stats actions"
```

**DoD:** B3, B4, B5, B6, B9, B10, B11.

---

### Task 29: Concurrency — two simultaneous completions

**Files:**
- Create: `backend/apps/tasks/tests/test_concurrency.py`

`backend §42`: do not assume sequential unit tests prove concurrency safety.

- [ ] **Step 1: Write the test**

```python
# apps/tasks/tests/test_concurrency.py
"""Exposes the race `select_for_update()` in TaskRepository.get_for_update exists
to close. Needs transaction=True: the default test transaction would hide the
very commit boundary under test."""

import threading

import pytest
from django.db import connection

from apps.notifications.dispatchers import NullNotificationDispatcher
from apps.tasks.models import Task, TaskStatus
from apps.tasks.repositories import DjangoTaskRepository
from apps.tasks.services import TaskService
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import SupervisorFactory


@pytest.mark.django_db(transaction=True)
def test_two_concurrent_completions_produce_exactly_one_transition():
    task = TaskFactory(status=TaskStatus.IN_PROGRESS)
    actor = SupervisorFactory()
    outcomes: list[str] = []
    barrier = threading.Barrier(2)

    def complete():
        barrier.wait()
        service = TaskService(
            tasks=DjangoTaskRepository(), notifications=NullNotificationDispatcher()
        )
        try:
            service.complete(task_id=task.pk, actor=actor)
            outcomes.append("completed")
        except Exception as exc:
            outcomes.append(type(exc).__name__)
        finally:
            connection.close()

    threads = [threading.Thread(target=complete) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert outcomes.count("completed") == 1, outcomes
    assert "InvalidStatusTransition" in outcomes

    task.refresh_from_db()
    assert task.status == TaskStatus.COMPLETED
    assert Task.history.filter(id=task.pk, status=TaskStatus.COMPLETED).count() == 1
```

Three details that make this test real rather than theatrical: `transaction=True` so each thread gets a genuine transaction, the `Barrier` so both threads reach `get_for_update` together, and `connection.close()` in each thread so Django does not leak a connection per thread.

- [ ] **Step 2: Run it**

```bash
uv run --directory backend pytest apps/tasks/tests/test_concurrency.py -q
```

Expected: 1 passed. **Verify it can fail:** temporarily change `get_for_update` to `Task.objects.filter(...).first()` (no lock) and confirm the test goes red. A concurrency test that cannot fail proves nothing. Restore the lock afterwards.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/tasks/tests/test_concurrency.py
git commit -m "test: prove select_for_update serialises concurrent completions"
```

**DoD:** B7, B10.

---

## Phase 6 — Permission enforcement

Spec §15 phase 6. The matrix already exists as data (Task 11) and both viewsets already use `RolePermission`; this phase adds the **object-level** rule and the suite that proves every cell of spec §7.1.

### Task 30: `IsTaskCreator` — D27

**Files:**
- Modify: `backend/apps/core/permissions/classes.py`, `backend/apps/tasks/views.py`
- Create: `backend/apps/tasks/tests/test_api_delete_rules.py`

Four cases, because this closed an accepted risk and must not silently regress.

- [ ] **Step 1: Write the failing tests**

```python
# apps/tasks/tests/test_api_delete_rules.py
"""D27: an Operator's delete is narrower than their read."""

import pytest

from apps.tasks.models import Task, TaskStatus
from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def url(task):
    return f"/api/v1/tasks/{task.pk}/"


def test_operator_deletes_a_task_they_created_and_hold(operator_client, operator):
    task = TaskFactory(created_by=operator, assignee=operator)
    assert operator_client.delete(url(task)).status_code == 204
    assert not Task.objects.filter(pk=task.pk).exists()
    assert Task.all_objects.get(pk=task.pk).deleted_at is not None


def test_operator_cannot_delete_a_supervisor_created_task_assigned_to_them(
    operator_client, operator, supervisor
):
    task = TaskFactory(created_by=supervisor, assignee=operator)
    response = operator_client.delete(url(task))
    assert response.status_code == 403
    assert response.data["code"] == "delete_requires_creator"
    assert Task.objects.filter(pk=task.pk).exists(), "the row must survive"


def test_that_operator_retains_every_other_operation_on_it(
    operator_client, operator, supervisor
):
    """Delete is narrower than read — not a general loss of access."""
    task = TaskFactory(created_by=supervisor, assignee=operator, status=TaskStatus.PENDING)
    assert operator_client.get(url(task)).status_code == 200
    assert operator_client.patch(url(task), {"title": "Renamed"}, format="json").status_code == 200
    assert operator_client.post(f"{url(task)}complete/", {}, format="json").status_code == 200


def test_a_supervisor_can_delete_a_task_they_did_not_create(
    supervisor_client, operator
):
    task = TaskFactory(created_by=operator, assignee=operator)
    assert supervisor_client.delete(url(task)).status_code == 204


def test_the_refusal_is_403_not_404_because_the_row_is_already_visible(
    operator_client, operator, supervisor
):
    """Spec §7.2 rule 7: rule 5 withholds existence, and here nothing is withheld
    — the task is already in the Operator's queryset."""
    task = TaskFactory(created_by=supervisor, assignee=operator)
    assert operator_client.get(url(task)).status_code == 200
    assert operator_client.delete(url(task)).status_code == 403
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/tasks/tests/test_api_delete_rules.py -q
```

Expected: the 403 tests fail with 204 — the rule is not enforced yet.

- [ ] **Step 3: Add `IsTaskCreator` to `apps/core/permissions/classes.py`**

```python
from rest_framework.exceptions import PermissionDenied

from apps.core.roles import Role


class IsTaskCreator(BasePermission):
    """D27: an Operator may delete a task only if they created it as well as
    holding it. Without this an Operator could soft-delete Supervisor-assigned
    work — and D20 provides no restore endpoint, so it would be irrecoverable
    through the API.

    Scoping alone cannot express this, because the row must stay VISIBLE while
    becoming UNDELETABLE — which is precisely what object permissions are for.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        if request.user.role != Role.OPERATOR:
            return True
        if obj.created_by_id == request.user.pk:
            return True
        # RAISED, not returned: returning False yields DRF's generic
        # permission_denied code, and spec §8.7 specifies this one.
        raise PermissionDenied(
            detail="Only the creator of a task may delete it.",
            code="delete_requires_creator",
        )
```

- [ ] **Step 4: Apply it to the destroy action only**

In `TaskViewSet`:

```python
    def get_permissions(self):
        if self.action == "destroy":
            return [RolePermission(), IsTaskCreator()]
        return [RolePermission()]
```

Scoped to `destroy` deliberately: Step 1's third test asserts that read, update and complete are **unaffected**.

- [ ] **Step 5: Run the tests**

```bash
uv run --directory backend pytest apps/tasks/tests/test_api_delete_rules.py -q
```

Expected: 5 passed.

- [ ] **Step 6: Append to README and commit**

Record D27 and the 403-vs-404 reasoning of spec §7.2 rule 7 under **Key implementation decisions**.

```bash
git add backend/apps/core/permissions/classes.py backend/apps/tasks/views.py backend/apps/tasks/tests/test_api_delete_rules.py README.md
git commit -m "feat: restrict operator task deletion to tasks they created"
```

**DoD:** B4, B10, B11.

---

### Task 31: Admin has no task surface

**Files:**
- Create: `backend/apps/tasks/tests/test_api_admin_exclusion.py`

D13's most unusual consequence, tested on its own so a regression names itself.

- [ ] **Step 1: Write the tests**

```python
# apps/tasks/tests/test_api_admin_exclusion.py
"""D13: an Admin manages who exists in the system and what they may do, WITHOUT
being able to read or alter the work itself. Account administration and
operational data stay separated."""

import pytest

from apps.tasks.tests.factories import TaskFactory

pytestmark = pytest.mark.django_db


def test_admin_is_403_on_every_task_route(admin_client):
    task = TaskFactory()
    base = "/api/v1/tasks/"
    assert admin_client.get(base).status_code == 403
    assert admin_client.post(base, {"title": "x"}, format="json").status_code == 403
    assert admin_client.get(f"{base}{task.pk}/").status_code == 403
    assert admin_client.patch(f"{base}{task.pk}/", {"title": "x"}, format="json").status_code == 403
    assert admin_client.delete(f"{base}{task.pk}/").status_code == 403
    assert admin_client.post(f"{base}{task.pk}/complete/", {}, format="json").status_code == 403
    # Including stats: an Admin therefore has no dashboard at all.
    assert admin_client.get(f"{base}stats/").status_code == 403


def test_admin_gets_403_not_404_on_a_task_detail(admin_client):
    """Spec §7.2 rule 6: the role has no business with this resource TYPE, so the
    answer is 403. An Operator reaching another Operator's task gets 404, because
    the type is theirs but that instance is not."""
    assert admin_client.get(f"/api/v1/tasks/{TaskFactory().pk}/").status_code == 403
```

- [ ] **Step 2: Run them**

```bash
uv run --directory backend pytest apps/tasks/tests/test_api_admin_exclusion.py -q
```

Expected: 2 passed with no production change — `RolePermission` plus the matrix already enforce this. If one fails, the matrix row is wrong, not the view.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/tasks/tests/test_api_admin_exclusion.py
git commit -m "test: prove an Admin has no task surface at all"
```

**DoD:** B4, B10.

---

### Task 32: The matrix-driven suite and the dependency-direction test

**Files:**
- Create: `backend/apps/core/tests/test_permission_matrix_api.py`, `test_layering.py`

Spec §12.2. Because the permission classes and the tests consume the same data, the matrix and its enforcement cannot drift.

- [ ] **Step 1: Write the parametrized suite**

```python
# apps/core/tests/test_permission_matrix_api.py
"""Every cell of spec §7.1, driven by apps/core/permissions/matrix.py itself.

Endpoint-level reachability only. The one conditional cell — Operator DELETE,
which D27 makes depend on created_by — is exercised here against a SELF-CREATED
task and expected to succeed; its negative case lives in
apps/tasks/tests/test_api_delete_rules.py (spec §12.2).
"""

import pytest

from apps.core.permissions.matrix import MATRIX, Resource, is_allowed
from apps.core.roles import Role
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import AdminFactory, OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db

FACTORY_FOR_ROLE = {
    Role.ADMIN: AdminFactory,
    Role.SUPERVISOR: SupervisorFactory,
    Role.OPERATOR: OperatorFactory,
}

#: (resource, action) -> (http method, url template, body, allowed status codes)
#: Several allowed codes per cell because "reachable" means "not 403", and a
#: reachable write can legitimately answer 200, 201 or 204.
REQUESTS = {
    (Resource.USER, "list"): ("get", "/api/v1/users/", None, {200}),
    (Resource.USER, "retrieve"): ("get", "/api/v1/users/{user_id}/", None, {200}),
    (Resource.USER, "create"): (
        "post", "/api/v1/users/",
        {"email": "matrix@example.com", "password": "a-strong-password-1",
         "first_name": "M", "last_name": "X", "role": Role.OPERATOR},
        {201},
    ),
    (Resource.USER, "partial_update"): (
        "patch", "/api/v1/users/{user_id}/", {"first_name": "Renamed"}, {200}
    ),
    (Resource.USER, "destroy"): ("delete", "/api/v1/users/{user_id}/", None, {204}),
    (Resource.USER, "me"): ("get", "/api/v1/users/me/", None, {200}),
    (Resource.TASK, "list"): ("get", "/api/v1/tasks/", None, {200}),
    (Resource.TASK, "retrieve"): ("get", "/api/v1/tasks/{task_id}/", None, {200}),
    (Resource.TASK, "create"): ("post", "/api/v1/tasks/", {"title": "Matrix"}, {201}),
    (Resource.TASK, "partial_update"): (
        "patch", "/api/v1/tasks/{task_id}/", {"title": "Renamed"}, {200}
    ),
    (Resource.TASK, "destroy"): ("delete", "/api/v1/tasks/{task_id}/", None, {204}),
    (Resource.TASK, "complete"): (
        "post", "/api/v1/tasks/{task_id}/complete/", {}, {200}
    ),
    (Resource.TASK, "stats"): ("get", "/api/v1/tasks/stats/", None, {200}),
}


def test_every_matrix_cell_has_a_request_definition():
    """A new matrix row without a request here would go untested silently."""
    assert set(MATRIX) == set(REQUESTS), set(MATRIX) ^ set(REQUESTS)


@pytest.mark.parametrize("cell", sorted(MATRIX, key=str))
@pytest.mark.parametrize("role", sorted(Role.values))
def test_matrix_cell(cell, role, api_client):
    resource, action = cell
    method, template, body, ok_statuses = REQUESTS[cell]

    actor = FACTORY_FOR_ROLE[role]()
    api_client.force_authenticate(user=actor)

    # Fixtures the actor can legitimately reach, so a refusal can only come from
    # the permission layer and never from scoping.
    other_user = OperatorFactory()
    task = TaskFactory(created_by=actor, assignee=actor) if role != Role.ADMIN else TaskFactory()
    url = template.format(user_id=other_user.pk, task_id=task.pk)

    response = getattr(api_client, method)(url, body, format="json") if body is not None \
        else getattr(api_client, method)(url)

    if is_allowed(role, resource, action):
        assert response.status_code in ok_statuses, (cell, role, response.status_code, response.data)
    else:
        assert response.status_code == 403, (cell, role, response.status_code, response.data)


@pytest.mark.parametrize("cell", sorted(MATRIX, key=str))
def test_every_endpoint_rejects_an_unauthenticated_request(cell, api_client):
    method, template, body, _ = REQUESTS[cell]
    url = template.format(user_id=OperatorFactory().pk, task_id=TaskFactory().pk)
    response = getattr(api_client, method)(url, body, format="json") if body is not None \
        else getattr(api_client, method)(url)
    assert response.status_code == 401, (cell, response.status_code)
```

- [ ] **Step 2: Write the dependency-direction test**

Spec §12.3 asks for this to be asserted rather than left to review.

```python
# apps/core/tests/test_layering.py
"""The spec §5.2.2 rule, enforced instead of trusted:

    services.py may import the Protocol. It may never import a concrete
    repository. The only module that names Django*Repository is the view.
"""

import inspect
import re

import pytest

from apps.tasks import services as task_services
from apps.users import services as user_services

CONCRETE_REPOSITORY = re.compile(r"\bDjango\w*Repository\b")


@pytest.mark.parametrize("module", [task_services, user_services], ids=["tasks", "users"])
def test_service_modules_name_no_concrete_repository(module):
    offenders = CONCRETE_REPOSITORY.findall(inspect.getsource(module))
    assert not offenders, f"{module.__name__} names {sorted(set(offenders))}"


@pytest.mark.parametrize("module", [task_services, user_services], ids=["tasks", "users"])
def test_service_modules_do_not_touch_the_orm(module):
    """Spec §16.2: a service reaching for Task.objects directly reintroduces a
    second write path, bypassing transition validation, notification enqueue and
    row locking."""
    source = inspect.getsource(module)
    assert ".objects." not in source, f"{module.__name__} uses a model manager directly"


def test_the_composition_root_is_the_view():
    from apps.tasks import views as task_views
    from apps.users import views as user_views

    assert CONCRETE_REPOSITORY.search(inspect.getsource(task_views))
    assert CONCRETE_REPOSITORY.search(inspect.getsource(user_views))
```

`test_service_modules_do_not_touch_the_orm` is a text scan, which is coarse — but it is cheap, it has no false negatives for the pattern that matters, and the alternative (an import-graph tool) is a dependency for one rule.

- [ ] **Step 3: Run both**

```bash
uv run --directory backend pytest apps/core/tests/test_permission_matrix_api.py apps/core/tests/test_layering.py -q
```

Expected: the full matrix cross-product passes (13 cells × 3 roles, plus 13 unauthenticated cases, plus the layering tests). Any failure identifies the exact cell.

- [ ] **Step 4: Run everything**

```bash
uv run --directory backend pytest -q
```

- [ ] **Step 5: Append to README and commit**

Record spec §7.1's matrix as a table in **Architecture**, and note that it is generated from the same data the tests consume.

```bash
git add backend/apps/core/tests/test_permission_matrix_api.py backend/apps/core/tests/test_layering.py README.md
git commit -m "test: assert every permission matrix cell and the dependency direction"
```

**DoD:** B4, B10.

---

## Phase 7 — `apps.notifications`

Spec §15 phase 7 and §10. Three failure modes are handled explicitly: enqueueing inside a transaction, retries double-sending, and blind retries.

### Task 33: The `Notification` model

**Files:**
- Create: `backend/apps/notifications/apps.py`, `models.py`
- Create: `backend/apps/notifications/migrations/__init__.py`
- Create: `backend/apps/notifications/tests/__init__.py`, `factories.py`, `test_models.py`
- Modify: `backend/config/settings/base.py` (`INSTALLED_APPS`)

- [ ] **Step 1: Write the failing tests**

```python
# apps/notifications/tests/test_models.py
import uuid

import pytest
from django.db import IntegrityError, transaction

from apps.notifications.models import Notification, NotificationStatus
from apps.notifications.tests.factories import NotificationFactory

pytestmark = pytest.mark.django_db


def test_notification_gets_a_uuid7_primary_key():
    assert uuid.UUID(str(NotificationFactory().pk)).version == 7


def test_dedupe_key_is_unique():
    """The whole idempotency mechanism rests on this index."""
    NotificationFactory(dedupe_key="same-key")
    with pytest.raises(IntegrityError), transaction.atomic():
        NotificationFactory(dedupe_key="same-key")


def test_a_realistic_dedupe_key_fits_the_column():
    """Two UUIDv7s plus the event name plus a history id — around 100 chars."""
    key = f"{uuid.uuid7()}:STATUS:{uuid.uuid7()}:1234567890"
    assert len(key) <= Notification._meta.get_field("dedupe_key").max_length


def test_notification_is_neither_soft_deletable_nor_historised():
    """D20's one exemption: an append-only log that no API exposes and nothing
    deletes would never have anything but NULL in a deleted_at column."""
    field_names = {f.name for f in Notification._meta.get_fields()}
    assert "deleted_at" not in field_names
    assert "deleted_by" not in field_names
    assert not hasattr(Notification, "history")


def test_notification_foreign_keys_cascade():
    """CASCADE rather than D25's PROTECT: if a row ever IS hard-deleted during
    data repair, its notification log should go with it."""
    for name in ("task", "recipient"):
        field = Notification._meta.get_field(name)
        assert field.remote_field.on_delete.__name__ == "CASCADE"


def test_default_status_is_pending():
    assert NotificationFactory().status == NotificationStatus.PENDING
```

- [ ] **Step 2: Write the factory**

```python
# apps/notifications/tests/factories.py
import uuid

import factory
from factory.django import DjangoModelFactory

from apps.notifications.models import Notification, NotificationEvent
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory


class NotificationFactory(DjangoModelFactory):
    class Meta:
        model = Notification

    task = factory.SubFactory(TaskFactory)
    recipient = factory.SubFactory(OperatorFactory)
    event = NotificationEvent.STATUS_CHANGED
    dedupe_key = factory.LazyFunction(lambda: f"{uuid.uuid7()}:STATUS:{uuid.uuid7()}:1")
```

- [ ] **Step 3: Run to confirm failure**

```bash
uv run --directory backend pytest apps/notifications -q
```

- [ ] **Step 4: Write `apps.py` and `models.py`**

```python
# apps/notifications/apps.py
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    name = "apps.notifications"
    label = "notifications"
```

```python
# apps/notifications/models.py
"""The notification log. Append-only, never API-exposed, never deleted.

Deliberately NOT soft-deletable and NOT historised (D20's one exemption): it is
already an append-only record, so a deleted_at column would never be anything but
NULL. That is also why its FKs are CASCADE while Task's are PROTECT.

It inherits UUIDPrimaryKeyModel even though it gains nothing security-wise — a
schema with two different primary-key types is a maintenance trap, and exposing
this table later would then require a key migration.
"""

from django.conf import settings
from django.db import models

from apps.core.models import UUIDPrimaryKeyModel


class NotificationEvent(models.TextChoices):
    ASSIGNED = "ASSIGNED", "Assigned"
    STATUS_CHANGED = "STATUS_CHANGED", "Status changed"
    DUE_DATE_CHANGED = "DUE_DATE_CHANGED", "Due date changed"
    OVERDUE = "OVERDUE", "Overdue"


class NotificationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SENT = "SENT", "Sent"
    FAILED = "FAILED", "Failed"


class Notification(UUIDPrimaryKeyModel):
    task = models.ForeignKey(
        "tasks.Task", on_delete=models.CASCADE, related_name="notifications"
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    event = models.CharField(max_length=20, choices=NotificationEvent.choices)
    # Sized for two UUIDv7s plus the event name plus a history id (spec §10.3b).
    dedupe_key = models.CharField(max_length=160, unique=True)
    status = models.CharField(
        max_length=10, choices=NotificationStatus.choices, default=NotificationStatus.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.event} -> {self.recipient_id}"
```

- [ ] **Step 5: Register, migrate and run**

```python
INSTALLED_APPS += ["apps.notifications"]
```

```bash
uv run --directory backend python manage.py makemigrations notifications
```

```bash
uv run --directory backend pytest apps/notifications/tests/test_models.py -q
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/notifications backend/config/settings/base.py
git commit -m "feat: add Notification log with a unique dedupe key"
```

**DoD:** B1, B2, B8, B10.

---

### Task 34: `NotificationRepository.create_if_absent`

**Files:**
- Create: `backend/apps/notifications/repositories.py`
- Create: `backend/apps/notifications/tests/test_dedupe.py`, `fakes.py`

Spec §5.2's method inventory: `create_if_absent` encapsulates the `IntegrityError` catch on the unique `dedupe_key`, so the whole idempotency mechanism of §10.3b lives here, in one tested place.

> **A refinement of spec §10.3b.** The spec says `create_if_absent` "returns `None` when the key already exists, so a retry of an already-sent event exits without sending." Taken literally that also blocks the retry of an event that was inserted and then **failed to send** — which would make `autoretry_for` (§10.3c) dead code, since the first attempt always inserts the row before sending. The rule is therefore implemented as the spec's *intent*: return `None` only when an existing row is already `SENT`; return the existing row when a previous attempt did not complete, so the retry can finish the job. One email per key still holds, which is the guarantee the design actually wants.

- [ ] **Step 1: Write the failing tests**

```python
# apps/notifications/tests/test_dedupe.py
import pytest

from apps.notifications.models import Notification, NotificationEvent, NotificationStatus
from apps.notifications.repositories import (
    DjangoNotificationRepository,
    NotificationRepository,
)
from apps.notifications.tests.fakes import FakeNotificationRepository
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory


def test_django_implementation_conforms_to_the_protocol():
    assert isinstance(DjangoNotificationRepository(), NotificationRepository)


def test_the_test_fake_conforms_to_the_same_protocol():
    """Two tests per repository, per spec §12.3 — the fake is the one that
    earns its place, since nothing else catches it drifting."""
    assert isinstance(FakeNotificationRepository(), NotificationRepository)


@pytest.mark.django_db
class TestCreateIfAbsent:
    def setup_method(self):
        self.repository = DjangoNotificationRepository()

    def _create(self, key="key-1"):
        task, recipient = TaskFactory(), OperatorFactory()
        return self.repository.create_if_absent(
            dedupe_key=key, task_id=task.pk, recipient_id=recipient.pk,
            event=NotificationEvent.STATUS_CHANGED,
        )

    def test_first_call_creates_the_row(self):
        notification = self._create()
        assert notification is not None
        assert notification.status == NotificationStatus.PENDING
        assert Notification.objects.count() == 1

    def test_a_second_call_after_a_successful_send_returns_none(self):
        first = self._create()
        self.repository.mark_sent(first)
        assert self._create() is None
        assert Notification.objects.count() == 1

    def test_a_second_call_after_a_failed_send_returns_the_existing_row(self):
        """Otherwise autoretry_for would be dead code: the first attempt always
        inserts before sending, so every retry would exit without sending."""
        first = self._create()
        self.repository.mark_failed(first, error="smtp down")
        retried = self._create()
        assert retried is not None
        assert retried.pk == first.pk
        assert Notification.objects.count() == 1

    def test_mark_sent_records_the_timestamp(self):
        notification = self._create()
        self.repository.mark_sent(notification)
        notification.refresh_from_db()
        assert notification.status == NotificationStatus.SENT
        assert notification.sent_at is not None

    def test_mark_failed_records_the_error_text(self):
        notification = self._create()
        self.repository.mark_failed(notification, error="relay refused")
        notification.refresh_from_db()
        assert notification.status == NotificationStatus.FAILED
        assert "relay refused" in notification.error

    def test_the_integrity_error_does_not_poison_the_surrounding_transaction(self):
        """The create is wrapped in its own atomic block, so a caller can keep
        working after a duplicate is skipped."""
        first = self._create()
        self.repository.mark_sent(first)
        assert self._create() is None
        assert Notification.objects.count() == 1   # this query must still work
```

The last test matters: without an inner `transaction.atomic()` the `IntegrityError` marks the whole transaction broken and every subsequent query raises `TransactionManagementError` — which in a Celery task shows up as an unrelated failure further down.

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/notifications/tests/test_dedupe.py -q
```

- [ ] **Step 3: Write `backend/apps/notifications/repositories.py`**

```python
# apps/notifications/repositories.py
"""Persistence boundary for Notification — and the home of the idempotency rule."""

from abc import abstractmethod
from typing import Protocol, runtime_checkable
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.notifications.models import Notification, NotificationStatus


@runtime_checkable
class NotificationRepository(Protocol):
    """What the notification worker may ask of notification storage."""

    @abstractmethod
    def create_if_absent(
        self, *, dedupe_key: str, task_id: UUID, recipient_id: UUID, event: str
    ) -> Notification | None:
        """Claim this (task, event, recipient, change) for sending.

        Returns the row to send, or None when an email for this key has already
        been SENT. An existing but unsent row is returned so a retry can finish.
        """

    @abstractmethod
    def mark_sent(self, notification: Notification) -> None: ...

    @abstractmethod
    def mark_failed(self, notification: Notification, *, error: str) -> None: ...


class DjangoNotificationRepository(NotificationRepository):
    """ORM-backed NotificationRepository."""

    def create_if_absent(
        self, *, dedupe_key: str, task_id: UUID, recipient_id: UUID, event: str
    ) -> Notification | None:
        try:
            # Inner atomic block: without it, the IntegrityError below marks the
            # whole transaction broken and every later query raises
            # TransactionManagementError somewhere unrelated.
            with transaction.atomic():
                return Notification.objects.create(
                    dedupe_key=dedupe_key,
                    task_id=task_id,
                    recipient_id=recipient_id,
                    event=event,
                )
        except IntegrityError:
            existing = Notification.objects.filter(dedupe_key=dedupe_key).first()
            if existing is None:
                raise  # the violation was something other than the dedupe key
            if existing.status == NotificationStatus.SENT:
                return None  # genuinely a duplicate
            return existing  # a previous attempt did not complete; let it retry

    def mark_sent(self, notification: Notification) -> None:
        notification.status = NotificationStatus.SENT
        notification.sent_at = timezone.now()
        notification.error = None
        notification.save(update_fields=["status", "sent_at", "error"])

    def mark_failed(self, notification: Notification, *, error: str) -> None:
        notification.status = NotificationStatus.FAILED
        notification.error = error[:2000]
        notification.save(update_fields=["status", "error"])
```

`error[:2000]` keeps an exception chain from writing an unbounded blob into the log row.

- [ ] **Step 4: Write `backend/apps/notifications/tests/fakes.py`**

```python
# apps/notifications/tests/fakes.py
"""In-memory notification repository. Does NOT inherit the Protocol —
conformance is asserted structurally in test_dedupe.py."""

from uuid import UUID

from apps.notifications.models import Notification, NotificationStatus


class FakeNotificationRepository:
    def __init__(self):
        self._by_key: dict[str, Notification] = {}

    def create_if_absent(self, *, dedupe_key: str, task_id: UUID, recipient_id: UUID, event: str):
        existing = self._by_key.get(dedupe_key)
        if existing is not None:
            return None if existing.status == NotificationStatus.SENT else existing
        notification = Notification(
            dedupe_key=dedupe_key, task_id=task_id, recipient_id=recipient_id, event=event
        )
        self._by_key[dedupe_key] = notification
        return notification

    def mark_sent(self, notification: Notification) -> None:
        notification.status = NotificationStatus.SENT

    def mark_failed(self, notification: Notification, *, error: str) -> None:
        notification.status = NotificationStatus.FAILED
        notification.error = error
```

- [ ] **Step 5: Run and commit**

```bash
uv run --directory backend pytest apps/notifications/tests/test_dedupe.py -q
```

Expected: 8 passed.

```bash
git add backend/apps/notifications/repositories.py backend/apps/notifications/tests
git commit -m "feat: add NotificationRepository owning the dedupe insert"
```

**DoD:** B6, B8, B10.

---

### Task 35: Recipient resolution and dedupe keys — pure functions

**Files:**
- Create: `backend/apps/notifications/services.py`
- Create: `backend/apps/notifications/tests/test_recipients.py`

Spec §10.1: recipient resolution is unit-tested independently of Celery and of email. These functions take ids and roles, not model instances, so they need no database at all.

- [ ] **Step 1: Write the failing tests**

```python
# apps/notifications/tests/test_recipients.py
"""No database, no Celery, no email — just the two rules."""

import uuid

import pytest

from apps.core.roles import Role
from apps.notifications.models import NotificationEvent
from apps.notifications.services import build_dedupe_key, resolve_recipients

ASSIGNEE = uuid.uuid7()
CREATOR = uuid.uuid7()


def resolve(event, *, creator_role=Role.SUPERVISOR, assignee=ASSIGNEE, creator=CREATOR, actor=None):
    return resolve_recipients(
        event=event, assignee_id=assignee, created_by_id=creator,
        created_by_role=creator_role, actor_id=actor,
    )


def test_assignment_notifies_only_the_new_assignee():
    assert resolve(NotificationEvent.ASSIGNED) == [ASSIGNEE]


def test_due_date_change_notifies_only_the_assignee():
    assert resolve(NotificationEvent.DUE_DATE_CHANGED) == [ASSIGNEE]


def test_status_change_notifies_the_assignee_and_the_creator():
    assert set(resolve(NotificationEvent.STATUS_CHANGED)) == {ASSIGNEE, CREATOR}


def test_overdue_notifies_the_assignee_and_the_creator():
    assert set(resolve(NotificationEvent.OVERDUE)) == {ASSIGNEE, CREATOR}


def test_an_operator_creator_who_no_longer_holds_the_task_is_dropped():
    """D26, falling out of D14: emailing someone about a task they cannot open is
    confusing and leaks information."""
    assert resolve(NotificationEvent.STATUS_CHANGED, creator_role=Role.OPERATOR) == [ASSIGNEE]


def test_an_operator_creator_who_still_holds_the_task_is_kept_once():
    result = resolve(
        NotificationEvent.STATUS_CHANGED, creator_role=Role.OPERATOR,
        assignee=CREATOR, creator=CREATOR,
    )
    assert result == [CREATOR], "the same person must not be emailed twice"


def test_a_supervisor_creator_is_kept_because_supervisors_see_all_tasks():
    assert set(resolve(NotificationEvent.STATUS_CHANGED, creator_role=Role.SUPERVISOR)) == {
        ASSIGNEE, CREATOR,
    }


def test_an_admin_creator_is_dropped():
    """Defensive: the API forbids an Admin creating a task, but the Django admin
    and seed data do not, and an Admin cannot read any task (D13)."""
    assert resolve(NotificationEvent.STATUS_CHANGED, creator_role=Role.ADMIN) == [ASSIGNEE]


def test_the_actor_is_never_emailed_about_their_own_action():
    assert resolve(NotificationEvent.STATUS_CHANGED, actor=ASSIGNEE) == [CREATOR]
    assert resolve(NotificationEvent.STATUS_CHANGED, actor=CREATOR) == [ASSIGNEE]


def test_an_unassigned_task_yields_no_assignee_recipient():
    assert resolve(NotificationEvent.ASSIGNED, assignee=None) == []


def test_an_overdue_sweep_has_no_actor_so_nobody_is_suppressed():
    assert set(resolve(NotificationEvent.OVERDUE, actor=None)) == {ASSIGNEE, CREATOR}


@pytest.mark.parametrize(
    ("event", "segment"),
    [
        (NotificationEvent.ASSIGNED, "ASSIGNED"),
        (NotificationEvent.STATUS_CHANGED, "STATUS"),
        (NotificationEvent.DUE_DATE_CHANGED, "DUE"),
    ],
)
def test_change_driven_keys_use_the_history_id(event, segment):
    key = build_dedupe_key(event=event, task_id=ASSIGNEE, recipient_id=CREATOR, history_id=42)
    assert key == f"{ASSIGNEE}:{segment}:{CREATOR}:42"
    assert len(key) <= 160


def test_overdue_keys_use_the_date_so_delivery_is_once_per_day():
    """Hourly cadence, daily dedupe window — deliberately different
    granularities (spec §10.4)."""
    key = build_dedupe_key(
        event=NotificationEvent.OVERDUE, task_id=ASSIGNEE, recipient_id=CREATOR,
        on_date="2026-10-06",
    )
    assert key == f"{ASSIGNEE}:OVERDUE:{CREATOR}:2026-10-06"


def test_an_overdue_key_without_a_date_is_a_programming_error():
    with pytest.raises(ValueError):
        build_dedupe_key(
            event=NotificationEvent.OVERDUE, task_id=ASSIGNEE, recipient_id=CREATOR
        )
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/notifications/tests/test_recipients.py -q
```

- [ ] **Step 3: Write `backend/apps/notifications/services.py`**

```python
# apps/notifications/services.py
"""Who gets told, and under which key. Pure functions over ids and roles, so
they are testable with no database, no broker and no email backend."""

from uuid import UUID

from apps.core.roles import Role
from apps.notifications.models import NotificationEvent

#: Who the event is about, before the two filters below are applied.
_AUDIENCE: dict[str, tuple[str, ...]] = {
    NotificationEvent.ASSIGNED: ("assignee",),
    NotificationEvent.DUE_DATE_CHANGED: ("assignee",),
    NotificationEvent.STATUS_CHANGED: ("assignee", "creator"),
    NotificationEvent.OVERDUE: ("assignee", "creator"),
}

#: Key segments are shorter than the event names on purpose (spec §10.3b).
_KEY_SEGMENT: dict[str, str] = {
    NotificationEvent.ASSIGNED: "ASSIGNED",
    NotificationEvent.STATUS_CHANGED: "STATUS",
    NotificationEvent.DUE_DATE_CHANGED: "DUE",
    NotificationEvent.OVERDUE: "OVERDUE",
}


def resolve_recipients(
    *,
    event: str,
    assignee_id: UUID | None,
    created_by_id: UUID | None,
    created_by_role: str | None,
    actor_id: UUID | None = None,
) -> list[UUID]:
    """Recipients for `event`, in a stable order, after both filters.

    1. Read-access gate (D26): a recipient must currently be able to read the
       task. An Operator creator who is no longer the assignee is dropped; a
       Supervisor creator is retained, because Supervisors see all tasks.
    2. Actor suppression: nobody is emailed about their own action.
    """
    candidates: list[UUID | None] = []
    for who in _AUDIENCE[event]:
        if who == "assignee":
            # The assignee can always read their own task, and D17 guarantees
            # they are never an Admin.
            candidates.append(assignee_id)
        elif _creator_can_read(created_by_role, created_by_id, assignee_id):
            candidates.append(created_by_id)

    recipients: list[UUID] = []
    for candidate in candidates:
        if candidate is None or candidate == actor_id or candidate in recipients:
            continue
        recipients.append(candidate)
    return recipients


def _creator_can_read(
    created_by_role: str | None, created_by_id: UUID | None, assignee_id: UUID | None
) -> bool:
    if created_by_role == Role.SUPERVISOR:
        return True
    if created_by_role == Role.OPERATOR:
        return created_by_id is not None and created_by_id == assignee_id
    return False  # Admin, or unknown: no task read access at all (D13)


def build_dedupe_key(
    *,
    event: str,
    task_id: UUID,
    recipient_id: UUID,
    history_id: int | None = None,
    on_date: str | None = None,
) -> str:
    """The unique key that makes delivery idempotent (spec §10.3b).

    Change-driven events key on the simple-history record id, which ties each
    email to the exact audited change that caused it. OVERDUE keys on the date
    instead, capping delivery at one email per task per recipient per day.
    """
    segment = _KEY_SEGMENT[event]
    if event == NotificationEvent.OVERDUE:
        if on_date is None:
            raise ValueError("An OVERDUE dedupe key requires on_date")
        return f"{task_id}:{segment}:{recipient_id}:{on_date}"
    if history_id is None:
        raise ValueError(f"A {event} dedupe key requires history_id")
    return f"{task_id}:{segment}:{recipient_id}:{history_id}"
```

- [ ] **Step 4: Run and commit**

```bash
uv run --directory backend pytest apps/notifications/tests/test_recipients.py -q
```

Expected: 16 passed, no database.

```bash
git add backend/apps/notifications/services.py backend/apps/notifications/tests/test_recipients.py
git commit -m "feat: add recipient resolution and dedupe key construction"
```

**DoD:** B10.

---

### Task 36: Celery app, email rendering, and the send task

**Files:**
- Create: `backend/config/celery.py`, `backend/apps/notifications/emails.py`, `tasks.py`
- Create: `backend/apps/notifications/templates/notifications/*.txt`
- Create: `backend/apps/notifications/tests/test_tasks.py`
- Modify: `backend/config/__init__.py`, `backend/config/settings/base.py`

- [ ] **Step 1: Write `backend/config/celery.py` and wire it into `config/__init__.py`**

```python
# config/celery.py
"""The Celery application and the single beat schedule entry.

django-celery-beat is deliberately NOT used: the schedule is one fixed entry, and
a database-backed editable schedule would mean a dependency plus migrations for
no current requirement (backend §53.16).
"""

import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("task_management")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # Hourly cadence, daily dedupe window (spec §10.4): a task that goes overdue
    # at 09:15 is emailed by 10:00 rather than waiting until midnight, while the
    # date in the OVERDUE dedupe key caps delivery at one email per day.
    "sweep-overdue-tasks-hourly": {
        "task": "apps.notifications.tasks.sweep_overdue_tasks",
        "schedule": crontab(minute=0),
    },
}
```

```python
# config/__init__.py
from config.celery import app as celery_app

__all__ = ("celery_app",)
```

Add to `config/settings/base.py`:

```python
CELERY_BROKER_URL = env("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = None          # nothing reads a task result
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_TIME_LIMIT = 120
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@taskmanagement.local")
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", "http://localhost:5173")
```

Add the two new variables to the committed `.env.example` as well, so a fresh clone does not rely on the defaults:

```dotenv
CELERY_BROKER_URL=redis://redis:6379/1
FRONTEND_BASE_URL=http://localhost:5173
```

- [ ] **Step 2: Write `backend/apps/notifications/emails.py`**

```python
# apps/notifications/emails.py
"""Subject and body rendering. Templates live in templates/notifications/."""

from django.conf import settings
from django.template.loader import render_to_string

from apps.notifications.models import NotificationEvent
from apps.tasks.models import Task
from apps.users.models import User

_SUBJECTS = {
    NotificationEvent.ASSIGNED: "A task was assigned to you: {title}",
    NotificationEvent.STATUS_CHANGED: "Task status changed: {title}",
    NotificationEvent.DUE_DATE_CHANGED: "Task due date changed: {title}",
    NotificationEvent.OVERDUE: "Task overdue: {title}",
}

_TEMPLATES = {
    NotificationEvent.ASSIGNED: "notifications/assigned.txt",
    NotificationEvent.STATUS_CHANGED: "notifications/status_changed.txt",
    NotificationEvent.DUE_DATE_CHANGED: "notifications/due_date_changed.txt",
    NotificationEvent.OVERDUE: "notifications/overdue.txt",
}


def render(*, event: str, task: Task, recipient: User) -> tuple[str, str]:
    subject = _SUBJECTS[event].format(title=task.title)
    body = render_to_string(
        _TEMPLATES[event],
        {
            "task": task,
            "recipient": recipient,
            "task_url": f"{settings.FRONTEND_BASE_URL}/tasks/{task.pk}",
        },
    )
    return subject, body
```

Write the four plain-text templates. Keep them short, and include the task title, status, due date and the link. No token, no id-as-secret — spec §16.1: a UUIDv7 is not a capability token.

- [ ] **Step 3: Write the failing tests for the send task**

```python
# apps/notifications/tests/test_tasks.py
import pytest
from django.core import mail

from apps.notifications.models import Notification, NotificationEvent, NotificationStatus
from apps.notifications.services import build_dedupe_key
from apps.notifications.tasks import send_task_event_email
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory

pytestmark = pytest.mark.django_db


def call(task, recipient, event=NotificationEvent.STATUS_CHANGED, history_id=1):
    return send_task_event_email(
        event=event,
        task_id=str(task.pk),
        recipient_id=str(recipient.pk),
        dedupe_key=build_dedupe_key(
            event=event, task_id=task.pk, recipient_id=recipient.pk, history_id=history_id
        ),
    )


def test_it_sends_one_email_and_records_it_as_sent():
    task, recipient = TaskFactory(), OperatorFactory()
    call(task, recipient)
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == [recipient.email]
    assert task.title in mail.outbox[0].subject
    notification = Notification.objects.get()
    assert notification.status == NotificationStatus.SENT
    assert notification.sent_at is not None


def test_running_it_twice_creates_one_notification_and_sends_one_email():
    """The direct test of §10.3b: retries must not double-send."""
    task, recipient = TaskFactory(), OperatorFactory()
    call(task, recipient)
    call(task, recipient)
    assert Notification.objects.count() == 1
    assert len(mail.outbox) == 1


def test_a_different_change_sends_again():
    """The key includes history_id, so the NEXT audited change is a new email."""
    task, recipient = TaskFactory(), OperatorFactory()
    call(task, recipient, history_id=1)
    call(task, recipient, history_id=2)
    assert Notification.objects.count() == 2
    assert len(mail.outbox) == 2


def test_a_vanished_task_is_skipped_without_raising():
    import uuid

    recipient = OperatorFactory()
    send_task_event_email(
        event=NotificationEvent.STATUS_CHANGED,
        task_id=str(uuid.uuid7()),
        recipient_id=str(recipient.pk),
        dedupe_key="orphan-key",
    )
    assert mail.outbox == []
    assert Notification.objects.count() == 0


def test_a_soft_deleted_task_is_skipped():
    task, recipient = TaskFactory(), OperatorFactory()
    task.soft_delete()
    call(task, recipient)
    assert mail.outbox == []


def test_an_unexpected_error_marks_the_notification_failed_rather_than_vanishing(monkeypatch):
    """backend §45: a bare Exception is never retried; it is recorded and logged.
    `except Exception: pass` appears nowhere."""
    task, recipient = TaskFactory(), OperatorFactory()

    def explode(*args, **kwargs):
        raise ValueError("template is broken")

    monkeypatch.setattr("apps.notifications.tasks.emails.render", explode)
    call(task, recipient)
    notification = Notification.objects.get()
    assert notification.status == NotificationStatus.FAILED
    assert "template is broken" in notification.error
    assert mail.outbox == []


def test_the_task_declares_retries_only_for_transport_failures():
    from smtplib import SMTPException

    retried = send_task_event_email.autoretry_for
    assert SMTPException in retried
    assert ConnectionError in retried
    assert Exception not in retried, "a bare Exception must never be retried"
    assert send_task_event_email.max_retries == 3
```

- [ ] **Step 4: Run to confirm failure**

```bash
uv run --directory backend pytest apps/notifications/tests/test_tasks.py -q
```

- [ ] **Step 5: Write `backend/apps/notifications/tasks.py`**

```python
# apps/notifications/tasks.py
"""Celery tasks. Genuinely idempotent, which is the precondition backend §26
sets for enabling automatic retries."""

import logging
from smtplib import SMTPException

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from apps.notifications import emails
from apps.notifications.repositories import DjangoNotificationRepository
from apps.tasks.repositories import DjangoTaskRepository
from apps.users.repositories import DjangoUserRepository

logger = logging.getLogger(__name__)


@shared_task(
    name="apps.notifications.tasks.send_task_event_email",
    autoretry_for=(SMTPException, ConnectionError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
    acks_late=True,
)
def send_task_event_email(*, event: str, task_id: str, recipient_id: str, dedupe_key: str) -> None:
    notifications = DjangoNotificationRepository()

    task = DjangoTaskRepository().get(task_id)
    recipient = DjangoUserRepository().get(recipient_id)
    if task is None or recipient is None:
        # Soft-deleted or genuinely gone between enqueue and delivery. Not an
        # error: the default managers filter deleted rows, so this is the
        # designed outcome of deleting a task with pending notifications.
        logger.info("notifications.target_missing key=%s", dedupe_key)
        return

    notification = notifications.create_if_absent(
        dedupe_key=dedupe_key, task_id=task.pk, recipient_id=recipient.pk, event=event
    )
    if notification is None:
        logger.info("notifications.duplicate_skipped key=%s", dedupe_key)
        return

    try:
        subject, body = emails.render(event=event, task=task, recipient=recipient)
        send_mail(
            subject, body, settings.DEFAULT_FROM_EMAIL, [recipient.email], fail_silently=False
        )
    except (SMTPException, ConnectionError):
        # Transport failure: let autoretry_for handle it. The Notification row
        # stays PENDING, so create_if_absent returns it again on the retry.
        logger.warning("notifications.transport_failure key=%s", dedupe_key)
        raise
    except Exception as exc:  # noqa: BLE001 — recorded and logged, never swallowed
        notifications.mark_failed(notification, error=f"{type(exc).__name__}: {exc}")
        logger.exception("notifications.send_failed key=%s", dedupe_key)
        return

    notifications.mark_sent(notification)
    logger.info("notifications.sent key=%s event=%s", dedupe_key, event)
```

Two ordering details that make the retry story work: the **transport** failure re-raises *before* `mark_failed`, so the row stays `PENDING` and Task 34's `create_if_absent` hands it back on the retry; the **unexpected** failure marks it `FAILED` and returns, so Celery does not retry a bug.

- [ ] **Step 6: Run the tests**

```bash
uv run --directory backend pytest apps/notifications/tests/test_tasks.py -q
```

Expected: 7 passed. `CELERY_TASK_ALWAYS_EAGER=True` in test settings means the task body runs inline.

- [ ] **Step 7: Verify the worker actually boots**

```bash
docker compose build backend
```

```bash
docker compose up -d db redis worker
```

```bash
docker compose logs worker --tail 30
```

Expected: the Celery banner listing `apps.notifications.tasks.send_task_event_email`.

```bash
docker compose down
```

- [ ] **Step 8: Commit**

```bash
git add backend/config/celery.py backend/config/__init__.py backend/config/settings/base.py backend/apps/notifications/emails.py backend/apps/notifications/tasks.py backend/apps/notifications/templates backend/apps/notifications/tests/test_tasks.py
git commit -m "feat: add Celery app and the idempotent notification send task"
```

**DoD:** B10, B11, B12.

---

### Task 37: Wire the dispatcher into the composition root

**Files:**
- Modify: `backend/apps/notifications/dispatchers.py` (delete the null implementation)
- Modify: `backend/apps/tasks/selectors.py`, `backend/apps/tasks/views.py`
- Create: `backend/apps/notifications/tests/test_on_commit.py`

- [ ] **Step 1: Write the failing tests**

The `on_commit` tests are the ones spec §16.2 calls out as guarding the easiest thing in this design to regress — so they must not be the confusing ones.

```python
# apps/notifications/tests/test_on_commit.py
"""pytest-django wraps each test in a transaction that is rolled back rather than
committed, so transaction.on_commit callbacks NEVER fire by default — every
"an email was enqueued" assertion would fail for a reason unrelated to the code
under test. Hence django_capture_on_commit_callbacks(execute=True)."""

import pytest
from django.core import mail
from django.db import transaction

from apps.notifications.models import Notification, NotificationEvent
from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.tasks.views import TaskViewSet
from apps.users.tests.factories import OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db
URL = "/api/v1/tasks/"


def test_the_composition_root_uses_the_celery_dispatcher():
    """A silently-null dispatcher is exactly the kind of thing that ships
    unnoticed, so the swap from Task 24's placeholder is asserted."""
    from apps.notifications.dispatchers import CeleryNotificationDispatcher
    from apps.tasks.repositories import DjangoTaskRepository

    service = TaskViewSet().get_service()
    assert isinstance(service._notifications, CeleryNotificationDispatcher)
    assert isinstance(service._tasks, DjangoTaskRepository)


def test_the_null_dispatcher_is_gone():
    import apps.notifications.dispatchers as module

    assert not hasattr(module, "NullNotificationDispatcher")


def test_assignment_emails_exactly_the_new_assignee(
    supervisor_client, django_capture_on_commit_callbacks
):
    assignee = OperatorFactory()
    with django_capture_on_commit_callbacks(execute=True):
        response = supervisor_client.post(
            URL, {"title": "Assigned", "assignee": str(assignee.pk)}, format="json"
        )
    assert response.status_code == 201
    assert [message.to for message in mail.outbox] == [[assignee.email]]
    assert Notification.objects.get().event == NotificationEvent.ASSIGNED


def test_a_status_change_emails_the_assignee_and_the_creator(
    supervisor_client, supervisor, django_capture_on_commit_callbacks
):
    assignee = OperatorFactory()
    task = TaskFactory(created_by=supervisor, assignee=assignee, status=TaskStatus.PENDING)
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.patch(
            f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json"
        )
    # The actor is the supervisor/creator, so they are suppressed.
    assert [message.to for message in mail.outbox] == [[assignee.email]]


def test_an_operator_creator_who_no_longer_holds_the_task_is_not_emailed(
    supervisor_client, django_capture_on_commit_callbacks
):
    """D26."""
    original_creator = OperatorFactory()
    current_assignee = OperatorFactory()
    task = TaskFactory(
        created_by=original_creator, assignee=current_assignee, status=TaskStatus.PENDING
    )
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.patch(
            f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS}, format="json"
        )
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {current_assignee.email}
    assert original_creator.email not in recipients


def test_a_supervisor_creator_is_emailed(operator_client, operator,
                                         django_capture_on_commit_callbacks):
    creator = SupervisorFactory()
    task = TaskFactory(created_by=creator, assignee=operator, status=TaskStatus.PENDING)
    with django_capture_on_commit_callbacks(execute=True):
        operator_client.patch(f"{URL}{task.pk}/", {"status": TaskStatus.IN_PROGRESS},
                              format="json")
    recipients = {address for message in mail.outbox for address in message.to}
    assert creator.email in recipients
    assert operator.email not in recipients, "the actor is never emailed"


def test_a_title_only_edit_enqueues_nothing(supervisor_client,
                                            django_capture_on_commit_callbacks):
    task = TaskFactory()
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.patch(f"{URL}{task.pk}/", {"title": "Renamed"}, format="json")
    assert mail.outbox == []


def test_completion_emails_the_creator(supervisor_client, django_capture_on_commit_callbacks):
    creator = SupervisorFactory()
    assignee = OperatorFactory()
    task = TaskFactory(created_by=creator, assignee=assignee, status=TaskStatus.IN_PROGRESS)
    with django_capture_on_commit_callbacks(execute=True):
        supervisor_client.post(f"{URL}{task.pk}/complete/", {}, format="json")
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {creator.email, assignee.email}


@pytest.mark.django_db(transaction=True)
def test_nothing_is_enqueued_when_the_surrounding_transaction_rolls_back():
    """The guard for spec §10.3a. A later contributor adding a notification with
    a bare .delay() would break this and nothing else."""
    from apps.notifications.dispatchers import CeleryNotificationDispatcher
    from apps.tasks.repositories import DjangoTaskRepository
    from apps.tasks.services import TaskService

    creator, assignee = SupervisorFactory(), OperatorFactory()
    service = TaskService(
        tasks=DjangoTaskRepository(), notifications=CeleryNotificationDispatcher()
    )
    mail.outbox.clear()

    class Rollback(Exception):
        pass

    with pytest.raises(Rollback), transaction.atomic():
        service.create(
            data={"title": "Doomed", "description": "", "due_date": None, "assignee": assignee},
            actor=creator,
        )
        raise Rollback

    assert mail.outbox == []
    assert Notification.objects.count() == 0
```

- [ ] **Step 2: Add the selector the dispatcher needs**

In `apps/tasks/selectors.py` — add `from uuid import UUID` to the import block (Task 23 left it out, because nothing in that task used it and ruff's `F401` would have flagged an unused import):

```python
def notification_target(task_id: UUID) -> tuple[UUID | None, UUID, str] | None:
    """(assignee_id, created_by_id, created_by__role) for recipient resolution.

    One query, no model instances. Lives here rather than in the dispatcher
    because spec §16.2 treats a raw ORM call outside a repository or selector as
    a defect.
    """
    return (
        Task.objects.filter(pk=task_id)
        .values_list("assignee_id", "created_by_id", "created_by__role")
        .first()
    )
```

- [ ] **Step 3: Replace the null dispatcher with the Celery one**

In `apps/notifications/dispatchers.py`, **delete `NullNotificationDispatcher`** and add:

```python
from apps.notifications.models import NotificationEvent
from apps.notifications.services import build_dedupe_key, resolve_recipients
from apps.notifications.tasks import send_task_event_email
from apps.tasks.selectors import notification_target


class CeleryNotificationDispatcher(NotificationDispatcher):
    """Resolves recipients and enqueues one message per recipient.

    Runs inside transaction.on_commit, i.e. in the request thread AFTER the
    commit, so the read below sees the committed row and a query here is free.
    """

    def task_assigned(self, *, task_id, history_id, actor_id) -> None:
        self._fan_out(NotificationEvent.ASSIGNED, task_id, history_id, actor_id)

    def task_status_changed(self, *, task_id, history_id, actor_id) -> None:
        self._fan_out(NotificationEvent.STATUS_CHANGED, task_id, history_id, actor_id)

    def task_due_date_changed(self, *, task_id, history_id, actor_id) -> None:
        self._fan_out(NotificationEvent.DUE_DATE_CHANGED, task_id, history_id, actor_id)

    @staticmethod
    def _fan_out(event: str, task_id, history_id, actor_id) -> None:
        target = notification_target(task_id)
        if target is None:
            logger.info("notifications.task_gone task=%s event=%s", task_id, event)
            return
        assignee_id, created_by_id, created_by_role = target
        recipients = resolve_recipients(
            event=event,
            assignee_id=assignee_id,
            created_by_id=created_by_id,
            created_by_role=created_by_role,
            actor_id=actor_id,
        )
        for recipient_id in recipients:
            send_task_event_email.delay(
                event=event,
                task_id=str(task_id),
                recipient_id=str(recipient_id),
                dedupe_key=build_dedupe_key(
                    event=event,
                    task_id=task_id,
                    recipient_id=recipient_id,
                    history_id=history_id,
                ),
            )
```

**Import direction check.** `tasks.services` → `notifications.dispatchers` → `notifications.tasks` → `tasks.repositories` → `tasks.models`. `tasks.models` imports nothing from `notifications` or from `tasks.services`, so the chain terminates and there is no cycle. If a future change makes `notifications` import `tasks.services`, that is the moment the cycle appears.

- [ ] **Step 4: Swap the composition root**

In `apps/tasks/views.py`:

```python
from apps.notifications.dispatchers import CeleryNotificationDispatcher

    def get_service(self) -> TaskService:
        return TaskService(
            tasks=DjangoTaskRepository(),
            notifications=CeleryNotificationDispatcher(),
        )
```

- [ ] **Step 5: Run the tests**

```bash
uv run --directory backend pytest apps/notifications -q
```

Expected: all pass, including the rollback test.

```bash
uv run --directory backend pytest -q
```

- [ ] **Step 6: Append to README and commit**

Record §10.1 (the event table and the two recipient filters), §10.3 (the three failure modes and how each is handled), and D26.

```bash
git add backend/apps/notifications backend/apps/tasks/selectors.py backend/apps/tasks/views.py README.md
git commit -m "feat: wire the Celery notification dispatcher into the composition root"
```

**DoD:** B6, B7, B10, B12.

---

### Task 38: The overdue sweep

**Files:**
- Modify: `backend/apps/notifications/tasks.py`
- Create: `backend/apps/notifications/tests/test_sweep.py`

- [ ] **Step 1: Write the failing tests**

```python
# apps/notifications/tests/test_sweep.py
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.notifications.models import Notification, NotificationEvent
from apps.notifications.tasks import sweep_overdue_tasks
from apps.tasks.models import TaskStatus
from apps.tasks.tests.factories import TaskFactory
from apps.users.tests.factories import OperatorFactory, SupervisorFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def overdue_task():
    return TaskFactory(
        due_date=timezone.now() - timedelta(days=1),
        status=TaskStatus.PENDING,
        assignee=OperatorFactory(),
        created_by=SupervisorFactory(),
    )


def test_the_sweep_emails_assignee_and_creator(overdue_task):
    sweep_overdue_tasks()
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {overdue_task.assignee.email, overdue_task.created_by.email}
    assert {n.event for n in Notification.objects.all()} == {NotificationEvent.OVERDUE}


def test_the_sweep_ignores_tasks_that_are_not_overdue():
    now = timezone.now()
    TaskFactory(due_date=now + timedelta(days=1), status=TaskStatus.PENDING)
    TaskFactory(due_date=None, status=TaskStatus.PENDING)
    TaskFactory(due_date=now - timedelta(days=1), status=TaskStatus.CANCELLED)
    TaskFactory(due_date=now - timedelta(days=1), status=TaskStatus.COMPLETED, completed_at=now)
    sweep_overdue_tasks()
    assert mail.outbox == []


def test_the_sweep_ignores_soft_deleted_tasks(overdue_task):
    overdue_task.soft_delete()
    sweep_overdue_tasks()
    assert mail.outbox == []


def test_running_the_sweep_twice_in_one_day_sends_one_email_per_recipient(overdue_task):
    """The date in the OVERDUE dedupe key caps delivery at one per task per
    recipient per day, while the hourly cadence keeps latency under an hour."""
    sweep_overdue_tasks()
    sweep_overdue_tasks()
    assert len(mail.outbox) == 2          # assignee + creator, once each
    assert Notification.objects.count() == 2


def test_an_operator_creator_who_no_longer_holds_the_task_is_not_swept_in():
    """D26 applies to the sweep too, which is why overdue_candidates joins
    created_by__role."""
    creator, assignee = OperatorFactory(), OperatorFactory()
    TaskFactory(
        due_date=timezone.now() - timedelta(days=1), status=TaskStatus.PENDING,
        created_by=creator, assignee=assignee,
    )
    sweep_overdue_tasks()
    recipients = {address for message in mail.outbox for address in message.to}
    assert recipients == {assignee.email}


def test_the_sweep_reports_how_many_messages_it_enqueued(overdue_task):
    assert sweep_overdue_tasks() == 2


def test_the_beat_schedule_declares_the_sweep_hourly():
    from config.celery import app

    entry = app.conf.beat_schedule["sweep-overdue-tasks-hourly"]
    assert entry["task"] == "apps.notifications.tasks.sweep_overdue_tasks"
    assert entry["schedule"].minute == {0}
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/notifications/tests/test_sweep.py -q
```

- [ ] **Step 3: Add the sweep to `apps/notifications/tasks.py`**

```python
@shared_task(name="apps.notifications.tasks.sweep_overdue_tasks")
def sweep_overdue_tasks() -> int:
    """Hourly: enqueue one email per overdue task per eligible recipient.

    Calls tasks.selectors.overdue_candidates() rather than touching the ORM
    (D8; spec §16.2). The selector returns values_list(...).iterator(), so a
    large backlog never materialises as model instances, and it is served by the
    ("status", "due_date") partial index.
    """
    today = timezone.now().date().isoformat()
    enqueued = 0

    for task_id, assignee_id, created_by_id, created_by_role in overdue_candidates():
        recipients = resolve_recipients(
            event=NotificationEvent.OVERDUE,
            assignee_id=assignee_id,
            created_by_id=created_by_id,
            created_by_role=created_by_role,
            actor_id=None,  # a scheduled sweep has no actor to suppress
        )
        for recipient_id in recipients:
            send_task_event_email.delay(
                event=NotificationEvent.OVERDUE,
                task_id=str(task_id),
                recipient_id=str(recipient_id),
                dedupe_key=build_dedupe_key(
                    event=NotificationEvent.OVERDUE,
                    task_id=task_id,
                    recipient_id=recipient_id,
                    on_date=today,
                ),
            )
            enqueued += 1

    logger.info("notifications.sweep_complete enqueued=%s date=%s", enqueued, today)
    return enqueued
```

Add the imports at the top: `from django.utils import timezone`, `from apps.notifications.models import NotificationEvent`, `from apps.notifications.services import build_dedupe_key, resolve_recipients`, `from apps.tasks.selectors import overdue_candidates`.

- [ ] **Step 4: Run the tests**

```bash
uv run --directory backend pytest apps/notifications/tests/test_sweep.py -q
```

Expected: 7 passed.

- [ ] **Step 5: Verify beat boots against the real broker**

```bash
docker compose up -d db redis worker beat
```

```bash
docker compose logs beat --tail 20
```

Expected: beat announces the `sweep-overdue-tasks-hourly` entry.

```bash
docker compose down
```

- [ ] **Step 6: Append to README and commit**

Record §10.4 (hourly cadence, daily dedupe window, and why they are different granularities) and the `beat` service as a documented override of root `AGENTS.md`.

```bash
git add backend/apps/notifications/tasks.py backend/apps/notifications/tests/test_sweep.py README.md
git commit -m "feat: add the hourly overdue sweep with per-day deduplication"
```

**DoD:** B5, B10, B12.

---

## Phase 8 — Demo data and the API schema

### Task 39: `seed_demo_data`

**Files:**
- Create: `backend/apps/users/management/__init__.py`, `commands/__init__.py`, `commands/seed_demo_data.py`
- Create: `backend/apps/users/tests/test_seed_command.py`
- Modify: `README.md`

`backend §54a`: the application must come up with representative data already loaded — a reviewer should not have to create users and tasks before they can evaluate anything.

- [ ] **Step 1: Write the failing tests**

```python
# apps/users/tests/test_seed_command.py
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.core.roles import Role
from apps.tasks.models import Task, TaskStatus
from apps.users.models import User

pytestmark = pytest.mark.django_db


def test_it_creates_one_user_per_role_plus_extra_operators():
    call_command("seed_demo_data")
    assert User.objects.filter(role=Role.ADMIN).count() >= 1
    assert User.objects.filter(role=Role.SUPERVISOR).count() >= 1
    assert User.objects.filter(role=Role.OPERATOR).count() >= 3, "the assignee picker needs choices"


def test_it_creates_enough_tasks_to_make_pagination_visible():
    call_command("seed_demo_data")
    assert Task.objects.count() >= 40


def test_due_dates_straddle_now_so_every_filter_has_subjects():
    from django.utils import timezone

    call_command("seed_demo_data")
    now = timezone.now()
    open_statuses = [TaskStatus.PENDING, TaskStatus.IN_PROGRESS]
    assert Task.objects.filter(due_date__lt=now, status__in=open_statuses).exists(), "overdue"
    assert Task.objects.filter(due_date__gte=now, status__in=open_statuses).exists(), "due soon"
    assert Task.objects.filter(due_date__isnull=True).exists(), "undated"


def test_all_four_statuses_are_represented():
    call_command("seed_demo_data")
    assert set(Task.objects.values_list("status", flat=True)) == set(TaskStatus.values)


def test_it_is_idempotent():
    call_command("seed_demo_data")
    first = (User.objects.count(), Task.objects.count())
    call_command("seed_demo_data")
    assert (User.objects.count(), Task.objects.count()) == first


def test_every_seeded_user_can_authenticate():
    from django.contrib.auth import authenticate
    from apps.users.management.commands.seed_demo_data import DEMO_PASSWORD

    call_command("seed_demo_data")
    for user in User.objects.all():
        assert authenticate(username=user.email, password=DEMO_PASSWORD) is not None


def test_no_task_violates_the_completion_check_constraint():
    call_command("seed_demo_data")
    assert not Task.objects.filter(status=TaskStatus.COMPLETED, completed_at__isnull=True).exists()
    assert not Task.objects.exclude(status=TaskStatus.COMPLETED).filter(
        completed_at__isnull=False
    ).exists()


def test_it_refuses_to_run_under_production_settings(settings):
    """Never seed demo credentials into a production-like profile."""
    settings.DEBUG = False
    settings.SETTINGS_MODULE = "config.settings.production"
    with pytest.raises(CommandError, match="production"):
        call_command("seed_demo_data")
```

- [ ] **Step 2: Run to confirm failure**

```bash
uv run --directory backend pytest apps/users/tests/test_seed_command.py -q
```

- [ ] **Step 3: Write the command**

```python
# apps/users/management/commands/seed_demo_data.py
"""Idempotent demo data. Scoped to local/demo settings only (backend §54a)."""

import random
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.roles import Role
from apps.tasks.models import Task, TaskStatus
from apps.users.models import User

DEMO_PASSWORD = "DemoPass!2026"
TASK_COUNT = 45

DEMO_USERS = [
    ("admin@demo.local", "Ada", "Admin", Role.ADMIN),
    ("supervisor@demo.local", "Sam", "Supervisor", Role.SUPERVISOR),
    ("operator@demo.local", "Omar", "Operator", Role.OPERATOR),
    ("operator2@demo.local", "Olga", "Operator", Role.OPERATOR),
    ("operator3@demo.local", "Otto", "Operator", Role.OPERATOR),
]


class Command(BaseCommand):
    help = "Create demo users and tasks. Local/demo settings only."

    def handle(self, *args, **options):
        module = getattr(settings, "SETTINGS_MODULE", "") or ""
        if "production" in module:
            raise CommandError("seed_demo_data refuses to run under production settings.")

        # A fixed seed keeps the spread reproducible between runs and machines.
        random.seed(20261006)

        with transaction.atomic():
            users = self._seed_users()
            self._seed_tasks(users)

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {User.objects.count()} users and {Task.objects.count()} tasks. "
            f"Password for every demo account: {DEMO_PASSWORD}"
        ))

    def _seed_users(self) -> dict[str, User]:
        users: dict[str, User] = {}
        for email, first, last, role in DEMO_USERS:
            existing = User.objects.filter(email=email).first()
            if existing is None:
                existing = User.objects.create_user(
                    email=email, password=DEMO_PASSWORD,
                    first_name=first, last_name=last, role=role,
                    is_staff=(role == Role.ADMIN), is_superuser=(role == Role.ADMIN),
                )
            users[email] = existing
        return users

    def _seed_tasks(self, users: dict[str, User]) -> None:
        if Task.objects.exists():
            return  # idempotent: tasks are seeded once

        supervisor = users["supervisor@demo.local"]
        operators = [u for u in users.values() if u.role == Role.OPERATOR]
        now = timezone.now()

        # Due dates straddle now so the overdue sweep, the overdue filter and
        # due_next_7_days all have subjects on the very first run.
        offsets = (
            [timedelta(days=-d) for d in range(1, 9)]        # past
            + [timedelta(days=d) for d in range(1, 8)]       # within seven days
            + [timedelta(days=d) for d in (20, 45, 90)]      # far future
            + [None] * 4                                     # no deadline
        )

        for index in range(TASK_COUNT):
            status = TaskStatus.values[index % len(TaskStatus.values)]
            offset = offsets[index % len(offsets)]
            Task.objects.create(
                title=f"Demo task {index + 1:02d}",
                description="Seeded for review. Edit freely.",
                status=status,
                # The check constraint requires these two to agree.
                completed_at=now if status == TaskStatus.COMPLETED else None,
                due_date=None if offset is None else now + offset,
                assignee=random.choice(operators),
                created_by=supervisor,
            )
```

`SETTINGS_MODULE` is read from `settings` rather than `os.environ` so the test can override it; Django populates it automatically.

- [ ] **Step 4: Run the tests and the command**

```bash
uv run --directory backend pytest apps/users/tests/test_seed_command.py -q
```

```bash
docker compose up -d db
```

```bash
docker compose exec backend python manage.py migrate
```

```bash
docker compose exec backend python manage.py seed_demo_data
```

- [ ] **Step 5: Append to README and commit**

Fill in **Demo credentials**: the five accounts, the shared password, the single command, and a note that the database comes up populated so filtering and pagination are visible immediately.

```bash
git add backend/apps/users/management backend/apps/users/tests/test_seed_command.py README.md
git commit -m "feat: add idempotent demo data seeding command"
```

**DoD:** B10, B13.

---

### Task 40: drf-spectacular and `compat` stage 3

**Files:**
- Modify: `backend/config/settings/base.py`, `backend/config/urls.py`
- Modify: `backend/apps/users/views.py`, `backend/apps/tasks/views.py` (schema annotations)
- Create: `backend/apps/core/tests/test_schema.py`
- Modify: `.github/workflows/ci.yml`

D4. drf-spectacular serves a Swagger UI alongside ReDoc, so nothing is lost for anyone expecting Swagger.

- [ ] **Step 1: Configure it**

```python
# config/settings/base.py
SPECTACULAR_SETTINGS = {
    "TITLE": "Task Management API",
    "DESCRIPTION": "Role-based task management. Three roles with strictly separated capabilities.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
}
```

```python
# config/urls.py
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns += [
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/v1/schema/swagger-ui/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/v1/schema/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
]
```

- [ ] **Step 2: Annotate what the generator cannot infer**

Plain `Serializer` write classes and hand-written actions give drf-spectacular nothing to infer from, so annotate them with `@extend_schema`. At minimum:

- `UserViewSet.create` / `partial_update` — request and 201/200 response bodies
- `TaskViewSet.create` / `partial_update` — likewise
- `TaskViewSet.complete` — no request body, `TaskDetailSerializer` response, plus the 409 case
- `TaskViewSet.stats` — an inline response schema for the §8.5 shape
- `LoginView`, `RefreshView`, `LogoutView` — request/response and the fact that refresh reads a cookie

```python
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers

    @extend_schema(
        request=None,
        responses={
            200: TaskDetailSerializer,
            409: OpenApiResponse(description="The task is already in a terminal status."),
        },
    )
    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, *args, **kwargs):
        ...

    @extend_schema(
        responses=inline_serializer(
            name="TaskStats",
            fields={
                "total": serializers.IntegerField(),
                "by_status": serializers.DictField(child=serializers.IntegerField()),
                "overdue": serializers.IntegerField(),
                "due_next_7_days": serializers.IntegerField(),
            },
        )
    )
    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request, *args, **kwargs):
        ...
```

- [ ] **Step 3: Write the schema tests**

```python
# apps/core/tests/test_schema.py
import pytest

pytestmark = pytest.mark.django_db


def test_the_schema_generates_without_warnings(capsys):
    """A generator warning means an endpoint is documented wrongly, which is
    worse than not documented at all."""
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(request=None, public=True)
    captured = capsys.readouterr()
    assert "Error" not in captured.err, captured.err
    assert schema["openapi"].startswith("3.")


def test_every_documented_endpoint_is_present():
    from drf_spectacular.generators import SchemaGenerator

    paths = SchemaGenerator().get_schema(request=None, public=True)["paths"]
    for expected in (
        "/api/v1/auth/login/", "/api/v1/auth/refresh/", "/api/v1/auth/logout/",
        "/api/v1/users/", "/api/v1/users/{id}/", "/api/v1/users/me/",
        "/api/v1/tasks/", "/api/v1/tasks/{id}/",
        "/api/v1/tasks/{id}/complete/", "/api/v1/tasks/stats/",
    ):
        assert expected in paths, expected


def test_ids_are_documented_as_uuid_strings():
    """D28's knock-on effect: a client generated from this schema must not
    expect an integer.

    NOTE: run Step 4 FIRST and read the generated schema.yaml to find the real
    component name, then pin it here. With COMPONENT_SPLIT_REQUEST: True the task
    components are named per-serializer (TaskList / TaskDetail), not "Task", so
    writing "Task" would make this test born red.
    """
    from drf_spectacular.generators import SchemaGenerator

    schema = SchemaGenerator().get_schema(request=None, public=True)
    task = schema["components"]["schemas"]["TaskList"]["properties"]["id"]
    assert task["type"] == "string"
    assert task["format"] == "uuid"


def test_the_schema_endpoints_are_reachable(supervisor_client):
    assert supervisor_client.get("/api/v1/schema/").status_code == 200
    assert supervisor_client.get("/api/v1/schema/swagger-ui/").status_code == 200
    assert supervisor_client.get("/api/v1/schema/redoc/").status_code == 200
```

Run Step 4 before running these tests, read `schema.yaml`, and pin the real component name in the third test — see its docstring.

- [ ] **Step 4: Validate the schema from the command line**

Write to a real file rather than `/dev/null`, which does not exist on the Windows development host:

```bash
uv run --directory backend python manage.py spectacular --validate --file schema.yaml
```

Expected: no errors. Append `backend/schema.yaml` to the **existing root `.gitignore`** (it is already in the repository and already covers the Python artifacts) — the schema is a build artifact, and committing it would create a second source of truth that silently goes stale. Resolve every warning rather than silencing it: a wrong schema is worse than a missing one.

- [ ] **Step 5: Extend `compat` with stage 3**

```yaml
      # Stage 3: drf-spectacular 0.30.0 — which classifies Django 6.0 but is not
      # tested above it — still produces a valid OpenAPI 3 document (D4).
      - name: Generate and validate the OpenAPI schema
        run: uv run --directory backend python manage.py spectacular --validate --file schema.yaml
```

`compat` is now complete at all three stages. It is a **deliberately temporary, risk-specific** control: when a simplejwt release containing PR #959 ships, D3's exit criterion is taken, D1 relaxes toward Django 6.1, and this job can be deleted. Record that in the README so the job's lifespan is not a mystery to whoever inherits it.

- [ ] **Step 6: Run everything and commit**

```bash
uv run --directory backend pytest -q
```

```bash
git add backend/config backend/apps/users/views.py backend/apps/tasks/views.py backend/apps/core/tests/test_schema.py .github/workflows/ci.yml .gitignore README.md
git commit -m "feat: add drf-spectacular OpenAPI 3 schema with Swagger UI and ReDoc"
```

**DoD:** B9, B10.

---

## Phase 9 — Frontend foundation

Spec §15 phase 9. Phase 9 ships the **login tests** alongside the login screen, so the new `frontend` CI job is meaningful — not merely green — the moment it exists. (`vitest run` exits non-zero with no test files, and `--passWithNoTests` would paper over that.)

### Task 41: Vite, TypeScript, Tailwind

**Files:**
- Create: `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `eslint.config.js`, `.gitignore`
- Create: `frontend/src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Create: `frontend/src/test/setup.ts`, `src/test/msw-server.ts`, `src/test/msw-handlers.ts`
- Modify: `docker-compose.yml` (uncomment the `frontend` service)

- [ ] **Step 1: Scaffold into a temp directory, then copy in**

`frontend/` is **not empty** — it already holds the repository's read-only `frontend/AGENTS.md` plus the `Dockerfile` and `.dockerignore` from Task 4. Running the scaffolder directly there prompts "Directory not empty — remove existing files and continue?", which stalls a non-interactive run and risks deleting `AGENTS.md`.

```bash
npm create vite@latest "$TMPDIR/tms-frontend" -- --template react-ts
```

On Windows use the session scratchpad directory instead of `$TMPDIR`. Then copy everything except `node_modules` into `frontend/`, leaving the three existing files in place:

```bash
cp -r "$TMPDIR/tms-frontend/." frontend/
```

```bash
git -C . status --short frontend/
```

Confirm `frontend/AGENTS.md`, `frontend/Dockerfile` and `frontend/.dockerignore` are **unmodified** before continuing.

```bash
npm --prefix frontend install
```

- [ ] **Step 2: Add the project dependencies**

```bash
npm --prefix frontend install @tanstack/react-router @tanstack/react-query clsx
```

**Tailwind is pinned to v3 deliberately.** Tailwind 4 no longer reads `tailwind.config.js`, no longer ships a `tailwindcss` PostCSS plugin (it is `@tailwindcss/postcss`), and replaces the `@tailwind` directives with `@import "tailwindcss"` plus CSS-first `@theme`. Installing unpinned would leave the `status.*` tokens in Step 3 and every utility class **silently absent** — nothing errors, the styles just never appear. Spec §11.6 specifies `tailwind.config.js` as the token home, so v3 is the matching major.

```bash
npm --prefix frontend install -D "tailwindcss@^3" postcss autoprefixer
```

Then generate both config files, so the v3 PostCSS plugin is actually wired up — pinning the version alone leaves the *same* silent failure (config present, zero utility CSS emitted, nothing errors):

```bash
npx --prefix frontend tailwindcss init -p
```

That writes `tailwind.config.js` (overwritten by Step 3) and `postcss.config.js`. Confirm the latter reads:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

If the generator emits CommonJS (`module.exports`) while `package.json` has `"type": "module"`, rename it to `postcss.config.cjs` or convert it to the `export default` form above.

```bash
npm --prefix frontend install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw eslint
```

- [ ] **Step 3: Configure Tailwind with design tokens**

`tailwind.config.js` — tokens live here so there is a single source of truth for spacing, colour and typography rather than every feature inventing its own values (`frontend §6`):

```js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        status: {
          pending: "#64748b",
          progress: "#2563eb",
          completed: "#16a34a",
          cancelled: "#94a3b8",
          overdue: "#dc2626",
        },
      },
    },
  },
  plugins: [],
};
```

`src/index.css` carries only the three layer directives, a reset, and theme-level CSS variables — no feature-specific global CSS. The directives are not optional boilerplate: without them Tailwind emits nothing, with no error.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Verify before moving on: `main.tsx` must `import "./index.css"`, and a throwaway `<div className="p-4 text-status-overdue">` should render with padding and the token colour in `npm run dev`. If it renders unstyled, the PostCSS wiring from Step 2 is the thing to check.

- [ ] **Step 4: Configure Vitest**

In `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

`src/test/setup.ts` installs `@testing-library/jest-dom`, starts the MSW server, and — importantly — **fails a test on an unexpected console error**, since `frontend §7` treats a console warning as a bug rather than noise:

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";

import { server } from "./msw-server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// frontend §9: no console errors or warnings in the flows touched.
// Messages are COLLECTED and asserted in afterEach rather than thrown from
// inside console.error — throwing mid-React-render unwinds the renderer and
// produces a stack trace that hides the actual message.
const original = { error: console.error, warn: console.warn };
let captured: string[] = [];
let allowed: RegExp[] = [];

/**
 * Opt out of the console guard for one expected message.
 *
 * Needed because React itself writes to console.error for act() warnings and
 * error-boundary reports, and several planned tests deliberately render an
 * error state. Without this, those tests would fail on console noise rather
 * than on behaviour — which teaches people to delete the guard.
 */
export function allowConsole(pattern: RegExp): void {
  allowed.push(pattern);
}

beforeEach(() => {
  captured = [];
  allowed = [];
  console.error = (...args) => captured.push(`error: ${args.join(" ")}`);
  console.warn = (...args) => captured.push(`warn: ${args.join(" ")}`);
});

afterEach(() => {
  console.error = original.error;
  console.warn = original.warn;
  const unexpected = captured.filter((line) => !allowed.some((p) => p.test(line)));
  expect(unexpected, "unexpected console output").toEqual([]);
});
```

Use `allowConsole(/.../)` with a **specific** pattern in a test that expects a message, never a catch-all — an allowlist of `/.*/ ` is the guard deleted with extra steps.

Also create `src/test/msw-server.ts` **now**, not in Task 42 — `setup.ts` imports it, so deferring it makes `tsc --noEmit` fail at the end of this task with `TS2307`:

```ts
// src/test/msw-server.ts
import { setupServer } from "msw/node";

import { handlers } from "./msw-handlers";

export const server = setupServer(...handlers);
```

```ts
// src/test/msw-handlers.ts — defaults each test overrides with server.use()
export const handlers = [];
```

- [ ] **Step 5: Add the npm scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

- [ ] **Step 6: Uncomment the `frontend` Compose service**

The service exists so `docker compose up` brings the whole stack up at `localhost:5173`. Day-to-day frontend work still runs `npm run dev` natively, because Vite's HMR is noticeably faster against the native filesystem than through a bind-mounted `node_modules` — especially on Windows. The anonymous `node_modules` volume is what keeps the container's install from being shadowed by the bind mount.

- [ ] **Step 7: Verify, then commit**

```bash
npm --prefix frontend run typecheck
```

```bash
npm --prefix frontend run dev
```

Expected: the dev server serves on 5173. Stop it.

```bash
docker compose build frontend
```

```bash
git add frontend docker-compose.yml
git commit -m "chore: scaffold the React + Vite + Tailwind frontend"
```

**DoD:** F5 (tokens configured).

---

### Task 42: The API client

**Files:**
- Create: `frontend/src/lib/api-error.ts`, `src/lib/api-client.ts`
- Create: `frontend/src/test/msw-server.ts`, `src/test/msw-handlers.ts`
- Create: `frontend/src/lib/api-client.test.ts`

`frontend §5`: this is the only place HTTP happens. Feature `services/` call it; components never call `fetch`.

- [ ] **Step 1: Write the failing tests**

The single-flight test is the one that earns its place. Without it, five parallel queries hitting a just-expired token fire five refresh calls which then race each other — and because rotation is enabled, the losers present an already-rotated token and force a spurious logout.

```ts
// src/lib/api-client.test.ts
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api-error";
import { apiClient, clearAccessToken, setAccessToken } from "./api-client";
import { server } from "../test/msw-server";

const BASE = "http://localhost:8000/api/v1";

beforeEach(() => clearAccessToken());

describe("request shaping", () => {
  it("prefixes /api/v1 and attaches the bearer token", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        seen = request.headers.get("Authorization");
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] });
      }),
    );
    setAccessToken("token-abc");
    await apiClient.get("/tasks/");
    expect(seen).toBe("Bearer token-abc");
  });

  it("sends credentials so the refresh cookie flows", async () => {
    let credentials: RequestCredentials | undefined;
    const spy = vi.spyOn(globalThis, "fetch");
    server.use(http.get(`${BASE}/tasks/`, () => HttpResponse.json({ results: [] })));
    await apiClient.get("/tasks/");
    credentials = (spy.mock.calls[0][1] as RequestInit).credentials;
    expect(credentials).toBe("include");
    spy.mockRestore();
  });

  it("returns undefined for a 204 instead of trying to parse a body", async () => {
    server.use(http.delete(`${BASE}/tasks/x/`, () => new HttpResponse(null, { status: 204 })));
    await expect(apiClient.delete("/tasks/x/")).resolves.toBeUndefined();
  });
});

describe("error normalization", () => {
  it("turns the backend error shape into a typed ApiError", async () => {
    server.use(
      http.post(`${BASE}/tasks/`, () =>
        HttpResponse.json(
          { detail: "Your role cannot choose a task's assignee.", code: "assignee_immutable", errors: null },
          { status: 400 },
        ),
      ),
    );
    const error = await apiClient.post("/tasks/", {}).catch((e) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("assignee_immutable");
    expect(error.errors).toBeNull();
  });

  it("carries the per-field map for a validation error", async () => {
    server.use(
      http.post(`${BASE}/users/`, () =>
        HttpResponse.json(
          { detail: "Invalid input.", code: "validation_error", errors: { email: ["Taken."] } },
          { status: 400 },
        ),
      ),
    );
    const error = await apiClient.post("/users/", {}).catch((e) => e as ApiError);
    expect(error.errors).toEqual({ email: ["Taken."] });
    expect(error.fieldError("email")).toBe("Taken.");
  });

  it("survives a non-JSON error body", async () => {
    server.use(http.get(`${BASE}/tasks/`, () => new HttpResponse("<html>502</html>", { status: 502 })));
    const error = await apiClient.get("/tasks/").catch((e) => e as ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("unknown_error");
  });
});

describe("refresh on 401", () => {
  it("refreshes once and retries the original request once", async () => {
    let refreshes = 0;
    let attempts = 0;
    server.use(
      http.get(`${BASE}/tasks/`, () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
        return HttpResponse.json({ results: ["ok"] });
      }),
      http.post(`${BASE}/auth/refresh/`, () => {
        refreshes += 1;
        return HttpResponse.json({ access: "fresh-token" });
      }),
    );
    await expect(apiClient.get<{ results: string[] }>("/tasks/")).resolves.toEqual({ results: ["ok"] });
    expect(refreshes).toBe(1);
    expect(attempts).toBe(2);
  });

  it("shares one in-flight refresh across concurrent 401s", async () => {
    let refreshes = 0;
    const seen = new Set<string>();
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        const token = request.headers.get("Authorization");
        if (!seen.has("refreshed")) {
          return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
        }
        return HttpResponse.json({ token });
      }),
      http.post(`${BASE}/auth/refresh/`, async () => {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen.add("refreshed");
        return HttpResponse.json({ access: "fresh-token" });
      }),
    );
    await Promise.all([
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
    ]);
    expect(refreshes).toBe(1);
  });

  it("does not retry the retry", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/tasks/`, () => {
        attempts += 1;
        return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
      }),
      http.post(`${BASE}/auth/refresh/`, () => HttpResponse.json({ access: "fresh" })),
    );
    await apiClient.get("/tasks/").catch(() => undefined);
    expect(attempts).toBe(2);
  });

  it("clears auth state and signals session expiry when the refresh itself fails", async () => {
    const onSessionExpired = vi.fn();
    server.use(
      http.get(`${BASE}/tasks/`, () => HttpResponse.json({ detail: "x", code: "x" }, { status: 401 })),
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
      ),
    );
    apiClient.onSessionExpired(onSessionExpired);
    await expect(apiClient.get("/tasks/")).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("never attempts to refresh the refresh endpoint itself", async () => {
    let refreshes = 0;
    server.use(
      http.post(`${BASE}/auth/refresh/`, () => {
        refreshes += 1;
        return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
      }),
    );
    await apiClient.post("/auth/refresh/", {}).catch(() => undefined);
    expect(refreshes).toBe(1);
  });
});
```

The last test prevents infinite recursion: a 401 from `/auth/refresh/` must not trigger a refresh.

- [ ] **Step 2: Run to confirm failure**

```bash
npm --prefix frontend run test
```

- [ ] **Step 3: Write `src/lib/api-error.ts`**

```ts
export type FieldErrors = Record<string, string[]> | null;

/** The normalized shape of every backend error (spec §8.7). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: FieldErrors;

  constructor(status: number, detail: string, code: string, errors: FieldErrors = null) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  /** First message for a field, for rendering beside the input. */
  fieldError(field: string): string | undefined {
    return this.errors?.[field]?.[0];
  }
}
```

- [ ] **Step 4: Write `src/lib/api-client.ts`**

```ts
import { ApiError, type FieldErrors } from "./api-error";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000") as string;
const PREFIX = "/api/v1";
const REFRESH_PATH = "/auth/refresh/";

/**
 * The access token lives here, in module memory, and never in localStorage or
 * sessionStorage (root AGENTS.md § Authentication). AuthContext is the only
 * writer; keeping the value out of React state avoids a second copy that could
 * disagree with what the imperative client actually sends.
 */
let accessToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

/** One shared promise, so concurrent 401s do not race each other's rotation. */
let refreshInFlight: Promise<string> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
  refreshInFlight = null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = response.statusText || "Request failed.";
  let code = "unknown_error";
  let errors: FieldErrors = null;
  try {
    const body = (await response.json()) as {
      detail?: string;
      code?: string;
      errors?: FieldErrors;
    };
    detail = body.detail ?? detail;
    code = body.code ?? code;
    errors = body.errors ?? null;
  } catch {
    // A proxy 502 or an HTML error page: keep the status, leave the code unknown.
  }
  return new ApiError(response.status, detail, code, errors);
}

function refreshAccessToken(): Promise<string> {
  if (refreshInFlight === null) {
    refreshInFlight = fetch(`${BASE_URL}${PREFIX}${REFRESH_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (response) => {
        if (!response.ok) throw await toApiError(response);
        const body = (await response.json()) as { access: string };
        accessToken = body.access;
        return body.access;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

type Options = { method?: string; body?: unknown; allowRefresh?: boolean };

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, allowRefresh = true } = options;

  const response = await fetch(`${BASE_URL}${PREFIX}${path}`, {
    method,
    // So the refresh cookie flows. CORS_ALLOW_CREDENTIALS is set server-side.
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Refresh ONCE and retry ONCE. Never refresh the refresh endpoint itself, or
  // a 401 there would recurse forever.
  if (response.status === 401 && allowRefresh && path !== REFRESH_PATH) {
    try {
      await refreshAccessToken();
    } catch (error) {
      clearAccessToken();
      sessionExpiredHandler?.();
      throw error;
    }
    return request<T>(path, { ...options, allowRefresh: false });
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  /** Called when a refresh fails: AuthContext uses it to sign the user out. */
  onSessionExpired: (handler: () => void) => {
    sessionExpiredHandler = handler;
  },
};
```

- [ ] **Step 5: Fill in the shared MSW handlers**

`src/test/msw-server.ts` and an empty `msw-handlers.ts` were created in Task 41 so `setup.ts` would typecheck. Now populate `handlers` with the defaults every test can rely on — a logged-in `GET /users/me/`, an empty paginated task list, and a zeroed stats payload — so each test overrides only what it cares about.

- [ ] **Step 6: Run the tests**

```bash
npm --prefix frontend run test
```

Expected: all pass, including both refresh tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib frontend/src/test
git commit -m "feat: add the centralized API client with single-flight token refresh"
```

**DoD:** F3, F6, F7.

---

### Task 43: Auth context, router, and role guards

**Files:**
- Create: `frontend/src/features/auth/AuthContext.tsx`, `types.ts`, `services/auth-service.ts`, `hooks/useAuth.ts`
- Create: `frontend/src/app/providers.tsx`, `src/app/router.tsx`, `src/app/layout/AppShell.tsx`
- Create: `frontend/src/features/auth/auth-routing.test.tsx`
- Modify: `frontend/src/main.tsx`

Route guards are **UX only** (root `AGENTS.md §4`): they prevent a confusing blank screen, not unauthorized access. The backend enforces every rule regardless of what the SPA renders, and Task 32's matrix suite tests that directly.

- [ ] **Step 1: Write the failing landing-redirect tests**

```tsx
// src/features/auth/auth-routing.test.tsx
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";

const ME = "http://localhost:8000/api/v1/users/me/";

function meAs(role: "ADMIN" | "SUPERVISOR" | "OPERATOR") {
  server.use(
    http.get(ME, () =>
      HttpResponse.json({
        id: "0199a0f0-0000-7000-8000-000000000001",
        email: `${role.toLowerCase()}@example.com`,
        first_name: "A",
        last_name: "B",
        role,
      }),
    ),
  );
}

describe("role landing pages", () => {
  it("sends an Admin to the user list, which is their landing page", async () => {
    meAs("ADMIN");
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /users/i })).toBeInTheDocument();
  });

  it("sends a Supervisor to the dashboard", async () => {
    meAs("SUPERVISOR");
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("sends an Operator to the dashboard", async () => {
    meAs("OPERATOR");
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("never renders a task route for an Admin, matching the backend 403", async () => {
    meAs("ADMIN");
    await renderApp("/tasks");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /users/i })).toBeInTheDocument();
  });

  it("keeps an Operator out of the admin user list", async () => {
    meAs("OPERATOR");
    await renderApp("/users");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("sends an unauthenticated visitor to the login page", async () => {
    server.use(http.get(ME, () => HttpResponse.json({ detail: "x", code: "x" }, { status: 401 })));
    await renderApp("/tasks");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});
```

Write `src/test/render-app.tsx` as a helper that mounts the real router at a given path inside the real providers — the tests then exercise routing rather than a stub.

- [ ] **Step 2: Write the auth types, service, and context**

```ts
// src/features/auth/types.ts
export type Role = "ADMIN" | "SUPERVISOR" | "OPERATOR";

export interface CurrentUser {
  id: string;        // UUIDv7 string, never a number (D28)
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface LoginResponse {
  access: string;
  user: CurrentUser;
}
```

```ts
// src/features/auth/services/auth-service.ts
import { apiClient } from "../../../lib/api-client";
import type { CurrentUser, LoginResponse } from "../types";

export const login = (email: string, password: string) =>
  apiClient.post<LoginResponse>("/auth/login/", { email, password });

export const logout = () => apiClient.post<void>("/auth/logout/", {});

export const fetchCurrentUser = () => apiClient.get<CurrentUser>("/users/me/");
```

`AuthContext` holds the **current user** (shared client state, `frontend §4`) and drives the client's token via `setAccessToken`/`clearAccessToken`. On mount it calls `fetchCurrentUser()`; a 401 there simply means "not signed in". It registers `apiClient.onSessionExpired` to clear state and send the user to `/login`.

- [ ] **Step 3: Write the router**

A **code-based** route tree: one `router.tsx` shows the entire route map and its guards together, which matters most on the surface where role gating lives.

```tsx
// src/app/router.tsx — the whole route map and every guard, in one place.
const LANDING_FOR_ROLE: Record<Role, string> = {
  ADMIN: "/users",       // an Admin has no dashboard: D13 gives them no task surface
  SUPERVISOR: "/dashboard",
  OPERATOR: "/dashboard",
};

const ROUTE_ROLES: Record<string, Role[]> = {
  "/dashboard": ["SUPERVISOR", "OPERATOR"],
  "/tasks": ["SUPERVISOR", "OPERATOR"],
  "/tasks/new": ["SUPERVISOR", "OPERATOR"],
  "/tasks/$taskId": ["SUPERVISOR", "OPERATOR"],
  "/users": ["ADMIN"],
  "/users/new": ["ADMIN"],
  "/users/$userId": ["ADMIN"],
};
```

Two ordering rules the route tree must honour:

- **`/tasks/new` and `/users/new` are registered BEFORE their `$id` siblings**, so the static segment is not captured as an id.
- Creation is a **route, not a modal**, for both resources: it is deep-linkable, guarded by exactly the same mechanism as every other route, and it keeps create and edit as one component with two modes rather than two divergent surfaces.

Each guarded route's `beforeLoad` redirects to `/login` when there is no user, and to `LANDING_FOR_ROLE[role]` when the role is not in `ROUTE_ROLES`.

- [ ] **Step 4: Write `providers.tsx` and update `main.tsx`**

```tsx
// src/app/providers.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        // The client already handles 401 by refreshing once; retrying a 4xx
        // here would just repeat a refusal.
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      staleTime: 30_000,
    },
  },
});
```

- [ ] **Step 5: Run the tests**

```bash
npm --prefix frontend run test
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auth frontend/src/app frontend/src/main.tsx frontend/src/test
git commit -m "feat: add auth context, code-based router and role landing redirects"
```

**DoD:** F1, F2, F4, F6, F7.

---

### Task 44: The login screen and the `frontend` CI job

**Files:**
- Create: `frontend/src/features/auth/LoginPage.tsx`, `LoginPage.test.tsx`
- Create: `frontend/src/components/` (`Button.tsx`, `TextField.tsx`, `FormError.tsx`)
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/auth/LoginPage.test.tsx
describe("LoginPage", () => {
  it("signs in and lands on the role's page", async () => { /* ... */ });

  it("shows the server's message for bad credentials rather than inventing one", async () => {
    // 401 { detail: "No active account found with the given credentials." }
    // -> that exact text must be on screen (F3)
  });

  it("shows a distinct message when rate-limited", async () => {
    // 429 -> "too many attempts, try again shortly", NOT the generic 401 copy
  });

  it("surfaces per-field validation errors beside their inputs", async () => {
    // 400 { code: "validation_error", errors: { email: ["Enter a valid email."] } }
  });

  it("disables the submit button while the request is in flight", async () => { /* F2 */ });

  it("never writes the access token to localStorage or sessionStorage", async () => {
    // Root AGENTS.md § Authentication, asserted rather than trusted.
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Build the three shared primitives and the page**

Tailwind utilities in JSX, mobile-first, `clsx` for conditional classes. No CSS-in-JS and no parallel BEM convention.

The 429 branch reads `error.status === 429` rather than matching on `detail` text — the backend's throttle message is not a contract, the status is.

- [ ] **Step 3: Run and verify responsively**

```bash
npm --prefix frontend run test
```

```bash
npm --prefix frontend run typecheck
```

Check the page at mobile, tablet and desktop widths before considering it done.

- [ ] **Step 4: Add the `frontend` CI job**

```yaml
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm --prefix frontend ci
      - run: npm --prefix frontend run typecheck
      - run: npm --prefix frontend run lint
      # Meaningful from the moment it exists: the login tests ship with the
      # login screen, so --passWithNoTests is never needed (spec §13).
      - run: npm --prefix frontend run test
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src .github/workflows/ci.yml
git commit -m "feat: add the login screen with its tests and the frontend CI job"
```

**DoD:** F1, F2, F3, F5, F6, F7.

---

## Phase 10 — Frontend features

Spec §15 phase 10.

### Task 45: The tasks data layer

**Files:**
- Create: `frontend/src/features/tasks/types.ts`, `services/task-service.ts`, `hooks/useTasks.ts`, `hooks/useTaskMutations.ts`
- Create: `frontend/src/features/tasks/hooks/useTasks.test.tsx`

- [ ] **Step 1: Write the types**

Every `id` is a `string`, never a `number` (D28). Mirror the §8.2 serializer shapes exactly, and the §8.3 pagination envelope as a generic `Paginated<T>`.

- [ ] **Step 2: Write the service and hooks**

Query keys are structured for precise invalidation:

```ts
export const taskKeys = {
  all: ["tasks"] as const,
  list: (filters: TaskFilters) => ["tasks", filters] as const,
  detail: (id: string) => ["tasks", id] as const,
  stats: ["tasks", "stats"] as const,
};
```

**Every task mutation invalidates `["tasks"]` AND `["tasks", "stats"]`**, so the dashboard cannot go stale after an edit. Put that in one `invalidateTasks(queryClient)` helper used by every mutation hook rather than repeating two calls in five places.

- [ ] **Step 3: Write the hook tests**

Loading, error and success rendering for `useTasks`; that a create invalidates both keys; that a 400 `assignee_immutable` reaches the caller as a typed `ApiError`.

- [ ] **Step 4: Run and commit**

```bash
npm --prefix frontend run test
```

```bash
git add frontend/src/features/tasks
git commit -m "feat: add task types, service and TanStack Query hooks"
```

**DoD:** F1, F2, F3, F6, F7.

---

### Task 46: The task list

**Files:**
- Create: `frontend/src/features/tasks/TaskListPage.tsx`, `components/TaskFilters.tsx`, `components/TaskTable.tsx`, `components/TaskCard.tsx`, `components/StatusBadge.tsx`, `components/Pagination.tsx`
- Create: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
describe("TaskListPage", () => {
  it("renders the page of tasks the API returned", async () => { /* ... */ });
  it("shows an empty state rather than an empty table", async () => { /* F2 */ });
  it("shows an error state when the request fails", async () => { /* F2 */ });
  it("sends status as repeated query parameters for a multi-select", async () => {
    // ?status=PENDING&status=IN_PROGRESS — matching §8.4's status__in
  });
  it("sends overdue=true when the overdue filter is on", async () => { /* ... */ });
  it("resets to page 1 when a filter changes", async () => {
    // otherwise a filter applied on page 3 shows an empty page
  });
  it("hides the assignee column for an Operator", async () => { /* F4 */ });
  it("shows the assignee column for a Supervisor", async () => { /* F4 */ });
  it("hides the delete control for an Operator on a task they did not create", async () => {
    // The UX mirror of D27: never offer an action the backend will refuse.
  });
  it("shows the delete control for an Operator on a task they created", async () => { /* ... */ });
  it("completes a task inline and refreshes the list", async () => { /* ... */ });
});
```

- [ ] **Step 2: Build the components**

- Filters for status (multi-select), due-date range and overdue; sortable columns via `?ordering=`.
- Pagination driven by the `count`/`next`/`previous` envelope.
- **The table collapses to stacked `TaskCard`s below `md`** — the responsive requirement of spec §11.6, and the reason `TaskCard` exists as a separate component rather than a CSS variant.
- Filter state is local UI state (`useState` + the URL search params), never TanStack Query cache and never Context.
- `StatusBadge` uses the `status.*` tokens from `tailwind.config.js`, not arbitrary hex values.

- [ ] **Step 3: Run, check all three breakpoints, commit**

```bash
npm --prefix frontend run test
```

```bash
git add frontend/src/features/tasks
git commit -m "feat: add the task list with filters, pagination and responsive cards"
```

**DoD:** F1, F2, F3, F4, F5, F6, F7.

---

### Task 47: Task create, edit, and completion

**Files:**
- Create: `frontend/src/features/tasks/TaskFormPage.tsx`, `components/TaskForm.tsx`, `TaskDetailPage.tsx`
- Create: `frontend/src/features/tasks/TaskForm.test.tsx`
- Create: `frontend/src/features/users/hooks/useAssignableUsers.ts`

One form component serving `/tasks/new` and `/tasks/:id`, in two modes.

- [ ] **Step 1: Write the failing tests**

Four of these encode rules the backend also enforces, and exist so the UI never offers something the API will refuse:

```tsx
describe("TaskForm", () => {
  it("creates a task and invalidates the list", async () => {
    // frontend §7 names task creation a priority path
  });

  it("omits the assignee field entirely for an Operator", async () => {
    // D15/D16: on create the backend defaults it to self, on update it is
    // immutable — so rendering the field would offer a choice that cannot work.
    expect(screen.queryByLabelText(/assignee/i)).not.toBeInTheDocument();
  });

  it("renders the assignee field for a Supervisor, populated from GET /users/", async () => {
    // The minimal serializer is what fills this picker.
  });

  it("renders the status select in edit mode only", async () => {
    // TaskCreateSerializer accepts no status field: a new task is always
    // PENDING, so a select on create would offer a choice the API discards.
  });

  it("never offers COMPLETED in the status select", async () => {
    // Completion is a button hitting /complete/, mirroring D18's single path.
    expect(screen.queryByRole("option", { name: /completed/i })).not.toBeInTheDocument();
  });

  it("surfaces a 400 assignee_not_assignable against the assignee field", async () => { /* F3 */ });

  it("surfaces a 409 invalid_status_transition as a form-level message", async () => { /* F3 */ });

  it("shows the complete button only for a non-terminal task", async () => { /* F4 */ });

  it("completes a task through POST /complete/ and refreshes detail and stats", async () => { /* ... */ });
});
```

- [ ] **Step 2: Build the form**

Error mapping is the part worth getting right: `ApiError.fieldError(name)` drives per-field messages, and a top-level `code` that is not `validation_error` renders as a form-level message. Both assignee codes are distinguished by `code` alone, never by parsing `detail` — which is exactly why spec §8.7 keeps them separate.

- [ ] **Step 3: Run, check breakpoints, commit**

```bash
git add frontend/src/features
git commit -m "feat: add the task create/edit form and the completion action"
```

**DoD:** F1, F2, F3, F4, F5, F6, F7.

---

### Task 48: User CRUD (Admin)

**Files:**
- Create: `frontend/src/features/users/UserListPage.tsx`, `UserFormPage.tsx`, `components/UserForm.tsx`, `components/DeleteUserDialog.tsx`, `types.ts`, `services/user-service.ts`, `hooks/useUsers.ts`
- Create: `frontend/src/features/users/UserListPage.test.tsx`, `UserForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Paginated list with role and active filters plus search; one form serving `/users/new` and `/users/:id`; and a delete confirmation dialog that **states plainly that deletion is a deactivation** — the user is hidden from the API and cannot log in, but the row and its audit trail remain, and there is no restore path through the API (spec §16.1).

```tsx
it("states in the delete dialog that deletion is a deactivation", async () => { /* ... */ });
it("surfaces a 400 email_already_in_use against the email field", async () => { /* F3 */ });
it("does not send an empty password field on edit", async () => {
  // Password is optional on update; sending "" would fail validation.
});
```

- [ ] **Step 2: Build the pages, run, commit**

```bash
git add frontend/src/features/users
git commit -m "feat: add admin user list, form and delete confirmation"
```

**DoD:** F1, F2, F3, F4, F5, F6, F7.

---

### Task 49: The statistics dashboard

**Files:**
- Create: `frontend/src/features/dashboard/StatsPage.tsx`, `components/StatTile.tsx`, `components/StatusDistributionBar.tsx`, `hooks/useTaskStats.ts`
- Create: `frontend/src/features/dashboard/StatsPage.test.tsx`

No charting library (D7): the dashboard presents six numbers, and stat tiles plus a CSS-grid distribution bar satisfy that. Trivially swappable later.

- [ ] **Step 1: Write the failing tests**

**The drill-through link assertions are the point of this task.** A link whose list count differs from the tile it came from reads as a bug, so each link must carry the tile's *full* predicate.

```tsx
describe("StatsPage", () => {
  it("renders all six figures from one GET /tasks/stats/ call", async () => {
    // four status counts + overdue + due_next_7_days, consuming all four keys
  });

  it("shows loading and error states", async () => { /* F2 */ });

  it("handles an all-zero response without dividing by zero in the bar", async () => {
    // total: 0 — the distribution bar must render, not NaN
  });

  it("links a status tile to that status's list", async () => {
    expect(link).toHaveAttribute("href", expect.stringContaining("/tasks?status=PENDING"));
  });

  it("links the overdue tile to overdue=true", async () => {
    expect(link).toHaveAttribute("href", expect.stringContaining("overdue=true"));
  });

  it("links the due-soon tile with the full predicate, not just a date bound", async () => {
    // due_next_7_days excludes nulls AND terminal statuses, so linking on
    // due_date_before alone would also pull in every past-due task and every
    // completed task with a due date — a list visibly larger than the tile.
    const href = link.getAttribute("href")!;
    expect(href).toContain("due_date_after=");
    expect(href).toContain("due_date_before=");
    expect(href).toContain("status=PENDING");
    expect(href).toContain("status=IN_PROGRESS");
  });

  it("renders identically for a Supervisor and an Operator", async () => {
    // The backend scopes the response, so the component does not branch at all.
  });
});
```

- [ ] **Step 2: Build it, run, check breakpoints, commit**

```bash
git add frontend/src/features/dashboard
git commit -m "feat: add the statistics dashboard with exact drill-through links"
```

**DoD:** F1, F2, F4, F5, F6, F7.

---

## Phase 11 — Test completion and the coverage gate

### Task 50: Remaining frontend tests

**Files:**
- Modify/create: test files across `frontend/src/features/`

Spec §12.4. There is no numeric coverage gate on the frontend (`frontend §7`) — prioritize the paths a bug would actually be visible in.

- [ ] **Step 1: Audit §12.4 against what exists**

Walk the spec's list and tick off what Tasks 42–49 already cover. What typically remains: the role-based landing redirect for all three roles (Task 43 — verify), the complete action end to end, and the single-flight refresh under concurrent 401s (Task 42 — verify).

- [ ] **Step 2: Fill the gaps, then confirm the whole suite is clean**

```bash
npm --prefix frontend run test
```

```bash
npm --prefix frontend run typecheck
```

```bash
npm --prefix frontend run lint
```

No console errors or warnings in any flow — the `setup.ts` guard from Task 41 makes that a test failure rather than a judgement call.

- [ ] **Step 3: Commit**

```bash
git add frontend/src
git commit -m "test: complete the frontend test coverage from spec §12.4"
```

**DoD:** F6.

---

### Task 51: Backend coverage to 80% and the gate

**Files:**
- Modify: `backend/pyproject.toml`, `.github/workflows/ci.yml`
- Create: additional tests wherever the report shows a real gap

Spec §12.1: the gate is enabled **only from this phase**, because coverage cannot reach it while the suite is still being written.

- [ ] **Step 1: Measure**

```bash
uv run --directory backend pytest --cov=apps --cov-report=term-missing
```

- [ ] **Step 2: Read the report with judgement, not as a number to hit**

Coverage is concentrated on authentication, authorization and task operations rather than chased on trivial code (`backend §36`). For each uncovered block, decide:

- **A real gap** — an untested branch of a business rule, an error path, a permission case → write the test.
- **Genuinely trivial** — `__str__`, an `admin.py` declaration, a `Meta` class → add it to `[tool.coverage.report] exclude_also` with a reason, rather than writing a test that asserts nothing.

Likely real gaps at this point: `UserService.update`'s no-op branch, `production.py`, the `create_if_absent` raise-through when the integrity error was not the dedupe key, and `_latest_history_id`'s `None` path.

- [ ] **Step 3: Enable the gate**

```toml
[tool.pytest.ini_options]
addopts = "--strict-markers --cov=apps --cov-report=term-missing --cov-fail-under=80"
```

And in the `backend` CI job, the `pytest` step picks it up from `addopts` — no workflow change needed beyond deleting the now-redundant inline `--cov` flags.

- [ ] **Step 4: Verify the gate actually bites**

```bash
uv run --directory backend pytest -q
```

Temporarily set `--cov-fail-under=99` and confirm the run **fails**. A gate that cannot fail is decoration. Restore 80.

- [ ] **Step 5: Commit**

```bash
git add backend .github/workflows/ci.yml
git commit -m "test: reach 80% backend coverage and enable the CI gate"
```

**DoD:** B10.

---

## Phase 12 — Documentation and CI finalisation

### Task 52: `README.md`, the diagrams, and the final CI pass

**Files:**
- Modify: `README.md`, `docs-external/PROMPT-LOGS.md`, `.github/workflows/ci.yml`

The README has been grown since Task 6; this task polishes rather than writes it. Root `AGENTS.md §7` makes it the primary deliverable for setup and review.

- [ ] **Step 1: Verify every section is complete and current**

| Section | Must contain |
|---|---|
| Quick start | `cp .env.example .env`, `docker compose up`, migrate, seed, the two URLs; plus `npm install` / `npm run dev` for native frontend work and **why** that is the recommended edit loop |
| Running the checks | the exact ruff, mypy, pytest, pre-commit, typecheck, lint and vitest commands — a reviewer must reproduce them without guessing (`backend §44a`) |
| Demo credentials | the five accounts, the shared password, and confirmation that the database comes up populated |
| Architecture | the five mermaid diagrams below, the request-flow layering, and the §7.1 permission matrix |
| Key implementation decisions | the full D1–D28 table from spec §3, condensed to decision + one-line rationale |
| Deliberate overrides of AGENTS.md | the three rows of spec §3.4, plus the `auth.E003` silencing from Task 12 |
| Known limitations and exit criteria | spec §16.1's accepted risks, D3's exit criterion, the `SameSite=Strict` same-site deployment constraint, and the fact that `compat` is deliberately temporary |
| GenAI prompt and validation record | drawn from `PROMPT-LOGS.md`: which prompts were issued, which output was wrong, what had to be corrected |

- [ ] **Step 2: Embed the five mermaid diagrams**

Copy from the spec, which is their source of truth: container architecture (§5.1), ERD (§6.1), task status state machine (§6.4), auth sequence (§9.1), notification dispatch flow (§10.2).

- [ ] **Step 3: Verify every diagram renders**

Paste each into a markdown preview or mermaid.live. A broken diagram in the primary deliverable is worse than no diagram.

- [ ] **Step 4: Final CI pass**

Confirm all four jobs are present and correct: `lint`, `compat` (three stages), `backend` (with the coverage gate), `frontend`. Then verify the pre-commit config still mirrors them with **identical pinned versions** — Task 1 Step 6's ruff version, and the same mypy.

```bash
pre-commit run --all-files
```

- [ ] **Step 5: Verify the whole stack from a clean slate**

This is the reviewer's first experience, so run it as they would:

```bash
docker compose down -v
```

```bash
docker compose up -d --build
```

```bash
docker compose exec backend python manage.py migrate
```

```bash
docker compose exec backend python manage.py seed_demo_data
```

Then, in a browser: log in as each of the three demo roles, confirm each lands where spec §11.2 says, click every dashboard tile and **check that the list count matches the tile**, create and complete a task, and confirm the console is clean. Confirm a notification email appears in the backend log (the console email backend).

```bash
docker compose logs backend --tail 40
```

- [ ] **Step 6: Commit**

```bash
git add README.md docs-external/PROMPT-LOGS.md .github/workflows/ci.yml
git commit -m "docs: finalise README, diagrams and CI configuration"
```

**DoD:** B9, B12, F2, F4.

---

## Phase 13 — Persist insights

### Task 53: Write the insights to `claude-insights/`

**Files:**
- Create or modify: `D:\VirtualWrapper\code\claude-insights\projects\task-management-system.md`
- Modify: `D:\VirtualWrapper\code\claude-insights\debugging-notes.md`

- [ ] **Step 1: Check for an existing file first**

```bash
ls "D:/VirtualWrapper/code/claude-insights/projects/"
```

Update or append — never duplicate.

- [ ] **Step 2: Write what was non-obvious, not what the repo already records**

Architecture and patterns worth carrying forward:

- The `Protocol` + `@abstractmethod` + `@runtime_checkable` repository contract, and specifically **why all three are needed**: without `@abstractmethod` an explicit subclass inherits a `...` body returning `None` and instantiates happily; without `@runtime_checkable` `isinstance` raises `TypeError` even for explicit subclasses.
- `get_service()` on a DRF ViewSet as a composition root, and why a DI container was rejected for a one-level dependency graph.
- The permission matrix as declarative data consumed by both the permission class and a parametrized suite.

Gotchas — the ones that cost real time:

- **`auth.E003` is unavoidable with a partial unique index on `USERNAME_FIELD`.** `Options.total_unique_constraints` deliberately excludes conditional constraints, so the check can only be silenced, and the guarantee must be replaced by a test.
- **Manager order under multiple inheritance is not reliable.** `ModelBackend` uses `_default_manager`, so a soft-delete model that is also the user model must pin `Meta.default_manager_name`.
- **`transaction.on_commit` never fires under `pytest-django`** by default; `django_capture_on_commit_callbacks(execute=True)` is required.
- **`exclude()` on a nullable comparison drops NULL rows**, because `NOT (NULL < x)` is NULL, not TRUE. The `overdue=false` branch must be written positively.
- **`create_if_absent` returning `None` for any existing row makes `autoretry_for` dead code** — the discriminator has to be the existing row's send status.
- **`RolePermission` sees `action is None`** for an HTTP method the router never mapped, because DRF checks permissions before handler lookup; denying there turns a 405 into a 403.

- [ ] **Step 3: Cross-reference and commit**

Link the new file from `cross-project.md` if the patterns are reusable elsewhere.

```bash
git -C "D:/VirtualWrapper/code/claude-insights" add .
```

```bash
git -C "D:/VirtualWrapper/code/claude-insights" commit -m "docs: add task management system insights"
```

**DoD:** documentation task.

---

## Deliverables checklist

From spec §17 — the plan is complete when every box is ticked.

- [ ] Backend: Python 3.14, Django 6.0 and DRF, four apps, migrations, at least 80% coverage
- [ ] UUIDv7 primary keys on every model via stdlib `uuid.uuid7`, with the ordering test that proves it
- [ ] Full layering: views, serializers, services, repositories, selectors — no serializer persists (D8/D9)
- [ ] `Protocol`-based repository contracts, the view as composition root, and the conformance tests that keep fakes honest (D8a)
- [ ] JWT auth with in-memory access token and HttpOnly refresh cookie, blacklist, throttling
- [ ] Strict three-role permission matrix with a matrix-driven test suite, including D27's Operator delete restriction
- [ ] Task CRUD, assignment, `complete/`, filtering by status and due date, pagination, `stats/`
- [ ] `django-simple-history` on `User` and `Task`
- [ ] Soft delete on `User` and `Task` (`Notification` exempt per D20), with a partial unique index and partial indexes
- [ ] Celery and Redis notifications with `on_commit` enqueue and dedupe-based idempotency
- [ ] Celery beat hourly overdue sweep
- [ ] drf-spectacular OpenAPI 3 schema, Swagger UI and ReDoc
- [ ] Frontend: login, task CRUD, user CRUD, statistics dashboard, responsive
- [ ] `docker-compose.yml` with six services, plus backend and frontend Dockerfiles
- [ ] `seed_demo_data` with representative data and documented credentials
- [ ] GitHub Actions: `lint`, `compat`, `backend`, `frontend`, with a matching pre-commit config
- [ ] `README.md`: setup, decision log, demo credentials, and the GenAI prompt/validation record
- [ ] Mermaid diagrams: container architecture, ERD, status state machine, auth sequence, notification flow
- [ ] Insights persisted to `claude-insights/`
