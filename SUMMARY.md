# Presentation guide

A one-page map for presenting this project and for its code review. It covers where each
requirement of the brief is met, what to show and in which order, and which code to open.
Setup is in the [README](README.md).

> **How this was built.** The project simulates a real software project, built with an AI coding
> agent (Claude Code). The code was written by the agent, iterating through specs, plans and
> reviews, with **minimal direct code intervention by the engineer**. The engineer:
> - **wrote the three `AGENTS.md` files before any code.** They are the rulebook the agent had to
>   follow: layering, security, testing and frontend state. Most of the content is the
>   engineer's own, with only small AI help to organise the files;
> - wrote the brief;
> - reviewed every spec, plan and change;
> - corrected the agent where it was wrong;
> - made the decisions.
>
> [TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md) lists the 48 `AGENTS.md` conventions
> (A1–A48) and marks each numbered decision as **Engineer**, **Engineer + AI** or **AI**.

## 1. Document index

| Document | Use it for |
|---|---|
| [README.md](README.md) | Setup, demo credentials, how to run tests, API overview |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | All diagrams: containers, backend layers, data model (with history tables), flows, capability matrix, frontend |
| [docs/TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md) | The engineer's `AGENTS.md` conventions (A1–A48) and where each landed; decisions D1–D78 with reason and **origin** (Engineer, Engineer + AI, AI); overrides; accepted risks |
| [docs/GENAI-WORKFLOW.md](docs/GENAI-WORKFLOW.md) | The brief's GenAI section: prompt, output, validation, corrections, edge cases, performance |
| [docs-external/PROMPT-LOGS.md](docs-external/PROMPT-LOGS.md) | Verbatim prompts, and an example of the code a prompt produced |
| [docs/qa/2026-10-07-frontend-qa-report.md](docs/qa/2026-10-07-frontend-qa-report.md) | Browser QA (responsive, forms, navigation), test and coverage results, re-test of all 14 findings |
| [docs/superpowers/specs/](docs/superpowers/specs/), [plans/](docs/superpowers/plans/) | The spec and the test-first plan of each of the five iterations |
| [AGENTS.md](AGENTS.md), [backend/AGENTS.md](backend/AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md) | The engineer's rulebook for the agent, written before the first prompt and never modified since |

## 2. Suggested flow (about 30 minutes)

