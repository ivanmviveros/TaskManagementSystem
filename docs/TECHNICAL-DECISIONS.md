# Technical decisions

Every implementation decision in this project (D1–D94), why it was made, and who made it. The
[README](../README.md) lists only the headline ones. Each decision's full design context lives in the
spec of the iteration that introduced it ([Sources](#sources)).

## Who wrote the code, and who decided

**All code in this repository was written by an AI coding agent (Claude Code).** It worked through
specs, plans, implementation and review cycles, and the engineer wrote almost no code by hand. The
engineer's part was the parts that decide the outcome:

- **Writing the three `AGENTS.md` files** before any work started. They are the standing rules the
  agent had to follow (A1–A48 below). The engineer wrote most of them, with only small AI help to
  organise the files.
- Writing the brief.
- Reviewing every spec, plan and change.
- Correcting the agent where it was wrong.
- Choosing between the options it laid out.

The **Origin** column therefore records who made each *decision*, not who typed the code:

| Origin | Meaning |
|---|---|
| **Engineer** | The engineer decided it outright, in `AGENTS.md`, the brief, a review correction or an explicit instruction. The agent only implemented it. |
| **Engineer + AI** | The engineer set the rule or the goal (in `AGENTS.md` or a prompt), or chose between options the agent laid out. The agent made the specific call within it. |
| **AI** | The agent's own proposal, not prescribed by `AGENTS.md` or a prompt. The engineer reviewed and approved it. |

A decision counts as applying an `AGENTS.md` rule only when a specific section prescribes its
substance. Examples are backend §49's ban on `utils.py` (D10) and frontend §8's "never duplicate
backend business rules" (D39). The general engineering principles in root §2, such as "prefer
framework mechanisms", do not count, or every decision would.

Of the 95 numbered decisions (D1–D94 and D8a), 10 are **Engineer**, 31
**Engineer + AI** and 54 **AI**. The numbered log is mostly design detail. The choices that define the system are the
engineer's, and they come from the two sources below, which predate every numbered decision:
- the **conventions in `AGENTS.md`**: the layering, the security posture, the testing bar and the
  frontend's state model;
- the **brief**: the stack, the roles, the background processing and the quality bar.

## The baseline the engineer set

From the brief prompt (verbatim in [`docs-external/PROMPT-LOGS.md`](../docs-external/PROMPT-LOGS.md)), before
any design work:

| Area | Engineer's requirement | Where it landed |
|---|---|---|
| Backend | Python 3.12+, Django 6+, Django REST Framework | Python 3.14 and Django 6.0 (D1, D2) |
| Package manager | uv | D5: `backend/pyproject.toml` with a committed `uv.lock` |
| Audit | django-simple-history | `HistoricalUser` and `HistoricalTask` ([data model](ARCHITECTURE.md#data-model)) |
| Roles | Admin manages users; Supervisor manages all tasks; Operator manages their own tasks | D13–D17 and the [permission matrix](ARCHITECTURE.md#the-capability-matrix) |
| Authentication | JWT | simplejwt: access token in memory, refresh token in an HttpOnly cookie |
| Security | Authentication, authorization and validation on every operation, independent of the frontend | Permission matrix, object permissions, serializers, services |
| Lists | Pagination; filter tasks by status and due date | `DefaultPageNumberPagination`, `TaskFilterSet` |
| Abuse | Rate limiting | Scoped DRF throttles on a Redis cache |
| Background work | Celery with a Redis broker; email on task updates and for overdue tasks | `apps/notifications`, a Celery `worker` and `beat` |
| Performance | Database indexes; `select_related` / `prefetch_related` where needed | Partial indexes, query-count tests |
| Database | PostgreSQL; schema documented in mermaid | PostgreSQL 16; [Architecture](ARCHITECTURE.md) |
| Tests | pytest; at least 80% coverage | 100% of `apps/`, gate at 80 |
| Containers | Dockerfile and `docker-compose.yml` | Seven Compose services |
| API docs | drf-yasg | **Overridden by D4.** The agent showed that drf-yasg's classifiers stop at Django 5.2 and that it emits only OpenAPI 2.0. The engineer accepted drf-spectacular, which still serves Swagger UI, and which the engineer's own backend §35 already allowed. |
| Frontend | React, responsive and user-friendly; TanStack Router and Query; login; users and tasks CRUD; statistics dashboard | `frontend/` |
| CI | GitHub Actions running ruff, pytest and coverage, matching pre-commit | `.github/workflows/ci.yml` |
| Documentation | README with setup and key decisions; mermaid diagrams | This document set |

The engineer's review of the first spec then **changed four decisions**, plus the `created_by`
wording in D14:

- **D8 and D9.** The agent had proposed dropping the repository layer and letting serializers
  persist plain CRUD. The engineer restored both, so the architecture stays consistent.
- **D27.** The agent had accepted the risk of an Operator deleting a task a Supervisor assigned
  them. The engineer closed it: an Operator may delete only tasks they created.
- **D28.** The engineer required UUIDv7 primary keys.

## The conventions the engineer set in AGENTS.md

Before the first prompt, the engineer committed three files that define how an AI agent must work
in this repository (`03b2537`, the initial commit):
- [`AGENTS.md`](../AGENTS.md), the cross-stack rules;
- [`backend/AGENTS.md`](../backend/AGENTS.md), for Django and DRF;
- [`frontend/AGENTS.md`](../frontend/AGENTS.md), for React.

The engineer wrote most of their content, with only small AI help to organise the files. Every
agent session reads them before touching code. They have **never been modified since**, so every
rule below predates the code and the specs.

Each rule's **Origin is Engineer**. The last column shows how the project applies it, and which
numbered decisions built on it.
- **Partly met:** A25. It is marked **Partly** in the table and explained after the tables.
- **Departed from on purpose:** A4, A34 and A43. Those departures are listed in
  [Deliberate overrides](#deliberate-overrides-of-agentsmd).

### Cross-stack rules (root `AGENTS.md`)

| # | Convention | Section | How the project applies it |
|---|---|---|---|
| A1 | Simple, explicit code with narrow responsibilities; framework mechanisms over custom ones; thirteen principles in all | §2 | Applied throughout, and cited in the specs' reasoning (for example D48, D57) |
| A2 | Frontend and backend talk only over the versioned HTTP API | §3 | Everything goes through `/api/v1/`; the SPA has no other channel |
| A3 | JWT: a short-lived access token in frontend memory, the refresh token in an HttpOnly cookie, authorization always server-side | §4 | A 15-minute access token held in `api-client.ts`; the refresh cookie is scoped to `/api/v1/auth/`; matrix plus object permissions |
| A4 | Docker Compose for the whole stack (frontend, backend, worker, redis, db) with a db healthcheck, bind-mounted source and config from `.env` | §5 | `docker-compose.yml`. `beat` and `mailhog` were added as overrides |
| A5 | Native `npm run dev` for day-to-day frontend work; the Compose service is for running the full stack | §5 | README, "Working on the frontend natively"; file polling only inside Compose (D59) |
| A6 | Run management commands through the container | §5 | README Quick start; the test script prefers Compose (D36) |
| A7 | The decision rule: clear boundaries, few hidden dependencies, testability, explicit authorization, integrity, concurrency, framework capabilities | §6 | The tie-breaker in every spec's decision log |
| A8 | The README must cover setup, key decisions and overrides, seeded demo credentials, and the GenAI prompts with how the output was validated | §7 | [README](../README.md), linking to this document and to [GENAI-WORKFLOW.md](GENAI-WORKFLOW.md) |

### Backend rules (`backend/AGENTS.md`)

| # | Convention | Section | How the project applies it |
|---|---|---|---|
| A9 | Request flow: view → serializer → service → repository or selector → ORM; dependencies point downward | §1 | D8, D8a; enforced by `test_layering.py` |
| A10 | One app per feature; create a layer only when it earns its place | §2 | `core`, `users`, `tasks`, `notifications` |
| A11 | Invariants are enforced by database constraints, not by application checks alone | §3 | CHECK on `completed_at`; partial unique email index; unique `dedupe_key` |
| A12 | Migrations are reviewed source code; every schema change has one | §4 | CI runs `makemigrations --check` |
| A13 | ORM over raw SQL; eager loading that matches what is actually read; no N+1 | §5 | `select_related` per action in `TaskViewSet.get_queryset()`; query-count tests |
| A14 | Selectors hold reusable or complex reads, never mutations | §6 | `scoped_tasks`, `task_stats`, `overdue_candidates` |
| A15 | Repositories only where they add a real boundary, never a wrapper around `Model.objects.get` | §7 | Each owns real behaviour: a row lock (`get_for_update`), a dedupe insert (`create_if_absent`), email normalisation (`get_by_email`) |
| A16 | Services own workflows and transactions, and never see `request` or HTTP | §8, §9 | `TaskService`, `UserService` |
| A17 | Concurrency is considered explicitly: `select_for_update`, `F()`, constraints | §9 | Row locks on update and completion; `test_concurrency.py` |
| A18 | Thin views; `GenericViewSet` with mixins when CRUD is partial; custom actions for state transitions | §10, §11 | `TaskViewSet` (PATCH, no PUT); `@action` for `complete`, `stats`, `assignable` |
| A19 | Separate input and output serializers; explicit fields, never `__all__` | §12, §13 | `TaskCreateSerializer`, `TaskUpdateSerializer`, `TaskListSerializer`, `TaskDetailSerializer` |
| A20 | Explicit permission classes; queryset restriction for visibility; object permissions per resource | §15 | `RolePermission`, `IsTaskCreator`, `IsNotSelf`, `scoped_tasks` |
| A21 | Filtering through django-filter and DRF's ordering and search filters, never hand-parsed; no arbitrary fields | §16 | `TaskFilterSet`; an `ordering_fields` whitelist |
| A22 | DRF pagination, consistent across the API, with deterministic ordering | §17 | `DefaultPageNumberPagination`; `TiebrokenOrderingFilter` always appends `-id` |
| A23 | One error contract through a central exception handler; meaningful error codes; no internals leaked; never `except Exception: pass` | §18, §45 | `apps/core/exceptions.py` returns `{detail, code, errors}`; D30 |
| A24 | Correct status codes; 403 versus 404 for resource isolation chosen deliberately | §19, §38 | 404 for out-of-scope rows, 403 for forbidden actions, 409 for invalid transitions |
| A25 | Authentication endpoints get rate limiting, lockout and failed-attempt logging | §20 | **Partly.** Login is throttled at 5/min per IP and failures are logged (`auth.login_failed`, never the password). There is no per-account lockout |
| A26 | CSRF handled explicitly because cookies are involved; explicit CORS origins, never allow-all | §21, §22 | `SameSite=Strict` refresh cookie with CSRF middleware on; `CORS_ALLOWED_ORIGINS` from the environment |
| A27 | DRF's own throttling, stricter on authentication endpoints, rates in one place | §22a | `DEFAULT_THROTTLE_RATES`; `LoginRateThrottle`, `RefreshRateThrottle` |
| A28 | Production security settings reviewed; secrets only from the environment | §23, §24 | `production.py` asserts `DEBUG=False` and sets HSTS and secure cookies; only `.env.example` is committed |
| A29 | External services behind a boundary; retry only what is idempotent; idempotency backed by a constraint | §25–§27 | `NotificationDispatcher` Protocol; unique `dedupe_key`; retries on transport errors only |
| A30 | Structured logging with request context; never log passwords, tokens or secrets | §28 | Every line is a JSON object with a `request_id`, which follows the request into Celery tasks. Each request also gets one access line with method, path, status, duration and actor. Events carry their data as fields, and query strings and secrets stay out (D89–D93) |
| A31 | Performance changes need evidence first | §30 | No index without a query that needs it; query-count tests |
| A32 | Celery with Redis for genuinely asynchronous work; services enqueue, views never do; explicit retry rules; no extra queues | §32 | `apps/notifications`; `on_commit` enqueue in services; `autoretry_for` transport errors only; no result backend, because nothing reads results |
| A33 | Versioned `/api/v1/` routes; plural REST names; state transitions as `POST /{id}/<action>/` | §33, §34 | Every route is under `/api/v1/`; `POST /tasks/{id}/complete/` (D18) |
| A34 | Generated OpenAPI documentation with `drf-yasg` **or** `drf-spectacular` | §35 | drf-spectacular (D4) |
| A35 | pytest with pytest-django and pytest-cov; at least 80% coverage on the critical paths; test-first preferred | §36 | 438 tests at 100%, gate at 80%; test-first plans |
| A36 | Tests protect authorization, ownership, validation, transitions, constraints, transactions and concurrency, including negative cases | §37–§42 | The permission-matrix suite, constraint tests, `test_on_commit.py`, `test_concurrency.py` |
| A37 | Tooling declared in `pyproject.toml`; Poetry or uv; pre-commit hooks; ruff; commands documented | §44a | uv with `uv.lock` (D5); `.pre-commit-config.yaml`; README, "Running the tests" |
| A38 | No `utils.py`, `helpers.py` or `common.py` dumping grounds | §49 | Named modules in `apps/core` (D10) |
| A39 | Explicit dependency injection, proportional to need; no DI framework | §50 | `TaskService` receives its dependencies in its constructor; the viewset is the composition root (D8a) |
| A40 | A seed command with known demo credentials, never run against production settings | §54a | `seed_demo_data` refuses production settings (D33) |

### Frontend rules (`frontend/AGENTS.md`)

| # | Convention | Section | How the project applies it |
|---|---|---|---|
| A41 | Data flows UI → feature hook → feature service → one central API client | §1, §5 | `features/*/hooks`, `features/*/services`, `lib/api-client.ts` |
| A42 | Code organised by feature; shared primitives in `components/`; layers only when earned | §3 | `src/features/{auth,dashboard,tasks,users}` |
| A43 | Three kinds of state, each with one tool (TanStack Query, Context, `useState`); never copy server state | §4 | Query for server state; the URL for list state; Form for drafts; Store for the session and each page's UI state — an override |
| A44 | Access token in memory; never touch the refresh cookie; a 401 means the session has expired | §5 | Single-flight refresh in `api-client.ts`; a session-expired handler |
| A45 | Hiding a control is UX, not authorization; never duplicate a business rule the backend enforces | §5, §8 | The API reports `can_delete`, `allowed_transitions` and the assignable users (D39, D61) |
| A46 | Tailwind utilities, mobile-first, design tokens over arbitrary values, `clsx`; repeated styles become components, not classes | §6 | Tokens in `tailwind.config.js`; `Button` and `ButtonLink` components; responsive cards |
| A47 | Vitest with React Testing Library; MSW at the network boundary; test-first where practical; a console warning is a bug | §7 | MSW with `onUnhandledRequest: "error"`; the console guard in `src/test/setup.ts` |
| A48 | Done means loading, error and empty states handled, server errors shown, responsive, and no console warnings | §9 | Verified in the [QA report](qa/2026-10-07-frontend-qa-report.md) |

### Where the project falls short of AGENTS.md

This is open, not deliberate. It was found while preparing this analysis on 2026-10-07.

- **A25, account lockout.** Per-IP throttling slows brute force from one address, but nothing locks
  an account after repeated failures from many addresses. The fix would be a failed-attempt
  counter per account, reset on success, with a lockout window.

A second gap found that day has since been closed. A30, request context in logs, was only partly
met until iteration 6 added structured logs with request ids (D89–D93).

## Decision log

### Platform and dependencies (iteration 1)

| # | Decision | Why | Origin |
|---|---|---|---|
| D1 | Django `>=6.0,<6.1` | The newest Django *every* dependency tests against; two of them stop at 6.0. | AI |
| D2 | Python `>=3.14` as a hard floor | `uuid.uuid7()` entered the stdlib in 3.14 (D28); anything lower needs a third-party package. | AI |
| D3 | simplejwt from a pinned git commit | PyPI 5.5.1 predates Django 6.0 support. Outside Dependabot, so it carries an exit criterion. | AI |
| D4 | drf-spectacular over drf-yasg | drf-yasg caps at Django 5.2 and emits OpenAPI 2.0 only. Overrides the brief, with the engineer's approval; backend §35 (A34) already allowed either tool. | Engineer + AI |
| D5 | uv with a committed `uv.lock` | Required by the brief; reproducible resolution, including the git source. | Engineer |
| D6 | No `django-safedelete` | Soft delete is ~40 owned lines and needs our own tests regardless. | AI |
| D7 | No charting library | The dashboard is six numbers; stat tiles and a CSS bar suffice. | AI |

### Architecture (iteration 1)

| # | Decision | Why | Origin |
|---|---|---|---|
| D8 | Views → serializers → services → repositories, plus selectors | The project's documented architecture, applied consistently rather than per feature. The engineer restored the repository layer the agent had proposed dropping. | Engineer |
| D8a | Repositories are `Protocol`s; the viewset is the composition root | Applies backend §1 (code depends on abstractions) and §50 (explicit injection, no framework), A9 and A39. The agent chose `Protocol`s, which make the import graph enforce the rule. | Engineer + AI |
| D9 | Serializers never persist; write serializers are plain `Serializer`s | One write path per operation. The engineer reverted "plain CRUD stays in the serializer"; the agent made the rule structural. | Engineer |
| D10 | A shared `apps/core/`, every module named for one responsibility | Applies backend §49's ban on `utils.py` dumping grounds (A38). A shared app is unavoidable; the agent shaped it. | Engineer + AI |
| D11 | The permission matrix is declarative data | One table read by both the permission class and a parametrized suite, so they cannot drift. | AI |
| D12 | No `django-guardian` | The rules are role-derived, not per-object. | AI |

### Domain, permissions and data (iteration 1)

| # | Decision | Why | Origin |
|---|---|---|---|
| D13 | Strict role separation; **Admin has no task surface at all** | The brief's roles, read literally. The agent added the Supervisor's read-only, minimal user list for the assignee picker. | Engineer + AI |
| D14 | Operator visibility is `assignee = me` only | Reassignment revokes access immediately. The engineer's review fixed the role of `created_by`: it grants no visibility, but it gates delete (D27). | Engineer + AI |
| D15 | An Operator may update and complete an assigned task, but not reassign it | Handing work off belongs to a Supervisor. | AI |
| D16 | An Operator's new task is always self-assigned | Omitting `assignee` defaults to self; supplying someone else is a 400, not a silent coercion. | AI |
| D17 | An assignee is never an Admin | Assigning to one would create a task nobody can open. Not expressible as a check constraint. | AI |
| D18 | `POST /tasks/{id}/complete/` is the only path to `COMPLETED` | Backend §34 makes state transitions their own `POST` action (A33); the agent made it the *only* path, so `completed_at` is always set with it. | Engineer + AI |
| D19 | `COMPLETED` and `CANCELLED` are terminal | A simpler invariant that matches the database constraint. | AI |
| D20 | Soft delete on `User` and `Task`; `Notification` exempt | Needed for a meaningful audit trail. The log is append-only, so a marker there would always be null. | AI |
| D21 | A soft-deleted user's email becomes reusable | A partial unique index, not a plain unique constraint. | AI |
| D22 | `is_active` and `deleted_at` are not synonyms | One is the auth gate, the other the delete marker; an Admin may deactivate without deleting. | AI |
| D23 | `due_date` is a nullable `DateTimeField` | The hourly sweep compares against a time of day; a task may have no deadline. | AI |
| D24 | Email stored lowercase in a plain `EmailField` | Case-insensitive uniqueness without the `citext` extension. | AI |
| D25 | Both task FKs are `PROTECT` | Nothing is hard-deleted; if it ever is, fail loudly rather than null an audit record. | AI |
| D26 | Notification recipients are gated by current read access | Never email someone about a task they would get a 404 on. | AI |
| D27 | An Operator may delete only a task they **created** | Raised in the engineer's spec review. With no restore endpoint, a wrong delete would be irrecoverable. | Engineer |
| D28 | All primary keys are UUIDv7 | Raised in the engineer's spec review. Removes enumeration while keeping index locality close to a sequential integer's. | Engineer |

### Refinement (iteration 2)

| # | Decision | Why | Origin |
|---|---|---|---|
| D29 | Pydantic DTOs validate at the service boundary; DRF serializers keep the HTTP boundary | The engineer asked for typed models instead of plain dicts. The agent placed them so neither layer becomes a second source of truth. | Engineer + AI |
| D30 | A DTO validation failure is a 500, never a 400 | Backend §45 separates expected business errors from programming errors (A23). The serializer already accepted the payload, so a DTO failure is a contract defect between view and service. | Engineer + AI |
| D31 | Input DTOs carry already-resolved model instances | The serializer already proved the row exists; carrying ids would re-fetch it. | AI |
| D32 | Partial updates key off `model_fields_set` | PATCH must tell "absent" from "explicitly null": `assignee: null` unassigns. | AI |
| D33 | `seed_demo_data --users N --tasks M`, additive and top-up | The engineer asked for sized, randomly assigned seed data with a fixed Admin login. The agent made re-runs idempotent. | Engineer + AI |
| D34 | Random users come from a name list inside the command, not factory_boy | factory_boy is a dev dependency; application code must not import it. | AI |
| D35 | Auth bootstrap tries a refresh first, then fetches the user | Probing `/users/me/` without a token is a guaranteed 401. Fixes the console errors the engineer reported. | AI |
| D36 | The pre-push hook tries Compose, then local `uv`, and passes if either passes | Compose is the development default; the local path must still work without Docker. Chosen by the engineer over a stricter option. | Engineer |
| D37 | Local email goes to a MailHog container | Notification emails become readable the way a recipient sees them. | AI |

### Bug fixes (iteration 3)

| # | Decision | Why | Origin |
|---|---|---|---|
| D38 | Task deletion confirms through a `DeleteTaskDialog` | The engineer reported the missing confirmation. Two dialogs do not yet justify a generic one. | Engineer |
| D39 | The API reports `allowed_transitions`; the SPA does not mirror `TRANSITIONS` | Frontend §8 forbids duplicating backend business rules (A45); the agent chose to have the API report them. | Engineer + AI |
| D40 | The status field works from a snapshot taken when the form opens | Fixes the reported "completed task shows PENDING" bug without undoing someone else's concurrent change. | AI |
| D41 | Dashboard cards get one "View tasks" call to action, as a stretched link | The engineer asked for the call to action. The agent kept it to one link per card, because a button inside a link is invalid HTML. | Engineer + AI |
| D42 | "Due in 7 days" spans the full row | The engineer's layout call, so no breakpoint leaves a lone card. | Engineer |
| D43 | `compat`'s smoke step runs with `--no-cov` | Diagnosis of the failing CI job the engineer reported: a one-module smoke test is not a coverage measurement. | AI |
| D44 | The CI fix is verified in GitHub Actions with `gh` | Requested by the engineer: only Actions proves the job. | Engineer |

### List navigation (iteration 4)

| # | Decision | Why | Origin |
|---|---|---|---|
| D45 | The URL is the single source of truth for list state: filters, sort, page, page size | The engineer asked for filters in the URL. The agent made the URL the *only* copy, so refresh, Back, links and dashboard cards share one code path. | Engineer + AI |
| D46 | Changes are applied as patches through `navigate`'s updater | A debounced commit would otherwise overwrite changes made in between. | AI |
| D47 | Page moves push history; other edits replace it, without scrolling | Back undoes navigation, not each checkbox. | AI |
| D48 | URLs are canonical: defaults stripped, invalid values dropped | One view, one URL. | AI |
| D49 | Pager window: first, last and current ±2 | The engineer specified the pager. Its example read two ways, and the engineer chose a contiguous window. | Engineer + AI |
| D50 | Text inputs commit to the URL after a 300 ms pause | One request per pause, not per keystroke, and no input jumping. | AI |
| D51 | Page sizes 10 / 20 / 50 / 100 | Specified by the engineer; mirrors the API's `max_page_size` of 100. | Engineer |
| D52 | The pager is driven by `count` | Numbered pages need the total. | AI |
| D53 | Lists keep the previous page visible while the next loads | Otherwise the pager unmounts and keyboard focus is lost. | AI |
| D54 | A 404 for a page above 1 returns to page 1 | A stale link recovers instead of showing an error. | AI |
| D55 | The current page is a button with `aria-current="page"` | Disabling it would drop focus to `<body>`. | AI |
| D56 | `ROLES` is exported once | Avoids a third private copy of the role list. | AI |
| D57 | Page titles are declared on routes with TanStack Router's `head` | The engineer reported tabs without page names; the agent used the router's own mechanism. | Engineer + AI |
| D58 | `index.html` has no static `<title>` | React hoists route titles after a static one, and the browser shows the first. | AI |

### Browser-check fixes (iteration 4)

| # | Decision | Why | Origin |
|---|---|---|---|
| D59 | The Compose frontend polls for file changes; native `npm run dev` does not | Bind mounts on Windows/macOS drop file events, so Vite served stale code. The engineer limited polling to Compose. | Engineer + AI |
| D60 | Dialogs take focus, close on Escape, trap Tab and restore focus (`useModalDialog`) | Found by the agent's browser check: keyboard users could not reach the dialog. | AI |
| D61 | `GET /users/assignable/` reports who may be assigned | The picker stopped at 100 users, and it re-derived D17 in the browser, which frontend §8 forbids (A45). | Engineer + AI |
| D62 | `ButtonLink`: one element with a button's look | A `<button>` inside an `<a>` is invalid HTML and two Tab stops. | AI |
| D63 | Deleting a task removes its detail query before invalidating the list | Refetching the deleted task logged a 404. | AI |
| D64 | The assignee picker is a searchable, paged ARIA combobox | The engineer asked for inline search and pagination. The agent wrote the combobox in-house: there is one consumer and no UI library. | Engineer + AI |
| D65 | An omitted `assignee` and `null` mean different things | The engineer reported that "Unassigned" was ignored. The agent's fix also unblocked Operator task creation. | Engineer + AI |

### QA fixes (iteration 5)

From the [QA report](qa/2026-10-07-frontend-qa-report.md); the engineer chose the policy for F1, F5 and F8.

| # | Decision | Why | Origin |
|---|---|---|---|
| D66 | An Admin cannot delete, demote or deactivate their own account | An Admin could lock themselves out. The engineer chose "self only" over a last-Admin rule. | Engineer + AI |
| D67 | One sort model, `features/tasks/sorting.ts` | Headers, the mobile select and URL validation share one definition. | AI |
| D68 | Sortable headers show their state: `aria-sort` and ▲/▼ | Raised by the engineer: the sort applied with no visible direction. | Engineer + AI |
| D69 | Task list shows cards and a "Sort by" select below `lg` | Phones could not sort, and six columns did not fit at `md`. The engineer chose `lg`. | Engineer + AI |
| D70 | "Back to tasks" restores the list through history state | The list lost its filters, sort and page. The engineer chose history state over a URL parameter. | Engineer + AI |
| D71 | One `NotFoundPanel`, rendered at the root route | Unknown addresses and missing tasks were dead ends. | AI |
| D72 | A task 404 never says why | "Deleted" versus "not yours" would leak whether the task exists. | AI |
| D73 | Unknown statuses and orderings are dropped from the URL | A hand-edited URL produced an API error. | AI |
| D74 | No route loads while auth is still loading (`useRouterAuthSync`) | A protected page mounted and fetched before redirecting. | AI |
| D75 | Focus moves to the first error after a failed submit | Keyboard and screen-reader users lost their place. | AI |
| D76 | Due dates render as the UTC day, without a time | A date-only field showed an invented time, shifted by timezone. | AI |
| D77 | The current menu item is marked; header targets are 44 px | No visible "you are here", and small touch targets. | AI |
| D78 | An impossible date range is explained in an announced message | The list went silently empty. | AI |

### Structured logging (iteration 6)

| # | Decision | Why | Origin |
|---|---|---|---|
| D89 | Every log line is one JSON object stamped with a request id held in a context variable | The engineer asked for structured logs with a request id kept in context variables, so all the lines of one request can be found together. The agent built it on the standard library alone: a `logging.Filter` copies the id onto each record and a JSON `Formatter` writes it, so no dependency is added. | Engineer + AI |
| D90 | The request id crosses into Celery tasks as a message header | A notification email's lines belong to the request that caused it, even though another process writes them. A task with no originating request, such as the beat sweep, logs under its own task id. | AI |
| D91 | A well-formed incoming `X-Request-ID` is kept; anything else is replaced by a UUIDv7; the response echoes it | A caller's or proxy's id joins their logs to ours. Only letters, digits and `._:-`, up to 128 characters, are accepted, so a header cannot forge a log line. | AI |
| D92 | One access line per request, from `RequestIdMiddleware`; Django's 4xx lines and runserver's line are dropped | Both duplicate the access line without a request id, and runserver's logs the full query string. Unhandled errors are still logged by Django, inside the request, with a traceback. | AI |
| D93 | Events are logged as a name plus fields, and paths without their query string | Applies backend §28 (A30): fields can be filtered and aggregated, while values packed into a message cannot. A query string can hold search terms and email addresses. | Engineer + AI |

### TanStack Form, Table and Store (iteration 7)

From the [TanStack refactor design](superpowers/specs/2026-10-07-tanstack-form-table-store-design.md).
The engineer chose the scope (forms, tables and component state), a mergeable migration with no
change in behaviour, stores for component state rather than for shared state only, pagination
through the table, and the form components in the filter panels.

| # | Decision | Why | Origin |
|---|---|---|---|
| D79 | Every form draft is a TanStack Form; validation stays server-only | The engineer asked for TanStack Form in place of the hand-written forms. Three forms repeated one submit-and-error lifecycle, and frontend checks stay UX only (frontend §8). | Engineer + AI |
| D80 | Field server errors live in Form's `onServer` slot, routed only to fields that show one; the form-level message lives in a small store beside the form; both are cleared before every submit | One mapper replaces three. A standing field-level `onServer` error makes Form refuse to submit, and Form writes the error map to every registered field. Form clears a form-level `onServer` error on the next change or blur, so the message, which today's forms keep until the next submit, lives outside the error map. | AI |
| D81 | Every form's defaults are a mount-time snapshot | `useForm` re-applies changed defaults to an untouched form, and the detail queries refetch on focus. D40 depends on the snapshot. | AI |
| D82 | The filter panels are Forms, kept in step with the URL by `useUrlFieldSync` | The engineer asked for the form components in the filters, for one visual identity. Form's own debounce cannot be cancelled, and D50's echo rules had to stay. Its echo queue compares a new write with where the URL is heading, not with the rendered value, and Clear puts every field to its cleared value as well as cancelling pending writes. | Engineer + AI |
| D83 | Tables are built with `createTableHook` and own no state; the URL drives them | The engineer asked for TanStack Table in place of the hand-built tables. The URL stays the only copy of list state (D45). | Engineer + AI |
| D84 | Table drives the sort cycle; two mappers replace `nextOrdering` | With removal off and ascending first, Table's cycle is exactly D67's. Columns that do not sort opt out, or they would announce `aria-sort`. | AI |
| D85 | Pagination goes through the table; one handler chooses push or replace | The engineer chose one pagination model over the old props. Table's `setPageSize` keeps the top row in view, which is not D47's page-1 reset. | Engineer + AI |
| D86 | One session store per app replaces `AuthContext`; `useAuth()` keeps its shape | Shared client state with selector reads. One store per mount keeps tests isolated, and no caller of `useAuth()` changes. | Engineer + AI |
| D87 | Each page's UI state lives in a per-mount store; a row selects its own busy flag | The engineer chose stores for component state over `useState`, a broader override of frontend §4. One store per mount keeps `useState`'s lifetime. | Engineer + AI |
| D88 | DOM and timing primitives keep their internal React state | A store would add indirection with no second reader. | AI |

### Fixes found in use

| # | Decision | Why | Origin |
|---|---|---|---|
| D94 | Re-sending a task's current, soft-deleted assignee on update is no change; choosing any deleted, unknown or malformed assignee is a plain field error | The engineer reported a raw `Invalid pk "…" - object does not exist.` under the picker, and no task held by a deleted user could be edited: the form re-sends the assignee with every save, and the field looked it up among live users only. The field now resolves against every user, so the serializer can tell the current assignee from a new choice. A deleted user is worded like an unknown id, because deleted rows are invisible to the API (D20). | Engineer + AI |

## Deliberate overrides of AGENTS.md

The three `AGENTS.md` files are the engineer's standing conventions for this repository (A1–A48
[above](#the-conventions-the-engineer-set-in-agentsmd)). Each deliberate departure from them is
recorded here.

| Override | AGENTS.md says | This project does | Why | Origin |
|---|---|---|---|---|
| **Celery beat service** | root § Local Development (A4): "Do not add further services beyond this (a beat/scheduler process, Flower, extra queues, Kafka)" | Adds a `beat` service to `docker-compose.yml` | The brief requires scheduled overdue notifications, which needs a periodic scheduler. A separate `celery beat` process is the standard, production-shaped arrangement; Celery documents `worker -B` as development-only. | AI |
| **MailHog service** | root § Local Development (A4): add no services beyond those listed, "only what's actually needed" | Adds a `mailhog` SMTP sink, with its inbox on `:8025` | D37. Notification email is a core feature, and a local inbox lets it be read and checked the way a recipient sees it, with no real mail server. Recorded as an override on 2026-10-07; it was not listed when D37 was made. | AI |
| **API docs tool** | `backend §35` (A34) names `drf-yasg` first | Uses `drf-spectacular` | D4. `§35` explicitly permits either. | Engineer + AI |
| **Dockerfile dependency install** | root § Local Development example (A4) uses `requirements.txt` + `pip` | Uses `uv sync` from `pyproject.toml`/`uv.lock`, and installs `git` | D5 (required by the brief) and D3. `backend §44a` already mandates `pyproject.toml` over `requirements*.txt`, so the root example is the outdated part. | Engineer + AI |
| **State ownership** | frontend §4 (A43): three kinds of state — server state in TanStack Query, shared client state in Context, local UI state in `useState` | Server state in TanStack Query. List view state (filters, sort, page, page size) in the URL, owned by the router. Form drafts in TanStack Form. The session, and each page's UI state, in TanStack Store, one store per page mount. `useState` only inside DOM and timing primitives | A list's view must survive refresh, Back and a shared link, and the dashboard's cards must be able to open it; only the URL does all four (D45). Form and Store replaced three copies of one submit-and-error lifecycle and the per-component flags (D79–D88), and per-mount stores keep `useState`'s lifetime while letting a row select only what it renders. Typed text keeps a short-lived draft in its form field (D82). | Engineer + AI |

## Sources

| Iteration | Decisions | Design spec | Plan |
|---|---|---|---|
| 0. Conventions, written by the engineer | A1–A48 | [`AGENTS.md`](../AGENTS.md), [`backend/AGENTS.md`](../backend/AGENTS.md), [`frontend/AGENTS.md`](../frontend/AGENTS.md) | — |
| 1. Initial build | D1–D28 | [task-management-system-design](superpowers/specs/2026-10-05-task-management-system-design.md) | [plan](superpowers/plans/2026-10-06-task-management-system.md) |
| 2. Refinement | D29–D37 | [refinement-iteration-2-design](superpowers/specs/2026-10-06-refinement-iteration-2-design.md) | [plan](superpowers/plans/2026-10-06-refinement-iteration-2.md) |
| 3. Bug fixes | D38–D44 | [iteration-3-fixes-design](superpowers/specs/2026-10-06-iteration-3-fixes-design.md) | [plan](superpowers/plans/2026-10-06-iteration-3-fixes.md) |
| 4. List navigation | D45–D58 | [list-navigation-design](superpowers/specs/2026-10-06-list-navigation-design.md) | [plan](superpowers/plans/2026-10-06-list-navigation.md) |
| 4. Browser-check fixes | D59–D65 | None: small fixes, recorded only here | — |
| 5. QA fixes | D66–D78 | [qa-fixes-iteration-5-design](superpowers/specs/2026-10-07-qa-fixes-iteration-5-design.md) | [plan](superpowers/plans/2026-10-07-qa-fixes-iteration-5.md) |
| 6. Structured logging | D89–D93 | None: built test-first from one prompt, and recorded here | — |
| 7. TanStack Form, Table and Store | D79–D88 | [tanstack-form-table-store-design](superpowers/specs/2026-10-07-tanstack-form-table-store-design.md) | [plan](superpowers/plans/2026-10-07-tanstack-form-table-store.md) |

## Rationale in depth

The decisions whose reasoning is load-bearing, expanded.

### D1 — Django `>=6.0,<6.1`, not 6.1

6.0 is the newest Django that *every* dependency actually tests against. DRF 3.18.1,
django-simple-history 3.13.0 and django-filter 26.2 cover both 6.0 and 6.1, but
simplejwt@master and drf-spectacular 0.30.0 stop at 6.0. Pinning 6.0 leaves zero untested
combinations while still satisfying the "Django 6+" requirement.

Trade-off, stated plainly: 6.0 left mainstream support when 6.1 shipped (Aug 2026), so it
is a security-fix-only branch. The exit criterion is D3's.

### D2 — Python `>=3.14` is a hard floor, not a preference

`uuid.uuid7()` entered the standard library in 3.14 (D28), so anything lower would need a
third-party UUIDv7 package. Django 6.0 officially supports 3.12–3.14.

Most of the dependency set is not individually verified against 3.14. The guard is the
`compat` CI job rather than a claim: `uv sync` fails outright if any dependency caps below
3.14, and it ran on day one before anything was built on the stack. It resolved cleanly on
Python 3.14.3 with Django 6.0.9, so the documented fallback — Python 3.13 plus the
`uuid-utils` package — was not needed.

### D3 — simplejwt from git, pinned to one commit

PyPI's 5.5.1 (Jul 2025) predates PR #959 ("add django 6.0 and python 3.14 support", merged
Feb 2026), which adds the Django 6.0 test matrix and replaces deprecated `pkg_resources`
with `importlib.metadata`. Master supports Django 6.0; the release does not. The pin is
commit `a7cb077ea0809f78cc6a99cb6825ab7594eae627`.

Consequences, all real:

- The backend image installs `git` so uv can resolve the git source.
- `uv.lock` captures the SHA, so builds stay reproducible (it resolves to
  `5.5.1.post36+ga7cb077ea`).
- **`pip-audit` and Dependabot cannot track a git pin**, so this one dependency sits
  outside automated advisory coverage.
- **Exit criterion:** revert to the PyPI package as soon as a simplejwt release containing
  #959 ships, then relax D1 toward Django 6.1.

### D4 — drf-spectacular 0.30.0 instead of drf-yasg

drf-yasg 1.21.17 still caps its classifiers at Django 5.2 and emits OpenAPI 2.0 only.
drf-spectacular classifies Django 6.0, emits OpenAPI 3.0.3/3.1/3.2, and is actively
maintained. `backend §35` permits either tool. This overrides the original brief's
nomination of drf-yasg, and costs nothing to anyone expecting Swagger — drf-spectacular
serves a Swagger UI at `/api/v1/schema/swagger-ui/` alongside ReDoc.

### The `compat` CI job, and when to delete it

CI runs four jobs: `lint`, `compat`, `backend` and `frontend`. Three of them ask "is my code
right?"; **`compat` asks whether this dependency set still assembles and boots at all**, and
it exists only because of the unusual combination D1–D4 chose. It has three stages:

1. Resolve the pinned set including the git source, assert Python ≥ 3.14 with a working
   `uuid.uuid7()`, assert Django is 6.0.x, import the two at-risk packages, and boot Django.
2. Run the login round-trip, which is the single most load-bearing claim in D3 — that the
   git-pinned simplejwt actually issues and verifies a token on Django 6.0. It runs with
   `--no-cov`: it is a smoke test of one module, and the 80% gate is a whole-suite
   measurement that belongs to the `backend` job.
3. Generate and validate the OpenAPI document, which is the equivalent claim for D4.

This job is **deliberately temporary and risk-specific**. When a simplejwt release
containing PR #959 ships, D3's exit criterion is taken, D1 relaxes toward Django 6.1, and
**this job can be deleted** — its whole purpose is to keep an assumption under continuous
verification until the assumption is no longer needed.

The generated `schema.yaml` is **gitignored**: it is a build artifact, and committing it
would create a second source of truth that silently goes stale.

### D5 — uv as package manager

`pyproject.toml` plus a committed `uv.lock`. Required by the brief; `backend §44a` permits
uv or Poetry, used consistently.

### D10 — a shared `apps/core/` app, with every module named for one responsibility

A shared app is unavoidable: the soft-delete base model, pagination, the exception handler
and the permission matrix belong to no single feature. `backend §49` forbids `utils.py`,
`common.py` and `helpers.py` dumping grounds, so the rule is satisfied not by avoiding a
shared app but by refusing to give it a catch-all module. Each file owns one thing:
`models.py` the abstract bases, `managers.py` the soft-delete manager, `roles.py` the role
choices, `pagination.py`, `ordering.py`, `throttling.py`, `constants.py`, `exceptions.py`,
and `permissions/` the matrix and the classes that read it.

`Role` lives in `core` rather than in `users` for a structural reason: the permission
matrix needs it, and a shared app importing a feature app inverts the dependency direction
that D10 exists to protect.

### D11 — the permission matrix is declarative data

`apps/core/permissions/matrix.py` maps `(resource, action)` to the set of roles that may
reach it. One table is read by two consumers — `RolePermission` at request time and a
parametrized test suite — so the rules and their enforcement cannot drift apart.

What it buys concretely: D13's strongest claim, that **an Admin has no task surface at
all**, is asserted against the data itself before any view exists, and it stays asserted
for every task action that is ever added. Lookups fail closed — `MATRIX.get(key,
frozenset())` means a new viewset action with no matrix row is denied rather than silently
allowed.

Its scope is deliberately narrow: endpoint reachability only. The one object-level rule
(D27, an Operator may delete only a task they created) lives in `IsTaskCreator`, not in the
matrix, because encoding one row-dependent outcome would require a richer value type for
every other row.

### D20, D21, D22 — soft delete, and why `is_active` survives alongside `deleted_at`

Every domain model (`User`, `Task`) is soft-deleted: deletion is a state change, never a
row removal, which is what makes the `django-simple-history` audit trail worth having.
There is no restore endpoint, and soft-deleted rows are invisible to the entire API —
enforced by making the filtering manager the *default* manager, so no viewset needs its own
`deleted_at` filter. That removes the single most likely place for a data leak.

`Notification` is the deliberate exception (D20): it is an append-only log that no API
exposes and no user deletes, so a `deleted_at` column on it would never be anything but
null.

**D21 — a soft-deleted user's email becomes reusable.** This is why `email` is *not*
`unique=True`. Uniqueness is a partial index, `UNIQUE(email) WHERE deleted_at IS NULL`, so
deleting `sam@example.com` frees the address while the audit row keeps it.

**D22 — `is_active` and `deleted_at` are not synonyms.** `is_active` is Django's
authentication gate; `deleted_at` is the soft-delete marker. Soft deletion sets both, so a
deleted user cannot log in, but an Admin may deactivate a user *without* deleting them.

Two subtleties that are easy to get wrong and are pinned by tests:

- `Meta.default_manager_name = "objects"` is set explicitly on `User`. Manager order under
  multiple inheritance is not reliable, and `ModelBackend` authenticates through
  `User._default_manager.get_by_natural_key()` — if that ever resolved to the unfiltered
  manager, **a soft-deleted user could still log in**.
- `Meta.base_manager_name` is deliberately *not* set, so related-object descriptors and
  `PROTECT` keep seeing deleted rows and behave predictably.

### The token flow — access in memory, refresh in an HttpOnly cookie

Lifetimes: access **15 minutes**, refresh **7 days**.

- The **access token lives only in frontend memory** — never `localStorage` or
  `sessionStorage`, so an XSS payload cannot read it back out of storage.
- The **refresh token is only ever an HttpOnly cookie** and never appears in a JSON body.
  `POST /auth/login/` returns `{access, user}`; the refresh token leaves only as
  `Set-Cookie`. A test asserts the body has no `refresh` key, because that is the kind of
  thing a refactor reintroduces quietly.
- The cookie is scoped `Path=/api/v1/auth/`, so the browser attaches it to the refresh and
  logout endpoints and to **nothing else** — ordinary API requests never carry it.
- `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION` are both on, so a refresh issues a
  new token and blacklists the old one. Replaying a rotated token is a 401, and logout
  genuinely revokes rather than just clearing the cookie client-side. Both are tested.
- `USER_ID_FIELD = "id"` carries a **UUID string** in the claim, so nothing downstream may
  assume an integer id (D28).

The login payload also carries the current user, so the SPA can pick a landing page from
its role in one round trip instead of two.

### Rate limiting, and why the throttle cache is Redis

| Scope | Rate | Applies to |
|---|---|---|
| `login` | **5/min**, keyed by IP | `POST /auth/login/` — brute-force defence on the most-attacked endpoint |
| `refresh` | 30/min | `POST /auth/refresh/` |
| `anon` | 20/min | any other unauthenticated request |
| `user` | 120/min | authenticated traffic |

Rates are centralised in `DEFAULT_THROTTLE_RATES`. The login and refresh throttles subclass
`AnonRateThrottle` so the key is the **client IP** — an unauthenticated login attempt has no
user to key on.

**The throttle cache is Redis, not `LocMemCache`, and that is not incidental.**
`LocMemCache` is per-process, so each gunicorn worker would keep a private counter and the
effective limit would silently become `rate × worker_count` — a limit that does not hold
while appearing to. Redis is already in the stack for Celery, so this costs no new service.
A dedicated `throttle` cache alias keeps the counters out of any future application cache.

In **tests only**, the throttle alias is locmem, so throttle tests need no Redis service.
A `conftest.py` autouse fixture clears both cache aliases around every test: a `LocMemCache`
lives for the whole pytest process, so an uncleared anon counter otherwise leaks across
modules and surfaces as a mystery 429 somewhere unrelated.

Exceeding a limit returns **429** with a `Retry-After` header. Failed logins are logged with
IP and email — never the password.

### D24 — email stored lowercase in a plain `EmailField`

Case-insensitive uniqueness without requiring the Postgres `citext` extension and its
migration. Normalization happens in `UserManager` and again in the serializer, so both the
API and `createsuperuser` go through it.

### The `Task` invariants that live in the database

**`completed_at` and `status` cannot disagree.** A `CheckConstraint` asserts that
`status = COMPLETED` implies `completed_at IS NOT NULL`, and any other status implies
`completed_at IS NULL`. The database is the final boundary deliberately: this holds even
against a direct ORM write, the Django admin, or a data migration — not just against the
API. Both directions are tested.

**D18 — `POST /tasks/{id}/complete/` is the only path to `COMPLETED`.** `PATCH
status=COMPLETED` is a 400. One audited path for the transition is what guarantees
`completed_at` is always set alongside it. The `TRANSITIONS` map encodes this by omitting
`COMPLETED` from *every* set of reachable statuses, and a test asserts that omission rather
than trusting the table to be read correctly.

**D19 — `COMPLETED` and `CANCELLED` are terminal.** Both map to an empty transition set.
Reopening is a documented future extension, not a current requirement.

**D23 — `due_date` is a nullable `DateTimeField`**, not a `DateField`: the overdue sweep
compares against `timezone.now()` and needs a time of day. Nullable because a task may
legitimately have no deadline — and `due_date__lt` excludes nulls automatically, which is
the behaviour the overdue query wants.

**D25 — both task FKs are `on_delete=PROTECT`.** Nothing is ever hard-deleted, so this
should never fire; if it does, it must fail loudly rather than silently null an audit
record.

**D17 is deliberately *not* a database constraint.** "An assignee must be a Supervisor or
Operator, never an Admin" is a cross-table assertion and not expressible as a
`CheckConstraint`, so it is enforced in the serializer *and* re-checked in the service, with
tests at both levels.

### Notifications: who gets told, and when

| Event | Trigger | Recipients |
|---|---|---|
| `ASSIGNED` | a task gains an assignee | the new assignee |
| `DUE_DATE_CHANGED` | `due_date` changes | the assignee |
| `STATUS_CHANGED` | the status changes, completion included | the assignee **and** the creator |
| `OVERDUE` | the hourly sweep finds a past-due open task | the assignee **and** the creator |

Title and description edits are **intentionally silent** — they are not worth an email, and
a test asserts that a title-only PATCH enqueues nothing.

Two filters then apply to every event, in this order:

1. **The read-access gate (D26).** A recipient must currently be able to read the task. An
   Operator who created a task but no longer holds it is **dropped** — emailing someone
   about a task they would get a 404 on is confusing and leaks information. A Supervisor
   creator is kept, because Supervisors see every task. An Admin creator is also dropped
   (defensively: the API forbids it, but the Django admin and seed data do not, and an
   Admin can read no task at all under D13). This falls straight out of D14.
2. **Actor suppression.** Nobody is emailed about their own action. The overdue sweep has
   no actor, so it suppresses nobody.

Both are pure functions over ids and roles in `apps/notifications/services.py`, so the
rules are unit-tested with no database, no broker and no email backend.

### The three notification failure modes, and how each is handled

These are the parts most likely to be got wrong, so each is named and tested.

**1. Enqueueing inside a transaction.** Calling `.delay()` inside `transaction.atomic()`
can deliver the message to a worker *before* the transaction commits — the worker then
reads a row that does not exist yet, or a pre-update version. So every enqueue goes through
`transaction.on_commit`, and services enqueue while views never do. The guard is a test
that rolls the surrounding transaction back and asserts nothing was sent; a later
contributor adding a bare `.delay()` would break that test and nothing else.

`functools.partial` is used rather than a lambda for the callback, because a lambda in a
loop captures by reference and every callback would fire with the last iteration's values.

**2. Retries double-sending.** Delivery is made idempotent by a unique `dedupe_key`
derived from the `django-simple-history` record id:
`{task_id}:{segment}:{recipient_id}:{history_id}`. Tying the key to the audited change
means the *next* genuine change is a new email while a retry of the same one is not.
`NotificationRepository.create_if_absent` owns the whole mechanism, including the
`IntegrityError` catch — wrapped in its own inner `atomic()` block, because otherwise the
violation marks the outer transaction broken and every later query raises
`TransactionManagementError` somewhere unrelated.

One refinement of the spec here, worth stating because it changes behaviour: returning
`None` for *any* existing key would make `autoretry_for` dead code, since the first attempt
always inserts the row before sending. So `create_if_absent` returns `None` only when an
existing row is already `SENT`, and returns the existing row when a previous attempt did
not complete — the retry can then finish the job. One email per key still holds.

`OVERDUE` keys on the **date** instead of a history id, because there is no change to
anchor to. The cadence and the dedupe window are deliberately different granularities:
the sweep runs **hourly** so a task going overdue at 09:15 is emailed by 10:00, while the
date in the key caps delivery at **one email per task per recipient per day**. Running the
sweep twice in a day therefore sends nothing the second time, which is tested.

The sweep reads `overdue_candidates()` — a selector, not the ORM — which returns
`values_list(...).iterator()`, so a large backlog never materialises as model instances,
and it is served by the `("status", "due_date")` partial index. That selector joins
`created_by__role` specifically so the D26 read-access gate applies to the sweep as well
as to the API path: there is no model instance to read the role from, and without it an
Operator creator who no longer holds the task would be emailed.

The schedule is one fixed `crontab(minute=0)` entry in `config/celery.py`.
**django-celery-beat is deliberately not used** — a database-backed editable schedule would
mean another dependency plus migrations for a schedule nobody needs to edit at runtime.

**3. Blind retries.** `autoretry_for` lists `SMTPException` and `ConnectionError` only —
transport failures, which are worth retrying. A bare `Exception` is **never** retried; a
test asserts `Exception not in autoretry_for`. The ordering in the send task is what makes
this work: a transport failure re-raises *before* `mark_failed`, so the row stays `PENDING`
and `create_if_absent` hands it back on the retry; an unexpected failure marks the row
`FAILED` and returns, so Celery does not retry a bug. Nothing is swallowed — there is no
`except Exception: pass` anywhere.

### D27 — an Operator may delete only a task they created

An Operator can read, update and complete any task **assigned** to them, but may delete one
only if they **created** it as well. Deleting an assigned task they did not create is a
**403**.

This closed a previously accepted risk. Without it an Operator could soft-delete
Supervisor-assigned work, and since D20 provides no restore endpoint, that work would be
irrecoverable through the API. An Operator can still decline work by other means — change
the status, or ask a Supervisor — but cannot make someone else's task disappear. A
Supervisor retains delete on every task.

Two structural points worth keeping straight:

- **Queryset scoping cannot express this rule.** The row must stay *visible* while becoming
  *undeletable*, which is exactly what object-level permissions are for. So `IsTaskCreator`
  is applied to the `destroy` action only, and a test asserts read, update and complete
  stay unaffected — delete is narrower than read, not a general loss of access.
- **This is the only rule in the design where `created_by` affects authorization**, which
  is why D14 is explicit that `created_by` is not merely an audit column even though it
  grants no visibility.

### Why that refusal is 403 and not 404

Elsewhere the API withholds existence: a task outside your scope is a 404, because
answering 403 would confirm that a task with that id exists. Here nothing is being
withheld — the task is *already* in the Operator's queryset and they can `GET` it. So a 404
would be a lie about a row the client can already see, and 403 is the honest answer.

The code is `delete_requires_creator`, and `IsTaskCreator` **raises**
`PermissionDenied(code=...)` rather than returning `False` — returning `False` would yield
DRF's generic `permission_denied` code and lose the distinction the frontend branches on.

### Indexing: the query indexes are partial; the foreign-key indexes are Django's defaults

The three indexes declared for the task queries carry `WHERE deleted_at IS NULL`, so they cover
only live rows, which are the only rows the API can see:

- `(status, due_date)` serves the status filter and the overdue sweep;
- `(assignee, status)` serves an Operator's scoped list;
- `(due_date)` serves the due-date range and ordering.

`deleted_at` has one plain index of its own, on both `Task` and `User`.

**No index was declared for `created_by`**, even though D27 makes it load-bearing for
authorization. The check is `task.created_by_id == user.id` against a row the request has
*already* fetched, so no `WHERE created_by = ...` query is ever issued, and `backend §30` asks
for evidence before an index.

**Correction, found while documenting the schema (2026-10-07):** an earlier version of this
section said `created_by` *has* no index and that every index is partial. The live schema
disagrees. Django gives every `ForeignKey` a plain B-tree index by default (`db_index=True`), so
the following all carry one:

- `tasks_task.created_by_id`, `assignee_id` and `deleted_by_id`;
- `users_user.deleted_by_id`;
- the notification FKs.

The `created_by_id` index serves no current query. The plain `assignee_id` index is largely
covered by the partial `(assignee, status)` one. Dropping them would take `db_index=False` on the
fields and a migration. That has not been done, and remains an open optimisation.

`is_overdue` is a Python property computed from loaded data, so serializing it costs no
query; filtering by it uses the equivalent database `Q()` in `TaskFilterSet`. A test asserts
it never became a model field.

### D28 — UUIDv7 primary keys

All primary keys are UUIDv7 via `uuid.uuid7()` from the Python 3.14 standard library (D2),
so it costs no dependency. Non-sequential ids remove resource enumeration from the API
surface, while UUIDv7's 48-bit big-endian timestamp prefix keeps inserts append-ordered —
B-tree index locality stays close to a sequential integer's instead of fragmenting the way
UUIDv4 would.

The ordering property is the entire point, and it is the one thing a functional test would
*not* catch: a silent fall-back to `uuid4` would keep every id unique and every other test
green, losing only index locality. `test_generated_ids_sort_in_creation_order` exists for
exactly that. Note the caveat: CPython's 42-bit counter orders ids minted in the same
millisecond **by the same process**; across processes, ordering is millisecond-granular.

### List state lives in the URL (D45–D56)

Both lists keep their filters, sort, page and page size in the URL. The URL is the only copy:
each page derives its API query from the route's search params and writes every change back
with `navigate`. Refresh, Back/Forward, a shared link and a dashboard card all therefore land
on the same view. Before, the task list read the URL once and then kept a private copy, so
the URL went stale after the first filter.

- **Validated in one place.** `src/app/search-params.ts` drops anything a list cannot use: a
  page that is not a positive integer, a page size outside 10/20/50/100, an unknown role.
  `stripSearchParams` keeps page 1 and size 20 out of URLs, so one view has one URL.
- **Edits replace, page moves push.** Back undoes navigation, not each checkbox. Every replace
  passes `resetScroll: false`, because the router otherwise scrolls to the top even on a replace.
- **Typed text goes through a 300 ms draft.** The router commits search changes in a React
  transition after an async load. A controlled input bound straight to a search param is
  therefore reverted by React and then jumps. The Search box and the date inputs keep a local
  draft and commit once typing pauses, which also means one request per pause, not per
  keystroke.
- **The pager is numbered and driven by `count`:** first, last, and the current page ±2. The
  previous page stays on screen while the next loads (`keepPreviousData`), so a click never
  unmounts the pager or drops keyboard focus. A page that no longer exists, such as a stale
  link or the last row of the last page deleted, returns to page 1 instead of showing an error.

### Page titles (D57, D58)

Every route declares its tab title with the router's `head` option, as "Tasks · Task
Management System", page name first so it survives a narrow tab. `<HeadContent />` in the root
route renders it. `index.html` deliberately has no `<title>`: React 19 hoists the route's title
into `<head>` after any static one, and the browser shows the first.

### Fixes from the browser check (D59–D63)

A Playwright pass over the running app found five problems that the jsdom test suite could
not see. Each fix has a test that failed first.

- **The Compose frontend served stale code (D59).** A Docker bind mount on Windows (and often
  macOS) does not deliver file-change events into the container, so after a `git pull` or a
  branch switch Vite kept serving its cached modules — the merged dashboard rendered as the old
  one until the container restarted. The Compose service sets `DEV_SERVER_POLLING=true`, which
  turns on Vite's polling watcher; a native `npm run dev` keeps native file events.
- **Dialogs did not take focus (D60).** Focus stayed on the button that opened the delete or
  deactivate dialog, outside the `aria-modal` dialog, so a keyboard user tabbed through the whole
  page to reach Cancel, and Escape did nothing. A shared `useModalDialog` hook focuses Cancel
  (the safe default for a destructive action), closes on Escape unless a request is in flight,
  keeps Tab inside the dialog, and returns focus to the opener when it still exists.
- **The assignee picker stopped at 100 users (D61).** It paged `/users/` at its 100-row cap and
  filtered Admins out in the browser, so with more users everyone past the first page was
  unassignable, and D17 was re-derived on the client. `GET /users/assignable/` (Supervisor only)
  returns the assignable set with the minimal fields a Supervisor already sees. The picker offers
  exactly what it reports — the same "report the rule, don't re-derive it" approach as
  `can_delete` and `allowed_transitions`. It first returned the whole set unpaginated; D64
  replaced that with search and paging.
- **Link-styled buttons took two Tab stops (D62).** Seven places wrapped a `<Button>` in a
  router `<Link>` — a `<button>` inside an `<a>`, which is invalid HTML and two Tab stops for one
  control. `ButtonLink` is one element with the button's look; a source-scan test fails if the
  nesting comes back.
- **Deleting from a task's page refetched it (D63).** Invalidating the `["tasks"]` prefix also
  refetched the deleted task's own detail query — a guaranteed 404, logged just before
  navigating to `/tasks`. The detail query is now removed before the rest is invalidated.

### The assignee picker searches as you type (D64)

D61's unpaginated list sent every assignable user (about 500 in the seeded data) to every
Supervisor who opened a task form, and a native `<select>` of hundreds of names is hard to use.
`GET /users/assignable/` is now paged like every other list (20 per page, `page_size` up to 100)
and takes `?search=` over email, first name and last name — the same fields as `/users/`.
D17 is applied before the search, so a search only narrows the set and can never surface an
Admin.

The picker is an ARIA combobox (the WAI-ARIA "combobox with listbox popup" pattern), written
for this project rather than taken from a library: there is one consumer, and the stack has no
UI component library to fit it into.

- Nothing is fetched until the list first opens. Typing searches the server once per 300 ms
  pause, and the current options stay on screen until the new answer arrives.
- More users load when the arrow keys reach the last loaded one, when the list is scrolled to
  its end, or from "Load more". The footer says how many of the total are shown.
- Focus never leaves the input. The active option is announced through
  `aria-activedescendant`, and mouse presses inside the popup do not blur the input.
- Escape, or leaving the field without choosing, puts back the chosen assignee's name. After
  typing, Enter chooses nothing until an arrow key makes an option active, so a stale result
  is never picked by accident.
- The form holds the chosen user, not just an id, so a task whose assignee is past the first
  page still shows their name without fetching anything.

### "No assignee" and "not yours to choose" are different (D65)

The API reads an omitted `assignee` as "leave it alone" (on update) or "assign it to me" (an
Operator's create, D16), and an explicit `null` as "unassign" (D32). The task form used `null`
for both meanings, which broke two things:

- **A Supervisor could not unassign a task.** The edit page dropped a `null` assignee, so
  choosing "Unassigned" saved the old assignee.
- **An Operator could not create a task at all.** The create page sent `assignee: null`, which
  the API refuses from an Operator with `400 assignee_immutable`.

The form now leaves `assignee` out when the actor may not choose one, and sends `null` only
when "Unassigned" was chosen.

### Fixes from the QA report (D66–D78)

A browser QA pass ([QA report](qa/2026-10-07-frontend-qa-report.md)) found fourteen issues; the
design is [the iteration 5 spec](superpowers/specs/2026-10-07-qa-fixes-iteration-5-design.md).
Each fix has a test that failed first.

- **An Admin cannot act on their own account (D66).**
  - Deleting yourself is refused by an object permission, `IsNotSelf`: **403
    `cannot_delete_self`**, the same layer and shape as D27's `delete_requires_creator`.
  - Changing your own role, or deactivating yourself, is refused by the service: **400
    `cannot_change_own_access`**, a field-level refusal like `assignee_immutable`. The service
    compares against the current values rather than testing for presence, because the edit
    page always sends both fields.
  - The UI hides Deactivate on your own row, shows your role read-only and hides the Active checkbox.
  - Two Admins can still remove each other; see [Accepted risks](#accepted-risks).
- **The task table shows its sort (D67, D68).** One sort model, `features/tasks/sorting.ts`,
  serves the headers, the mobile select and URL validation. The default, newest first, is
  marked like any other order. Headers carry `aria-sort` and a ▲/▼ glyph; each sort button's
  accessible name is just its visible label, and `aria-sort` alone announces the state, as in
  the WAI-ARIA APG sortable-table pattern. (Review amended this: the first version named the
  action each button would take.)
- **Phones and tablets can sort, and get cards below `lg` (D69).** At `md` the table's six
  columns did not fit, so badges and actions wrapped. This departs from design spec §11.6's
  "below `md`" for the task table only; the users table keeps `md`.
- **Back to tasks returns to the same list (D70).** List links leave the list's search in the
  router's history state; detail, edit and create forward it, validated like a URL. A deep
  link falls back to the plain list, and so does a task opened in a new tab (Ctrl or middle
  click), because a new tab starts with no history state.
- **Not-found pages explain and lead back (D71, D72).** A shared `NotFoundPanel`, rendered by
  the root route's `notFoundComponent` (`AppNotFound`) with `notFoundMode: "root"`, so both
  unmatched paths and any thrown `notFound()` render once, at the root, inside the app frame
  when signed in. Signed out, the page uses the sign-in page's centred frame, and because child
  guards do not run in root mode, a signed-out `/tasks/a/b` shows it instead of redirecting.
  (Review moved this from the router's `defaultNotFoundComponent`.) A task 404 never says
  whether the task was deleted or is someone else's.
- **Unknown statuses and orderings are dropped from the URL (D73).**
- **No route loads while auth is still loading (D74).** `router.invalidate()` loads, and a
  load before the session was known mounted the page and fetched its data before the
  redirect. The test harness had copied the effect by hand; both now share
  `useRouterAuthSync`, in its own module `src/app/useRouterAuthSync.ts`. Callers must not
  render `RouterProvider` until auth has settled.
- **Focus moves to the first error after a failed submit (D75).** This covers the forms and
  also the two delete dialogs: after a failed delete the dialog focuses its error. A jsdom-only
  probe had missed that real browsers drop focus to `<body>` when the focused button becomes
  disabled, so the dialog focus trap (`useModalDialog`) now also pulls focus back into the
  dialog from a non-tabbable element or `<body>`, and keeps Tab inside while every control is
  disabled. A validation error naming a field the form does not render now shows as the
  form-level message.
- **Due dates show as the UTC day the form edits, with no time (D76).** A seeded due date
  carrying a real time shows its UTC day.
- **The current menu item is marked, and header targets are 44 px (D77).**
- **An impossible date range is explained, not hidden (D78).** The message is an
  always-mounted polite live region that both date inputs reference through `aria-describedby`,
  so it is announced whichever field caused the inversion; only Due before is marked
  `aria-invalid`. A single-day range (after equals before) is valid.

### Structured logs and the request id (D89–D93)

Every line the API and the worker write is one JSON object. A failed login, for example,
writes these two lines:

```json
{"timestamp": "2026-10-07T20:09:36.751+00:00", "level": "WARNING", "logger": "apps.users.auth_views", "message": "auth.login_failed", "request_id": "live-check-login", "ip": "127.0.0.1", "email": "supervisor@demo.local"}
{"timestamp": "2026-10-07T20:09:36.751+00:00", "level": "WARNING", "logger": "apps.core.middleware", "message": "http.request", "request_id": "live-check-login", "method": "POST", "path": "/api/v1/auth/login/", "status": 401, "duration_ms": 904.1, "actor_id": null}
```

**How the id gets onto every line.**
- `RequestIdMiddleware` is first in `MIDDLEWARE`. It binds the id in a `ContextVar`
  (`apps/core/request_context.py`) before anything else runs, and resets it afterwards, even when
  the view raises.
- `RequestIdFilter` sits on the one console handler and copies the bound id onto each record as
  it is emitted. Django's and Celery's lines get it as well as ours, with no code passing it
  around.
- A `ContextVar` rather than a thread-local: it is isolated per thread and per asyncio task, and
  resetting with the token restores the outer value exactly. That matters for an eager Celery
  task, which runs inside the request that called it.

**Across the broker (D90).** `apps/core/celery_context.py` connects three Celery signals:
- `before_task_publish` stamps the bound id onto the message as a `request_id` header;
- `task_prerun` binds it in the worker;
- `task_postrun` restores the previous value, so the next task on the same worker cannot inherit
  it.

A worker exposes message headers as attributes of `task.request`, while `Task.apply()` nests
them under `task.request.headers`, so the handler reads both. A carried id is validated like any
other input. With no carried id, an eager task keeps the request's id, and anything else (the
beat sweep, a shell) logs under its own task id. `CELERY_WORKER_HIJACK_ROOT_LOGGER = False`
stops the worker replacing the JSON handler with Celery's plain-text one. This was verified
against a real worker: a task published inside a request logged that request's id, and the next
task did not inherit it.

**One access line per request (D92).** The middleware logs method, path, status, duration and
actor. It logs at INFO, at WARNING for 4xx and at ERROR for 5xx. Django would log every 4xx a
second time, *after* the middleware has unbound the id, so `django.request` is set to ERROR. An
unhandled exception is still logged with its traceback, inside the request, with its id.
runserver's own line is sent to a `NullHandler`: it duplicates the access line, has no id, and
logs the full query string. A `NullHandler` rather than no handler, because a non-propagating
logger with no handler falls through to Python's last-resort handler, which prints warnings as
plain text.

**Events are names plus fields (D93).** The pattern is
`logger.info("task.updated", extra={"task_id": ..., "fields": [...], "actor_id": ...})`. The field
names are shared across events: `actor_id` is always who acted, and `task_id` and `user_id` are
what was acted on. `fields` lists the names of changed fields, never their values.

**Following one request.** The response carries the id in `X-Request-ID`. Search both
processes' logs for it:

```bash
docker compose logs backend worker | grep 01a117fc-4264-7521-9ae3-f93b790ec5c5
```

### TanStack Form, Table and Store (D79–D88)

The hand-written forms, tables and component state moved to TanStack Form 1.33, TanStack
Table 9.2 and TanStack Store 0.11, with no change in behaviour: the existing tests pass
unchanged apart from the three that tested replaced code directly (the URL draft hook, the
pager, `nextOrdering`). Form and Table both run on Store, so all three share one
`@tanstack/store` copy.

- **Every form draft is a TanStack Form (D79).** The sign-in, task and user forms and both
  filter panels use one set of bound field components (`src/components/form/`), so they share
  one look and one error display. Validation stays on the server.
- **Server errors live in Form's `onServer` slot (D80).** One mapper, `toServerErrors`,
  replaces three copies of the same branching. It routes only the keys a form renders an
  error for: Form writes the error map to every registered field, so an error keyed on
  `description` would otherwise appear under a textarea that never showed one. Field errors
  are cleared before every submit: while one stands, Form refuses to submit, so a second
  attempt would silently do nothing. The form-level message lives in a small store beside the
  form (`formMessageStore`), because Form clears a form-level `onServer` error on the next
  change or blur, and today's forms keep it until the next submit.
- **Form defaults are a snapshot (D81).** `useForm` re-applies changed `defaultValues` to an
  untouched form on every render, and the detail queries refetch on window focus. The task
  and user edit forms therefore take their defaults once, as the `useState` initialisers they
  replaced did, so D40 still holds; the filter panels take theirs from the URL once.
- **The filter panels are Forms, kept in step with the URL by `useUrlFieldSync` (D82).** It
  replaces `useSearchParamDraft` with the same rules (D46, D50) plus a queue of writes not
  yet echoed: two quick checkbox clicks put two navigations in flight, and the first echo must
  not revert the second. A write is queued unless it equals where the URL is already heading
  (the last queued write, or the URL itself): comparing with the rendered URL let a write back
  to it go unqueued, and its echo then erased newer typing. `cancel()` keeps the queue, so a
  write already in flight is still recognised as an echo; Clear also puts every field to its
  cleared value, because an in-flight checkbox write could otherwise leave the box showing a
  filter the URL no longer has. The hook owns its timer because Form's debounce cannot be
  cancelled, and Clear must cancel a pending date.
- **Tables own no state (D83–D85).** `createTableHook` sets up server-side sorting and paging
  once; each list passes `sorting`, `pagination` and column visibility from the URL and
  writes every change back through `navigate`. Table's own click cycle replaced
  `nextOrdering`. The pager is a registered table component reading the table's pagination
  model; one handler turns a proposed change into a push (a page move) or a replace back to
  page 1 (a size change, D47), ignoring the page index Table computes to keep the top row in
  view. The pager counts from the current page clamped to the page count, as the old pager
  did, so Prev from a stale out-of-range page goes to the last page rather than to the page
  before the stale one.
- **The session and each page's UI state live in stores (D86–D88).** `SessionProvider`
  creates the one session store, and `useAuth()` keeps its shape. Each list or detail page
  creates its own store on mount, so its dialog and busy state start clean on every visit, as
  `useState` did, and a row selects only its own busy flag. DOM and timing primitives
  (`useFocusFirstError`, `useModalDialog`, `useDebouncedValue`, `useUrlFieldSync`) keep their
  internal React state.
- **Bundle size:** the production JS went from 120.46 kB to 149.15 kB gzip.

## Known limitations and exit criteria

### Accepted risks

These are known and deliberate, not oversights. Each is listed with what could be done
about it, so the next person decides rather than rediscovers.

| Risk | Detail | Mitigation available |
|---|---|---|
| **No recovery path for a soft-deleted row** | D20 provides no restore endpoint, so a deletion is irrecoverable through the API and recoverable only at the database level. D27 keeps the blast radius small: an Operator can only delete tasks they created, so the worst case is someone destroying their own work. A Supervisor can delete any task. | A Supervisor-only restore endpoint: one view plus one matrix row, since `all_objects` already exposes deleted rows. |
| **A UUIDv7 is not a secret** | A cold guess faces roughly 2^73, but a *sibling* id minted in the same millisecond by the same process is far weaker, since the counter advances by increment. An id must never be treated as a capability token. | None needed — no authorization anywhere depends on id secrecy, and the matrix suite proves it. |
| **A `User` id discloses `date_joined`** | UUIDv7's timestamp prefix is readable by anyone holding the id. Harmless for `Task`, whose `created_at` is already public, but the minimal user serializer exposes `id` while deliberately withholding `date_joined` — so anyone who can see a nested `assignee` can recover that user's account-creation time. A real if minor widening of a boundary. **Accepted.** | Key `User` on UUIDv4 and keep v7 elsewhere: `User` is low-insert-rate so it gains little from v7, and both store identically as Postgres `uuid` — a one-line default change, no migration. Not done because D28 asks for v7 on all ids. |
| **Two dependencies are untested above Django 6.0** | simplejwt@master's tox matrix and drf-spectacular's classifiers both stop at 6.0, which is why D1 pins 6.0. | The `compat` job verifies the combination on every push. |
| **Python 3.14 support is verified for only part of the stack** | Only simplejwt and drf-spectacular were checked package-by-package; DRF, django-simple-history, django-filter, Celery, psycopg and factory_boy were not. | `compat` stage 1 runs `uv sync`, which fails outright if anything caps below 3.14 — a resolution error, not a subtle runtime bug. It resolved cleanly. |
| **A git-pinned dependency sits outside advisory tooling** | `pip-audit` and Dependabot cannot track a git SHA, and this is the **authentication** library. | The D3 exit criterion below; `compat` signals when a PyPI release can replace it. |
| **Django 6.0 is a security-fix-only branch** | 6.0 left mainstream support when 6.1 shipped (Aug 2026). | The same exit criterion. |
| **Two Admins can remove each other** | D66 stops an Admin acting on their own account, but a "last active Admin" rule was declined: one Admin can deactivate another, who could have done the same. With no restore endpoint (D20), recovering from zero Admins needs shell access (`createsuperuser`). | A service check that refuses to deactivate, delete or demote the last active Admin, under a row lock so two concurrent requests cannot both pass it. |
| **TanStack Store is pre-1.0** | The session and page stores use `createStore`, `useCreateStore`, `createStoreContext` and `useSelector` from `@tanstack/react-store` 0.11, and Form and Table depend on the same package. A 0.x minor release may change those APIs. | The `^0.11.2` range admits patch releases only, and Form and Table resolve to the same copy. See the exit criterion. |

### Exit criteria

| Limitation | Exit criterion |
|---|---|
| simplejwt is a git pin, outside Dependabot and `pip-audit` coverage (D3) | A simplejwt release containing PR #959 ships; move back to PyPI and relax D1 toward Django 6.1. |
| Django 6.0 is a security-fix-only branch (D1) | Same as above — D1 is gated on D3. |
| `ruff format` rewrites Python code blocks embedded in Markdown, which would edit the read-only `AGENTS.md` briefs | `AGENTS.md` is in `extend-exclude` in `backend/pyproject.toml`. Remove it only if ruff gains a narrower setting for embedded code. |
| **`auth.E003` is silenced** in `SILENCED_SYSTEM_CHECKS` — see below | Django's `Options.total_unique_constraints` learns to count partial constraints. Until then the check cannot be satisfied, only silenced. |
| **The SPA and the API must be deployed same-site** — see below | Serve both from one registrable domain (the recommendation), or move to `SameSite=Lax`/`None` and add explicit CSRF token validation on `/api/v1/auth/refresh/` and `/logout/`. |
| TanStack Store is pre-1.0 (D86–D88) | Store 1.0 ships: re-check `createStore`, `useCreateStore`, `createStoreContext` and `useSelector`, widen the range, and remove the accepted risk. |
| ~~drf-spectacular generator warnings~~ — **resolved.** `get_serializer_class()` and `get_queryset()` now tolerate the request-less schema pass, and the hand-written actions carry `@extend_schema`. `spectacular --validate` reports 0 warnings and 0 errors. | — |

### Why the SPA and the API must be same-site

The refresh cookie is `SameSite=Strict`, which is the **primary CSRF defence** for the two
cookie-authenticated endpoints: a cross-site request does not carry the cookie at all.

Locally this coexists with CORS only because of a distinction that is easy to miss:
`localhost:5173` and `localhost:8000` differ by port, which CORS treats as cross-*origin*
but `SameSite` does not treat as cross-*site* — ports are not part of a site. So CORS must
be configured (and is, explicitly) while the cookie still flows.

A deployment that puts the SPA and the API on different **registrable domains** would
silently stop sending the refresh cookie, and refresh would fail with no CORS error to
explain it. That is the failure mode worth knowing about in advance.

### Why `auth.E003` is silenced

This is a security-adjacent check, so it should not be discovered later by reading
settings. `auth.E003` requires `USERNAME_FIELD` to carry a **total** unique constraint, and
Django's `Options.total_unique_constraints` deliberately excludes partial ones. D21 needs
the email constraint to be partial (`WHERE deleted_at IS NULL`) so a deleted user's address
becomes reusable — so the check is unsatisfiable by construction, not merely inconvenient.

The guarantee it would have given is not abandoned, it is relocated to a test:
`test_two_live_users_cannot_share_an_email` asserts the `IntegrityError` against real
Postgres, and `test_a_soft_deleted_users_email_becomes_reusable` asserts the other half.
A plain `unique=True` would satisfy the checker and break the requirement.
