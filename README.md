# Task Management System

A role-based task management system: a Django 6 / Django REST Framework API and a responsive React
single-page app. Supervisors create tasks and assign them to Operators, Operators move their own work
through to completion, and Admins manage the accounts. Task changes send email in the background, and
an hourly sweep emails about overdue work.

> [!TIP]
> **Reviewing this project?** Start with the **[project review guide (SUMMARY.md)](SUMMARY.md)**.
> It maps every requirement of the brief to the code that meets it, and covers:
>
> - the architecture;
> - each decision, and whether the engineer or the AI agent made it;
> - test and coverage results;
> - a step-by-step demo walkthrough;
> - future work.

## Features

| Role | Can |
|---|---|
| **Supervisor** | Create, edit, assign, complete and delete any task; see a statistics dashboard for all tasks |
| **Operator** | See and work only the tasks assigned to them, with a dashboard of their own; create tasks for themselves; delete only tasks they created |
| **Admin** | Create, edit, deactivate and delete users. Admins have no access to tasks at all |

- **Tasks:**
  - create, read, update and delete;
  - assign to a user, and mark completed;
  - filter by status, by due-date range and by overdue;
  - sort, paginate, and choose the page size.

  The list's filters, sort and page live in the URL, so a refreshed or shared list looks the same.
- **Notifications:**
  - email on assignment, on status change and on due-date change, sent by a Celery worker after the
    change commits;
  - an hourly overdue sweep run by Celery beat.
- **Audit trail:** every change to a user or a task is versioned by `django-simple-history`.
- **Security:** JWT authentication with the refresh token in an HttpOnly cookie, rate limiting, and
  every rule enforced by the API, not by the UI.
- **Responsive UI:** tables on desktop, cards with a sort selector on phones and tablets.
- **Traceable logs:** every log line is JSON and carries the id of the request that caused it,
  across the API and the worker.

## Tech stack

| Layer | Technology |
|---|---|
| API | Python 3.14, Django 6.0, Django REST Framework, simplejwt, django-filter, Pydantic |
| API docs | drf-spectacular: OpenAPI 3, Swagger UI and ReDoc |
| Background work | Celery with a Redis broker, Celery beat for the hourly sweep |
| Database | PostgreSQL 16 |
| Frontend | React 19, TypeScript, Vite, TanStack Router and TanStack Query, Tailwind CSS |
| Tests | pytest + pytest-django; Vitest + React Testing Library + MSW |
| Tooling | uv, ruff, mypy, oxlint, pre-commit, GitHub Actions, Docker Compose |

## Quick start

Requires Docker with Docker Compose.

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

```bash
docker compose exec backend python manage.py migrate
```

```bash
docker compose exec backend python manage.py seed_demo_data
```

| What | Where |
|---|---|
| The app | http://localhost:5173 |
| API | http://localhost:8000/api/v1/ |
| Swagger UI | http://localhost:8000/api/v1/schema/swagger-ui/ |
| ReDoc | http://localhost:8000/api/v1/schema/redoc/ |
| Email inbox (MailHog) | http://localhost:8025 |

`.env.example` lists every variable the stack reads; `.env` is never committed.

**If you re-create the database** (`docker compose down -v`), the saved beat schedule survives in
`backend/celerybeat-schedule`, which is gitignored. Beat may then fire the overdue sweep before
`migrate` has run, and the worker logs one harmless `relation "tasks_task" does not exist`. To
avoid it, migrate before starting the rest:

```bash
docker compose up -d db redis backend
```

```bash
docker compose exec backend python manage.py migrate
```

```bash
docker compose up -d
```

## Demo credentials

`seed_demo_data` loads five accounts and 45 tasks, enough for more than two pages. Statuses cycle
through all four values, and due dates straddle today: some overdue, some due within seven days,
some later and some with no due date. Every filter and dashboard card therefore has data on the
first run.

| Email | Role | Name |
|---|---|---|
| `admin@demo.local` | Admin | Ada Admin |
| `supervisor@demo.local` | Supervisor | Sam Supervisor |
| `operator@demo.local` | Operator | Omar Operator |
| `operator2@demo.local` | Operator | Olga Operator |
| `operator3@demo.local` | Operator | Otto Operator |

The password for every demo account is **`DemoPass!2026`**.

For more data, run this:

```bash
docker compose exec backend python manage.py seed_demo_data --users 25 --tasks 300
```

| Flag | Default | Meaning |
|---|---|---|
| `--users N` | `0` | Add N randomly named users (`user1@demo.local`, …) on top of the five fixed accounts |
| `--tasks M` | `45` | Make sure at least M tasks exist |

How the command behaves:
- **Re-running is safe.** It tops up to the requested counts and never deletes or modifies an
  existing account.
- **It refuses to run under production settings.**
- **Assignment is random.** Tasks are assigned at random to non-Admin users, and `created_by` is
  randomised too, so the "Operators delete only what they created" rule is visible in the UI.