1. **User story (2 min).** Use [spec §1.3](docs/superpowers/specs/2026-10-05-task-management-system-design.md#13-user-story):
   - a Supervisor assigns work and watches what is overdue;
   - an Operator sees only their own queue;
   - an Admin manages accounts **without** touching the work.

   The third clause shapes the whole permission design.
2. **Architecture (5 min).** Use [ARCHITECTURE.md](docs/ARCHITECTURE.md):
   - the containers diagram;
   - the backend layers diagram;
   - the data model;
   - the capability matrix.
3. **Design choices (5 min).** Start with what the engineer set before any code:
   - the [`AGENTS.md` conventions](docs/TECHNICAL-DECISIONS.md#the-conventions-the-engineer-set-in-agentsmd),
     for example A9 (layering), A20 (permissions), A35 (TDD and 80% coverage) and A45 (no
     duplicated rules in the UI);
   - the [brief's baseline](docs/TECHNICAL-DECISIONS.md#the-baseline-the-engineer-set).

   Then take three or four decisions from the log, such as D11, D27, D28 and D45, and name each
   one's origin.
4. **Demo (10 min).** Follow the script in §3.
5. **GenAI (5 min).** Use [GENAI-WORKFLOW.md](docs/GENAI-WORKFLOW.md) and the prompt logs:
   - the prompt;
   - the spec, then plan, then reviewed-execution loop;
   - where the agent was wrong and how it was caught.
6. **Quality (3 min).** Cover the test numbers in §6, the QA report, and CI.

## 3. Demo script

Start the stack and seed it first ([Quick start](README.md#quick-start)). Every account's password
is `DemoPass!2026`.

| Step | Do | Point out |
|---|---|---|
| 1 | Sign in as `supervisor@demo.local` | Lands on the dashboard: status counts, **Overdue**, **Due in 7 days** |
| 2 | **View tasks** on the Overdue card | The list matches the card's number; the filter is in the URL |
| 3 | Sort by **Due date** twice; change the page size; refresh | ▲/▼ with `aria-sort`; the state survives a refresh because it lives in the URL |
| 4 | Open a task, then **Back to tasks** | Returns to the same filtered, sorted page (D70) |
| 5 | **New task**; type in the assignee box; save | The picker searches as you type. The task opens on its detail page |
| 6 | Open MailHog at http://localhost:8025 | The assignment email, sent by the Celery worker after the commit |
| 7 | Edit the task to *In progress*, then **Complete** | Completed is terminal: the status is read-only afterwards |
| 8 | Narrow the window to phone width | Cards plus a **Sort by** select; no horizontal scroll |
| 9 | Submit an empty **New task** form | Focus jumps to the first invalid field (D75) |
| 10 | **Sign out**; sign in as `operator@demo.local` | Only tasks assigned to this Operator; **Delete** only on tasks they created (D27) |
| 11 | Paste another user's task URL | "Task not found", which does not reveal whether it exists (D72) |
| 12 | Sign in as `admin@demo.local` | Only **Users**, no Tasks menu (D13); no **Deactivate** on their own row (D66) |
| 13 | Open Swagger UI at http://localhost:8000/api/v1/schema/swagger-ui/; run `POST /auth/login/` as the Admin, **Authorize** with the `access` token, then `GET /tasks/` | The OpenAPI 3 docs; the Admin's 403 and the `{detail, code, errors}` error shape |

Login is limited to 5 attempts a minute, so avoid failed logins mid-demo.

## 4. Requirements checklist

### Backend

| Requirement | Status | Where |
|---|---|---|
| Django REST Framework | ✅ | Django 6.0 + DRF: [`backend/config/settings/base.py`](backend/config/settings/base.py) |
| CRUD endpoints for tasks | ✅ | [`apps/tasks/views.py`](backend/apps/tasks/views.py) `TaskViewSet` (list, create, retrieve, PATCH, delete). Users have CRUD too: [`apps/users/views.py`](backend/apps/users/views.py) |
| Assign tasks; mark completed | ✅ | `assignee` on create and PATCH; `POST /tasks/{id}/complete/` ([`TaskService.complete`](backend/apps/tasks/services.py)) |
| JWT authentication | ✅ | [`apps/users/auth_views.py`](backend/apps/users/auth_views.py), [`cookies.py`](backend/apps/users/cookies.py), `SIMPLE_JWT` in settings |
| Pagination | ✅ | [`apps/core/pagination.py`](backend/apps/core/pagination.py): 20 per page by default, `page_size` up to 100 |
| Filter by status and due date | ✅ | [`apps/tasks/filters.py`](backend/apps/tasks/filters.py): `status`, `due_date_after`, `due_date_before`, `overdue` |
| PostgreSQL; schema design | ✅ | Postgres 16; [data model](docs/ARCHITECTURE.md#data-model) |
| pytest unit tests for critical endpoints | ✅ | `backend/apps/*/tests/`: 384 tests (auth, permission matrix, tasks, notifications) |
| At least 80% coverage | ✅ | **100%**; the 80% gate is in `addopts` in [`backend/pyproject.toml`](backend/pyproject.toml) |
| Dockerfile and docker-compose.yml | ✅ | [`backend/Dockerfile`](backend/Dockerfile), [`frontend/Dockerfile`](frontend/Dockerfile), [`docker-compose.yml`](docker-compose.yml) |
| README with setup and key decisions | ✅ | [README.md](README.md); full log in [TECHNICAL-DECISIONS.md](docs/TECHNICAL-DECISIONS.md) |
| Swagger / drf-yasg API docs | ✅ with a deviation | **drf-spectacular** serves Swagger UI and ReDoc. drf-yasg's support stops at Django 5.2 and it emits only OpenAPI 2.0 (D4) |
| pyproject.toml (uv), pre-commit, good practices | ✅ | [`backend/pyproject.toml`](backend/pyproject.toml) + `uv.lock`, [`.pre-commit-config.yaml`](.pre-commit-config.yaml), [CI](.github/workflows/ci.yml) |
| Rate limiting | ✅ | [`apps/core/throttling.py`](backend/apps/core/throttling.py). Login 5/min per IP, refresh 30/min, anonymous 20/min, user 120/min; counters in Redis |
| Background processing (Celery + Redis) | ✅ | [`config/celery.py`](backend/config/celery.py), [`apps/notifications/tasks.py`](backend/apps/notifications/tasks.py): change emails plus the hourly overdue sweep |

### Frontend and submission

| Requirement | Status | Where |
|---|---|---|
| Integrated frontend (React) | ✅ | [`frontend/`](frontend/README.md): React 19, TanStack Router and Query |
| Responsive and user-friendly | ✅ | [QA report](docs/qa/2026-10-07-frontend-qa-report.md) §3.7 and §7: checked at 360, 768 and 1024+ px |
| CRUD for the use case | ✅ | [`features/tasks/`](frontend/src/features/tasks/), [`features/users/`](frontend/src/features/users/) |
| Structured code and state | ✅ | One folder per feature; [state homes](docs/ARCHITECTURE.md#frontend) |
| Seeded data and credentials | ✅ | [`seed_demo_data`](backend/apps/users/management/commands/seed_demo_data.py); [credentials](README.md#demo-credentials) |

### GenAI

| Requirement | Where |
|---|---|
| The prompt used to generate the implementation | [PROMPT-LOGS.md](docs-external/PROMPT-LOGS.md) (first prompt); explained in [GENAI-WORKFLOW § The prompts](docs/GENAI-WORKFLOW.md#the-prompts) |
| The output code, or a sample | [PROMPT-LOGS.md](docs-external/PROMPT-LOGS.md); [GENAI-WORKFLOW § The output](docs/GENAI-WORKFLOW.md#the-output) |
| How suggestions were validated | [GENAI-WORKFLOW § Validated](docs/GENAI-WORKFLOW.md#how-the-output-was-validated) |
| How output was corrected | [GENAI-WORKFLOW § Got wrong](docs/GENAI-WORKFLOW.md#what-the-generated-output-got-wrong); decisions marked **Engineer** in [TECHNICAL-DECISIONS](docs/TECHNICAL-DECISIONS.md) |
| Edge cases, authentication, validations | [GENAI-WORKFLOW § Edge cases](docs/GENAI-WORKFLOW.md#how-edge-cases-authentication-and-validation-were-handled) |
| Performance and idiomatic quality | [GENAI-WORKFLOW § Performance](docs/GENAI-WORKFLOW.md#how-performance-and-idiomatic-quality-were-assessed) |

## 5. Talking points by evaluation criterion

### Clean Architecture
- **The layers were the engineer's rule before any code.** backend/AGENTS.md §1 and §50 (A9,
  A39) prescribe views → serializers → services → repositories, with selectors for reads and
  explicit dependency injection ([diagram](docs/ARCHITECTURE.md#backend-layers)).
- **Services know only a Protocol.** [`TaskService`](backend/apps/tasks/services.py) depends on
  [`TaskRepository`](backend/apps/tasks/repositories.py). The viewset's `get_service()` is the
  only place a concrete repository is named.
- **A test enforces it.** [`test_layering.py`](backend/apps/core/tests/test_layering.py) fails if
  a service imports the ORM or a concrete repository.
- **Shared code without a dumping ground.** [`apps/core/`](backend/apps/core/) holds one named
  responsibility per module.
- **Frontend boundaries.** Pages use hooks, hooks use services, and services use the single
  [`api-client.ts`](frontend/src/lib/api-client.ts). Components never call `fetch`.

### Application testing (TDD)
- **Test-first.** Every plan step writes the test and runs it to watch it fail before any
  implementation. See any plan in [plans/](docs/superpowers/plans/).
- **Every permission cell over HTTP.**
  [`test_permission_matrix_api.py`](backend/apps/core/tests/test_permission_matrix_api.py) drives
  a request against each cell of the matrix.
- **Hard-to-test behaviour has tests:**
  - concurrency: [`test_concurrency.py`](backend/apps/tasks/tests/test_concurrency.py);
  - on-commit dispatch: [`test_on_commit.py`](backend/apps/notifications/tests/test_on_commit.py);
  - deduplication: [`test_dedupe.py`](backend/apps/notifications/tests/test_dedupe.py);
  - query counts: [`test_query_counts.py`](backend/apps/tasks/tests/test_query_counts.py).
- **Frontend tests:**
  - Vitest with React Testing Library and MSW, where an unmocked request fails;
  - a console guard that fails any test logging an unexpected error or warning;
  - full-app routing tests through [`render-app.tsx`](frontend/src/test/render-app.tsx).

### Code quality
- **Linters and types:** ruff (including the Django rules) and mypy; oxlint and `tsc`.
- **The same gates everywhere:** pre-commit before commits and pushes, then CI's `lint`,
  `compat`, `backend` and `frontend` jobs.
- **One error contract.** [`apps/core/exceptions.py`](backend/apps/core/exceptions.py) gives
  every error the shape `{detail, code, errors}`, and the UI branches on `code`.

### Functionality, with no console warnings
- **Browser QA.** All 14 findings of the [QA report](docs/qa/2026-10-07-frontend-qa-report.md)
  were fixed and re-tested in a real browser (§7).
- **Console noise fails CI.** The only expected console line is the anonymous `POST
  /auth/refresh/` 401 ([why](README.md#troubleshooting)).

### Backend best practices
- **Security:**
  - the refresh token lives in an HttpOnly cookie, rotates, and is blacklisted on logout;
  - throttling;
  - authorization on the server, in three layers: matrix, object permissions, queryset scoping;
  - a 404 instead of a 403 where a 403 would leak that a row exists.
- **Integrity:**
  - a CHECK constraint on `completed_at`;
  - a partial unique email index;
  - `PROTECT` foreign keys;
  - soft delete with `django-simple-history`;
  - row locks (`select_for_update`) on updates and completion.
- **Asynchronous work:**
  - emails are enqueued only after commit;
  - a unique dedupe key makes retries safe;
  - only transport errors are retried;
  - the overdue sweep is limited to one email per task, per recipient, per day.
- **Performance:**
  - partial indexes;
  - `select_related` chosen per action;
  - query-count tests;
  - the overdue sweep streams rows with `.iterator()`.

### Frontend best practices
- **State:** server state in TanStack Query, list state in the URL, the user in Context, and the
  token in module memory ([table](docs/ARCHITECTURE.md#frontend)).
- **Sessions:** a single-flight token refresh shared by concurrent requests
  ([`api-client.ts`](frontend/src/lib/api-client.ts)).
- **Route guards are UX only.** They are in [`router.tsx`](frontend/src/app/router.tsx), and the
  API enforces every rule anyway.
- **Accessibility:**
  - dialogs trap focus ([`useModalDialog.ts`](frontend/src/components/useModalDialog.ts));
  - focus moves to the first error ([`useFocusFirstError.ts`](frontend/src/components/useFocusFirstError.ts));
  - sortable headers carry `aria-sort`;
  - the assignee picker is an ARIA combobox ([`AssigneeCombobox.tsx`](frontend/src/features/tasks/components/AssigneeCombobox.tsx));
  - touch targets are 44 px.

### GenAI fluency and critical thinking
- **Context engineering came first.** Before the first prompt, the engineer wrote the agent's
  rulebook: three `AGENTS.md` files, 48 conventions. The planning prompt told the agent to plan
  against their definition of done. The conventions table in
  [TECHNICAL-DECISIONS](docs/TECHNICAL-DECISIONS.md#the-conventions-the-engineer-set-in-agentsmd)
  shows where each rule landed, and where it fell short.
- **The agent pushed back, with evidence.** It replaced the brief's drf-yasg with drf-spectacular
  (D4), and the engineer accepted.
- **The engineer overruled the agent.** The engineer restored the repository layer (D8, D9) and
  closed the Operator-delete risk (D27).
- **The agent's mistakes were caught.** Examples from
  [GENAI-WORKFLOW](docs/GENAI-WORKFLOW.md#what-the-generated-output-got-wrong):
  - a plan comment claimed a bug that does not exist;
  - a jsdom-only focus test passed without testing anything, and a real browser exposed it;
  - a documented "no index on `created_by`" turned out to be false against the live schema.
- **The scale of the loop:** 5 iterations, 107 planned tasks, each reviewed twice, and 162 of
  178 commits co-authored by the agent.

## 6. Numbers to quote

These were measured on 2026-10-07 against `main` at `59ce235`.

| Metric | Value |
|---|---|
| Backend tests | **384 passed**; coverage **100%** (1086 of 1086 statements); gate 80% |
| Frontend tests | **303 passed** in 19 files; coverage 94.75% statements, 88.87% branches, 96.63% lines |
| Static checks | ruff, ruff format and mypy clean; `tsc` clean; oxlint at its baseline of 5 warnings |
| Engineer's conventions | 48 rules (A1–A48) in three `AGENTS.md` files, written before the first prompt |
| Decisions | 79: 10 Engineer, 22 Engineer + AI, 47 AI |
| Delivery | 5 iterations, 107 planned tasks, 178 commits |

## 7. Questions to be ready for

- **"Why not drf-yasg?"** D4: drf-yasg's support stops at Django 5.2, and it emits only OpenAPI
  2.0. drf-spectacular still serves Swagger UI.
- **"Where is PUT?"** Updates are `PATCH` only, by design. Every edit is partial, and D32 tells
  an omitted field apart from an explicit `null`.
- **"Why can an Admin not see tasks?"** D13 and the user story: account administration is kept
  apart from the operational data.
- **Known limitations**
  ([accepted risks](docs/TECHNICAL-DECISIONS.md#accepted-risks)):
  - there is no restore endpoint for soft-deleted rows;
  - two Admins can deactivate each other;
  - simplejwt is pinned to a git commit until a release supports Django 6;
  - the SPA and the API must be served from the same site.
- **Found while preparing these docs, and not fixed yet:**
  - **Unused default indexes.** Django's default foreign-key index on `tasks_task.created_by_id`
    serves no query.
  - **Vite template leftovers.** `frontend/src/App.tsx`, `App.css`, `src/assets/` and
    `public/icons.svg` are the Vite starter files, and nothing imports them.
  - **One test warning.** The test settings' JWT signing key is shorter than PyJWT recommends,
    which produces the 13 warnings in the backend run.
  - **Two `AGENTS.md` rules only partly met.** There is no per-account login lockout, though login
    is throttled per IP and failures are logged (A25). Logs have event names and ids but no
    request id (A30).
  - **An unrecorded override.** The MailHog service departed from root `AGENTS.md` §5 without
    being listed as an override. It is listed now.