- **Generated users share the demo password.** Find them by signing in as `admin@demo.local` and
  opening **Users**.
- **Large values are slow.** Rows are created one at a time, so that `django-simple-history`
  records each one; `bulk_create` would skip the audit trail.

## Running the tests and checks

**Backend.** This runs the suite in the Compose `backend` container, falling back to a local `uv`
environment when the container is not running. The `pre-push` hook runs the same script.

```bash
bash scripts/run-backend-tests.sh
```

Every full run applies a coverage gate of 80%, through `--cov-fail-under=80` in `addopts`. The
suite currently sits at **100%** of `apps/` with 432 tests. The tests use PostgreSQL, not SQLite,
because the schema relies on partial indexes and a check constraint. To run against the Compose
database from the host, use `POSTGRES_PORT=5442 uv run --directory backend pytest -q`.

Lint, format and types run locally, after one `uv sync`:

```bash
uv sync --directory backend
```

```bash
uv run --directory backend ruff check .
```

```bash
uv run --directory backend ruff format --check .
```

```bash
uv run --directory backend mypy
```

**Frontend.** These run from `frontend/`:

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run test
```

303 tests pass. The test setup turns any unexpected `console.error` or `console.warn` into a test
failure, so "no console warnings" is enforced, not just reviewed.

**Git hooks.** Install them once:

```bash
pre-commit install --install-hooks
```

```bash
pre-commit install --hook-type pre-push
```

The hooks pin the same ruff version as `uv.lock`. CI (`.github/workflows/ci.yml`) runs four jobs
on every push:
- `lint`;
- `compat`, which proves that the pinned Django 6.0 / Python 3.14 stack boots;
- `backend`, with Postgres and Redis services;
- `frontend`.

### Working on the frontend natively

Compose serves the SPA, but day-to-day frontend work is faster natively, because Vite's file
watching is slow through a Docker bind mount, especially on Windows. Install from inside
`frontend/`: `npm --prefix` does not change where npm 10 reads `package.json` from.

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

## API overview

All endpoints are under `/api/v1/`. The interactive reference is the Swagger UI above.

| Endpoint | Purpose |
|---|---|
| `POST /auth/login/`, `/auth/refresh/`, `/auth/logout/` | Sign in, rotate the session, sign out. The refresh token travels only as an HttpOnly cookie |
| `GET /users/me/` | The signed-in user |
| `GET POST /users/`, `GET PATCH DELETE /users/{id}/` | User management (Admin; Supervisors get a read-only, minimal view) |
| `GET /users/assignable/` | Searchable, paged list of users a Supervisor may assign |
| `GET POST /tasks/`, `GET PATCH DELETE /tasks/{id}/` | Task CRUD. The list is paged and filtered by `status`, `due_date_after`, `due_date_before`, `overdue` and `assignee`, and sorted by `ordering` |
| `POST /tasks/{id}/complete/` | Mark a task completed: the only way to reach `COMPLETED` |
| `GET /tasks/stats/` | Dashboard counts |

Every error has the same shape, `{"detail", "code", "errors"}`. Which role may call what is in the
[capability matrix](docs/ARCHITECTURE.md#the-capability-matrix).

## Logs

The API and the Celery worker write one JSON object per line to stderr, so
`docker compose logs` shows them. Every line carries a `request_id`:

- **Every response returns it** in the `X-Request-ID` header. To use your own, send an
  `X-Request-ID` header made of letters, digits and `._:-`, up to 128 characters.
- **Worker lines carry it too.** Lines the worker writes for a request, such as its notification
  emails, carry that request's id.
- **One access line per request.** Each request also logs an `http.request` line with the method,
  the path (without the query string), the status, `duration_ms` and `actor_id`.

To follow one request across both processes, search for its id:

```bash
docker compose logs backend worker | grep 01a117fc-4264-7521-9ae3-f93b790ec5c5
```

`DJANGO_LOG_LEVEL` sets the level (default `INFO`). How it works is explained in
[docs/TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md#structured-logs-and-the-request-id-d89d93).

## Project structure

```text
backend/            Django project (config/) and four apps: core, users, tasks, notifications
frontend/           React SPA: app/ (router, layout), features/ (auth, dashboard, tasks, users), lib/, components/
docs/               architecture, technical decisions, GenAI workflow, QA report, design specs and plans
docs-external/      prompt logs
scripts/            backend test runner used by the pre-push hook
docker-compose.yml  db, redis, mailhog, backend, worker, beat, frontend
```

The backend layers are views, then serializers, then services, then repositories, with selectors
for reads. The layout is explained in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Key implementation decisions

The headline decisions, with their numbers in [docs/TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md).
That document also gives:
- the 48 conventions the engineer set in the `AGENTS.md` files before any code (A1–A48);
- all 84 numbered decisions, with the reasoning behind each and whether it was the engineer's call
  or the AI agent's.

- **Strict role separation (D13).** An Admin has no task access at all. An Operator sees only the
  tasks assigned to them (D14) and may delete only tasks they created (D27).
- **The permission matrix is data (D11).** One table is read by the permission class *and* by a
  test that exercises every cell over HTTP, so the rules and their enforcement cannot drift.
- **Layered backend with repository Protocols (D8, D8a).** Services depend on a Protocol, and the
  viewset is the only place a concrete repository is named. A test enforces this dependency
  direction.
- **One write path (D9, D18).** Serializers never save, and `POST /complete/` is the only way to
  complete a task. A database check constraint keeps `completed_at` consistent with the status.
- **Soft delete with an audit trail (D20–D22).** Deleted rows stay for `django-simple-history`. A
  deleted user's email becomes reusable through a partial unique index.
- **Safe background email.** Emails are enqueued only after the transaction commits, deduplicated
  by a unique key so a retry never sends twice, retried only on transport errors, and sent only to
  users who can still read the task (D26).
- **UUIDv7 primary keys (D28).** Ids are not enumerable, while index locality stays close to a
  sequential integer's.
- **Tokens.** The access token lives in memory only, and the refresh token is an HttpOnly,
  `SameSite=Strict` cookie that rotates and is revoked on logout. On page load the app restores the
  session by refreshing first (D35).
- **The URL holds list state (D45).** Refresh, Back, shared links and dashboard cards all open the
  same view.
- **Structured logs with a request id (D89–D93).** Every line is JSON and carries the id of the
  request that caused it, including lines written by the Celery worker for that request.
- **drf-spectacular instead of drf-yasg (D4).** drf-yasg's support stops at Django 5.2, and it
  emits only OpenAPI 2.0. drf-spectacular still serves Swagger UI.
- **Departures from the repository's `AGENTS.md` conventions are deliberate.** The main ones
  are the `beat` and `mailhog` services. All five are listed in
  [docs/TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md#deliberate-overrides-of-agentsmd).

Known limitations and accepted risks are listed there too: no restore endpoint for deleted rows, a
git-pinned simplejwt until a release supports Django 6, and same-site deployment of the SPA and the
API.

## Documentation

| Document | What it covers |
|---|---|
| [SUMMARY.md](SUMMARY.md) | Project review guide: the brief's requirements mapped to code and docs |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrams: containers, layers, data model with the history tables, flows, capability matrix, frontend |
| [docs/TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md) | The engineer's `AGENTS.md` conventions (A1–A48); every decision (D1–D78 and D89–D93) with its reason and origin (engineer or AI); known limitations |
| [docs/GENAI-WORKFLOW.md](docs/GENAI-WORKFLOW.md) | How the project was built with an AI agent, and how its output was validated and corrected |
| [docs/qa/2026-10-07-frontend-qa-report.md](docs/qa/2026-10-07-frontend-qa-report.md) | Browser QA of responsiveness, forms and navigation; test and coverage results; re-test after fixes |
| [docs/superpowers/specs/](docs/superpowers/specs/) and [plans/](docs/superpowers/plans/) | The design spec and implementation plan of each iteration |
| [docs-external/PROMPT-LOGS.md](docs-external/PROMPT-LOGS.md) | The prompts given to the AI agent, verbatim |
| [AGENTS.md](AGENTS.md), [backend/AGENTS.md](backend/AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md) | The engineer's conventions for the AI agent: architecture, security, testing and frontend rules |

## Built with GenAI

This project was built with Claude Code as a simulation of a real software project. The code was
written by the AI agent, iterating through specs, plans and reviews, with minimal direct code
intervention by the engineer. The engineer's work was:

- writing the three `AGENTS.md` files before any code: the conventions every agent session must
  follow. Most of the content is the engineer's own, with only small AI help to organise it;
- writing the brief;
- reviewing every spec, plan and change;
- correcting the agent where it was wrong;
- making the decisions.

The prompts are in [docs-external/PROMPT-LOGS.md](docs-external/PROMPT-LOGS.md). How the output was
validated and corrected is in [docs/GENAI-WORKFLOW.md](docs/GENAI-WORKFLOW.md).

## Troubleshooting

- **One `401` from `POST /api/v1/auth/refresh/` on the login page is expected.** On every load, the
  app asks whether a refresh cookie can restore the session; for a visitor who is not signed in,
  the answer is no. A signed-in user sees no failed request.
- **Console noise from `chrome-extension://`** (`MaxListenersExceededWarning`, `ObjectMultiplex`)
  comes from the MetaMask browser extension, not from this app.
- **A `500` at login, with `relation "users_user" does not exist`** in the backend log, means
  `migrate` has not run yet: `docker compose exec backend python manage.py migrate`.
- **Login answers `429`:** sign-in is limited to 5 attempts a minute per IP. Wait a minute.
