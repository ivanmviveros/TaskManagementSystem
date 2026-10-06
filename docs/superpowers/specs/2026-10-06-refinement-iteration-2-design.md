# Refinement Iteration 2 — Design Specification

**Date:** 2026-10-06
**Builds on:** [2026-10-05-task-management-system-design.md](2026-10-05-task-management-system-design.md)
**Status:** approved

---

## 1. Scope

Five concerns raised after reviewing the delivered application. Each is self-contained; none
changes the architecture established in the first iteration.

| # | Concern | Nature |
|---|---|---|
| 1 | Use pydantic for data validation instead of plain dicts | Refactor with a new dependency |
| 2 | Parameterise `seed_demo_data`; random users and assignment; document it | Feature |
| 3 | Console warnings and errors on the login page for anonymous users | Partly real, partly not ours |
| 4 | Users table should match the tasks table's responsive behaviour | Frontend parity |
| 5 | The `pre-push` hook fails because it runs pytest with local `uv` | Tooling |

### 1.1 Two concerns were not what they appeared

Investigation changed the shape of concern 3 and the cause of concern 5. Both corrections are
recorded here because acting on the original framing would have produced the wrong work.

**Concern 3 — most of the console output is not this application.** 202 of the 346 captured
lines (about 58%) originate from `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn`, which
is **MetaMask**. Its `MaxListenersExceededWarning: Possible EventEmitter memory leak` and
`ObjectMultiplex - orphaned data for stream "app-init-liveness"` entries are its content script
talking to itself, and appear on any page in that browser profile. No change to this codebase
can affect them.

**The `500` on login was not a defect either.** The backend traceback reads:

```
django.db.utils.ProgrammingError: relation "users_user" does not exist
POST /api/v1/auth/login/ HTTP/1.1  500
```

The login was attempted before `manage.py migrate` had run against a fresh database. Every
subsequent login in the same log returned `200`. This is the same startup-ordering sharp edge
already documented for `celery beat`, and it is a workflow issue, not a code one.

**What remains is real:** an anonymous first load fires **three** failed requests where one
would do. See §4.

**Concern 5 — the cause is a host port collision, not the choice of runner.** The hook's
`uv run --directory backend pytest` fails here with:

```
FATAL: la autentificación password falló para el usuario «taskmanagement»
```

A **native, Spanish-locale PostgreSQL** is listening on `127.0.0.1:5432` and has no
`taskmanagement` role. Both it and the Compose `db` bind `0.0.0.0:5432`, and the native server
wins the loopback race. On a machine without that collision the local run would succeed. The
fix requested — prefer Compose, fall back to local — is still the right one, but the reason
matters: it is machine-specific, so the local path must stay supported rather than be removed.

### 1.2 Dropped from scope

An earlier draft proposed an env-driven sweep cadence (`SWEEP_CRON_MINUTE`) to replace an
uncommitted local edit that changed `crontab(minute=0)` to `crontab()`. That edit has since
been reverted, so the feature has no remaining need and is **not** part of this iteration.

---

## 2. Decision log

Continues the numbering of the first iteration, which ended at D28.

| # | Decision | Rationale |
|---|---|---|
| D29 | **Pydantic validates at the service boundary; DRF serializers keep the HTTP boundary.** | The two layers answer different questions, so neither becomes a second source of truth. Replacing DRF would mean rebuilding the §8.7 error contract and re-teaching drf-spectacular the request shapes, against 320 passing tests, for no gain in the stated goal. |
| D30 | **A DTO validation failure is a programming error, surfaced as 500 — never mapped to 400.** | The serializer already accepted the payload. A `ValidationError` at DTO construction means the view and the service disagree about the contract. Translating it to a user-facing 400 would hide a defect and duplicate the error contract. |
| D31 | **Input DTOs carry already-resolved model instances (`assignee: User \| None`) via `arbitrary_types_allowed`.** | `PrimaryKeyRelatedField` has already proven the row exists and is live. Carrying ids instead would add a `UserRepository` dependency to `TaskService` and a second query to re-fetch a validated object. |
| D32 | **Partial updates key off `model_fields_set`, not truthiness or `None`.** | PATCH semantics require distinguishing "absent" from "explicitly null" — `assignee: null` unassigns a task, while omitting `assignee` leaves it alone. A DTO with defaults erases that distinction unless the set of supplied fields is consulted. |
| D33 | **Seeding flags are additive and top-up, and the defaults keep today's shape — but not its exact rows.** | `--users 0 --tasks 45` keeps the same counts, the same five fixed accounts, the same `Demo task NN` titles, the same status cycle and the same due-date spread. It does **not** reproduce today's rows exactly: §5.1 deliberately changes who tasks are assigned to and created by, so the delete rule is demonstrable. "Byte for byte" was claimed in an earlier draft and is withdrawn — it contradicted the randomised `created_by` in the same spec. |
| D34 | **Random users are generated from a name list inside the command, not with factory_boy.** | `factory_boy` is in the `dev` dependency group. A management command is application code and must not import a dev-only package, or a production install breaks. |
| D35 | **Auth bootstrap attempts a refresh first, then fetches the user.** | Probing `/users/me/` without a token is a guaranteed 401. Refresh-first is better on both paths and removes two of three failed requests. See §4. |
| D36 | **The pre-push hook tries Compose, then local, and passes if either suite passes.** | Compose is the development default; the local path must remain usable where Docker is not. Explicitly chosen by the project owner over the stricter alternative — see §6.2 for the risk this accepts. |

---

## 3. Concern 1 — pydantic at the service boundary

### 3.1 The division of responsibility

```
HTTP request
    │
    ▼
DRF serializer ─── owns: field types for the wire, choice vocabularies,
    │                    password strength, D15/D16/D17 assignee rules,
    │                    and the §8.7 {detail, code, errors} response
    │
    ▼  validated_data (dict)
pydantic DTO  ─── owns: the shape the service relies on —
    │                    which fields exist, their types, what is optional
    │
    ▼  typed object
service       ─── reads data.title, data.assignee; no .get(), no KeyError
```

Nothing that produces a user-facing error message moves. The DTO exists so the service has a
contract it can trust, and so a renamed or dropped serializer field fails loudly instead of
silently becoming a default.

`extra="forbid"` is what makes that loudness real: an unexpected key raises rather than being
ignored.

**The view constructs the DTO by splatting `validated_data`**, and that choice is what gives
`extra="forbid"` something to do:

```python
dto = TaskCreateInput(**serializer.validated_data)
```

This must be stated, because the alternative — mapping field by field — would make
`extra="forbid"` unreachable and §3.1's rationale hollow. Splatting works today: the
serializer field sets already match the DTOs exactly (`TaskCreateSerializer` →
title/description/due_date/assignee; `TaskUpdateSerializer` → plus status;
`UserCreateSerializer` → email/password/first_name/last_name/role; `UserUpdateSerializer` →
first_name/last_name/role/is_active/password).

The consequence is recorded honestly in §6.2: because the view splats, adding a field to a
serializer *without* adding it to the DTO produces a `500` for the first request that sends
it, per D30. That is the intended loud failure, and it surfaces in the same test run that
exercises the new field — not a silent no-op.

### 3.2 New module per app

`apps/<app>/dto.py` — "the typed input and output contracts for this app's service layer".
This satisfies `backend §49` (every module has one named responsibility); it is not a
`utils.py`-style dumping ground.

```python
# apps/tasks/dto.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict

from apps.users.models import User


class TaskCreateInput(BaseModel):
    # arbitrary_types_allowed: `assignee` is a Django model instance the serializer
    # already resolved and proved live (D31). extra="forbid": an unexpected key is a
    # view/service contract mismatch and must fail loudly, not vanish into a default.
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    title: str
    description: str = ""
    due_date: datetime | None = None
    assignee: User | None = None


class TaskUpdateInput(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    assignee: User | None = None
    status: str | None = None
```

### 3.3 Partial updates: the `model_fields_set` requirement (D32)

`TaskUpdateInput` cannot express "field absent" through its value alone, because `None` is a
meaningful value for `due_date` and `assignee`. The services currently branch on `in data`:

```python
for field in _MUTABLE_FIELDS:
    if field in data:            # dict today
        setattr(task, field, data[field])
```

This becomes:

```python
for field in _MUTABLE_FIELDS:
    if field in data.model_fields_set:      # only what the caller actually sent
        setattr(task, field, getattr(data, field))
```

Getting this wrong is the single highest-risk part of the refactor: branching on truthiness or
on `is not None` would make `assignee: null` (unassign) and an omitted `assignee` (leave alone)
behave identically, and would silently stop an Operator from clearing a due date. §6.1 pins
both cases with tests.

**The same line change is required in the audit log, for a security reason.**
`apps/tasks/services.py:82` currently reads:

```python
logger.info("task.updated id=%s fields=%s by=%s", task.pk, sorted(data), actor.pk)
```

On a `dict`, `sorted(data)` yields the sorted **keys** — field names only, which is what
`backend §28` requires. A pydantic v2 model, however, iterates as `(name, value)` pairs, so
the identical expression would start writing **task titles and descriptions into the logs**.
It must become:

```python
logger.info("task.updated id=%s fields=%s by=%s", task.pk, sorted(data.model_fields_set), actor.pk)
```

`apps/users/services.py` is unaffected — it logs `sorted(changed)`, a locally-built list of
names, which is why that service already documents the "field NAMES only" rule. A test
asserting the task log line contains no submitted value is added in §6.1.

### 3.4 Output DTO

`task_stats()` returns `TaskStatsOutput` instead of `dict[str, Any]`:

```python
class TaskStatsOutput(BaseModel):
    total: int
    by_status: dict[str, int]
    overdue: int
    due_next_7_days: int
```

The view returns `stats.model_dump()`, so the JSON on the wire is unchanged and the
drf-spectacular `inline_serializer` annotation for `/tasks/stats/` still describes it
correctly. The dashboard contract does not move.

### 3.5 Files touched

| File | Change |
|---|---|
| `backend/pyproject.toml` | add `pydantic>=2` to `[project] dependencies` |
| `apps/tasks/dto.py` | **new** — `TaskCreateInput`, `TaskUpdateInput`, `TaskStatsOutput` |
| `apps/users/dto.py` | **new** — `UserCreateInput`, `UserUpdateInput` |
| `apps/tasks/services.py` | `create`/`update` accept DTOs; `model_fields_set` branching |
| `apps/users/services.py` | `create`/`update` accept DTOs; `model_fields_set` branching |
| `apps/tasks/selectors.py` | `task_stats` returns `TaskStatsOutput` |
| `apps/tasks/views.py` | build DTOs from `validated_data`; `.model_dump()` for stats |
| `apps/users/views.py` | build DTOs from `validated_data` |
| `apps/notifications/tasks.py` | `sweep_overdue_tasks` is unaffected — it passes ids, not dicts |

`apps/core/tests/test_layering.py` gains an assertion that no `services.py` declares a
`data: dict` parameter, so the old shape cannot come back unnoticed.

**Existing tests that call the services must migrate too**, and the plan should budget for it —
roughly 15 call sites pass dicts today:

| Test module | Note |
|---|---|
| `apps/tasks/tests/test_services.py` | the bulk of the call sites |
| `apps/users/tests/test_services.py` | including the password-rehash cases |
| `apps/core/tests/test_error_paths.py` | **contains a direct conflict** — see below |
| `apps/notifications/tests/test_on_commit.py` | constructs service calls for the dispatcher tests |

`test_an_update_with_no_recognised_fields_writes_nothing` currently passes
`data={"unknown_field": "ignored"}` and asserts the field **is** ignored. That is the exact
behaviour `extra="forbid"` removes, so the test is not merely updated but **replaced** by
§6.1's "DTO no-op" case (a DTO with no fields set writes nothing) plus the new
`extra="forbid"` rejection test. The old assertion is not a regression being broken; it
encoded the dict-era contract this iteration is deliberately replacing.

---

## 4. Concern 3 — the anonymous login page

### 4.1 What the three requests are

An anonymous first load currently produces:

| Request | Why | Avoidable? |
|---|---|---|
| `GET /users/me/` → 401 | `AuthContext` probes for a session with no access token in memory | Yes — see below |
| `GET /users/me/` → 401 | React StrictMode double-invokes effects in development | Collapses for free |
| `POST /auth/refresh/` → 401 | The client's refresh-and-retry, triggered by the first 401 | Yes |

### 4.2 Why the refresh cannot simply be removed

The access token is held in memory only (root `AGENTS.md` § Authentication). After a page
reload there is therefore **no** token, and the refresh cookie is the only thing that can
restore the session. Removing the bootstrap refresh would log out every returning user on
every reload — a functional regression, not a cleanup.

### 4.3 Refresh-first bootstrap (D35)

Invert the order instead of removing a step:

```
restoreSession():
    POST /auth/refresh/          # the only call that can establish a session
        401 → no session; user = null        (anonymous: one expected failure)
        200 → setAccessToken(access)
              GET /users/me/ → user          (returning: zero failures)
```

| Path | Today | After |
|---|---|---|
| Anonymous visitor | 3 failed requests | **1** failed request |
| Returning user, post-reload | 1 failed, 2 ok | **0** failed, 2 ok |

### 4.3.1 The bootstrap refresh must be deduplicated explicitly

An earlier draft of this spec claimed the StrictMode duplicate "disappears without extra work,
because `api-client` already single-flights refresh". **That is false, and the consequence is
severe enough to state plainly.**

`refreshAccessToken()` and its `refreshInFlight` promise are module-private in
`api-client.ts`, and are reached *only* from the 401-retry inside `request()`. Worse,
`/auth/refresh/` is itself in `NO_REFRESH_PATHS`. So a `restoreSession()` implemented as an
ordinary `apiClient.post("/auth/refresh/", {})` is **not** deduplicated, and StrictMode's
double-invoked effect fires **two** refreshes.

Because `base.py` sets `ROTATE_REFRESH_TOKENS: True` and `BLACKLIST_AFTER_ROTATION: True`, the
second call presents a cookie the first has just blacklisted, receives a `401`, and the
bootstrap's error path sets `user = null`. That logs out a returning user on reload — exactly
the regression §4.2 exists to prevent, reintroduced by the fix for it.

**Therefore:** `api-client.ts` exports a single-flighted session-restore that reuses the
existing `refreshInFlight` promise, rather than `auth-service.ts` posting to the endpoint
directly. Deduplication is a required part of this change, not a side benefit.

```ts
// api-client.ts — shares refreshInFlight, so concurrent callers make one request
export async function restoreSession(): Promise<boolean> {
    try {
        await refreshAccessToken();   // existing single-flighted promise
        return true;
    } catch {
        clearAccessToken();
        return false;
    }
}
```

The remaining `401` on `/auth/refresh/` for an anonymous visitor is correct HTTP and is left
in place. Suppressing it would mean returning `200` for "no session", which contradicts the
status the permission matrix suite asserts.

### 4.4 Files touched

| File | Change |
|---|---|
| `lib/api-client.ts` | **export** a single-flighted `restoreSession()` reusing `refreshInFlight` (§4.3.1) |
| `features/auth/services/auth-service.ts` | add `restoreSession()` wrapper: on success, fetch the user |
| `features/auth/AuthContext.tsx` | bootstrap calls `restoreSession()` instead of `fetchCurrentUser()` |
| `README.md` | new short section: which console output is expected, which is a browser extension, and that a `500` on login means `migrate` has not run |

`fetchCurrentUser()` is retained — the success path calls it.

---

## 5. Concerns 2, 4 and 5

### 5.1 Seeding (`seed_demo_data`)

```bash
python manage.py seed_demo_data --users 25 --tasks 300
```

- **`--users N`** (default `0`) adds N randomly-named users on top of the five fixed accounts,
  which stay exactly as documented. Roughly one in four is a Supervisor, the rest Operators,
  so the assignee picker has variety and D27 has subjects.
- **`--tasks M`** (default `45`) ensures at least M tasks exist.
- **Both are top-up** (D33): re-running with the same numbers changes nothing; raising one adds
  the difference. Neither deletes anything.
- **`admin@demo.local` stays fixed** so you can always sign in and discover the generated
  accounts through the user list — which is the point of randomising them.
- **Assignment is random** across all assignable users (Supervisors and Operators, never an
  Admin per D17), and `created_by` is randomised too rather than pinned to one Supervisor, so
  some tasks end up Operator-created and the D27 delete rule becomes visible in the UI. This
  is the one respect in which the default output differs from today's — see D33.
- The existing fixed `random.seed` is kept, so a given `--users N` always produces the same N
  accounts. That is what lets the top-up logic recognise them.

**Generated identity format**, which the top-up logic depends on:

```
email:       user{index}@demo.local        # index is 1-based and contiguous
first/last:  drawn from the embedded name lists
```

The **index, not the name, carries uniqueness.** Drawing from a finite name list can repeat a
pair, so an email built from the name alone would collide and silently create fewer than N
users — breaking the §6.1 "exactly N" test. Keying on the index also makes top-up trivial:
the command counts existing `user{n}@demo.local` accounts and creates only the missing
indices. Task titles continue the existing `Demo task {n:02d}` numbering the same way, so
topping up from 45 to 60 adds `Demo task 46`–`Demo task 60`.
- Rows are created one at a time. `bulk_create` would skip `django-simple-history` records, and
  the audit trail is a project requirement — so large values are deliberately slow, which the
  README states.
- Negative or non-integer values are rejected by `argparse` with `type=int` plus an explicit
  non-negative check.

**README** gains the flags, a worked example, the fixed-admin discovery flow, and the note
about large values.

### 5.2 Users table responsiveness

Mirror the tasks pattern exactly, including its reasons:

| Breakpoint | Tasks (existing) | Users (new) |
|---|---|---|
| ≥ `md` | `<table>` in `hidden md:block` | same |
| < `md` | stacked `TaskCard`s in `md:hidden` | stacked `UserCard`s |

A separate `UserCard` component rather than a CSS-reflowed table: a table that reflows into
blocks loses its header association and reads poorly to a screen reader. `UserCard` surfaces
name, email, role and active state, with the same Edit and Deactivate actions.

**"Mirror the pattern" includes extracting the table.** `TaskListPage` delegates to a
`TaskTable` component, while `UserListPage` holds its `<table>` inline. Both are extracted:

| New component | Mirrors |
|---|---|
| `features/users/components/UserTable.tsx` | `features/tasks/components/TaskTable.tsx` |
| `features/users/components/UserCard.tsx` | `features/tasks/components/TaskCard.tsx` |

That keeps `UserListPage` about filters, paging and the delete dialog, and leaves the page
file comparable in size to its tasks counterpart.

Because jsdom applies no CSS, **both** presentations are in the DOM during tests. This is not
hypothetical here: three existing assertions in `UserListPage.test.tsx` query
`findByRole("button", { name: /deactivate operator@demo.local/i })` unscoped, and each will
match twice once a card exists. They are scoped with `within(table)`, and a card test is
added — the same correction the task list already carries.

### 5.3 Pre-push hook

`scripts/run-backend-tests.sh`, invoked by the `pytest` hook as `bash scripts/run-backend-tests.sh`:

```
1. Is the Compose `backend` service running and exec-able?
   yes → docker compose exec -T backend pytest -x -q
         pass → report "passed in: docker compose" → exit 0
2. uv run --directory backend pytest -x -q
   pass → report "passed in: local uv" → exit 0
3. exit 1, printing the outcome of each environment that was attempted
```

Per D36 and the project owner's explicit instruction, **either environment passing is
sufficient**, including when Compose ran the suite and failed. The script therefore always
prints which environment produced the pass, so a divergence between the two is visible in the
push output rather than silent. §6.2 records the risk this accepts.

The hook stays on `pre-push` rather than `pre-commit`, so committing remains fast. The `mypy`
hook deliberately stays on local `uv` and is not routed through this script: it needs no
database, so the Compose round-trip would buy nothing.

Two practical notes, since this is the repository's **first** shell script — there is no
`scripts/` directory today:

- The hook runs as `bash scripts/run-backend-tests.sh` under `language: system`. On the
  Windows host that motivated this change, `bash` resolves to Git Bash, which is already how
  every verification command in this project has been run. The plan's first step is to confirm
  that the hook actually fires there, before relying on it.
- Compose availability is probed, not assumed: `docker compose ps --status running backend`
  returning a container id is the gate. A missing `docker` binary, a stopped stack, or a
  failing `exec` all route to the local attempt rather than aborting.

---

## 6. Testing

### 6.1 New and changed tests

| Area | Test |
|---|---|
| DTO shape | `extra="forbid"` rejects an unexpected key |
| DTO partial update | `assignee: null` unassigns; **omitted** `assignee` leaves it unchanged (D32) |
| DTO partial update | `due_date: null` clears the date; omitted leaves it |
| DTO no-op | a DTO with no fields set writes nothing and returns the instance unchanged |
| Audit log | `task.updated` logs field **names** only — no submitted title or description value appears in the record (§3.3) |
| Layering | no `services.py` declares a `data: dict` parameter |
| Stats | `task_stats` returns `TaskStatsOutput`; the endpoint's JSON is byte-identical to before |
| Seeding | `--users N` creates exactly N beyond the five fixed accounts |
| Seeding | `--tasks M` tops up to M; re-running is a no-op; raising M adds the difference |
| Seeding | the five fixed accounts and `admin@demo.local` still exist and authenticate |
| Seeding | every generated task has an assignable (never Admin) assignee, and `created_by` varies |
| Seeding | rejects a negative `--users` / `--tasks` |
| Bootstrap | anonymous load makes exactly one failed request, and it is the refresh |
| Bootstrap | a valid refresh cookie restores the session with no failed request |
| Bootstrap | a failed refresh leaves `user = null` and routes to `/login` |
| Bootstrap | **two concurrent bootstraps issue one refresh** — the StrictMode case from §4.3.1, which rotation plus blacklisting would otherwise turn into a spurious logout |
| Users table | the table renders at `md`+, and a `UserCard` per user exists for narrow viewports |
| Users table | existing assertions scoped with `within(table)` still pass |

The backend coverage gate stays at 80 with the suite at 100% of `apps/`; the frontend keeps no
numeric gate and its console guard continues to fail a test on unexpected output.

### 6.2 Risks accepted

| Risk | Detail | Mitigation |
|---|---|---|
| **A Compose-only failure can be masked by a local pass** | D36 treats either environment passing as success, so a regression that only manifests in Compose will not block a push. | The script names the environment that passed, so the divergence is visible. CI remains the authority: its `backend` job runs one environment with no fallback. |
| **A serializer widened without updating its DTO returns 500** | Because the view splats `validated_data` (§3.1), a new serializer field with no DTO counterpart makes `extra="forbid"` raise for the first request that actually sends it. An earlier draft of this spec called such a field "inert" — that was wrong, and only true of field-by-field mapping, which this design rejects. | Accepted deliberately as the loud failure D30 describes. It is caught by the same test that exercises the new field, and a rename or removal fails even faster. The alternative — silent divergence between the HTTP contract and the service contract — is the failure mode pydantic is being introduced to remove. |
| **`arbitrary_types_allowed` means pydantic does not validate `assignee`** | D31 accepts a model instance as-is. | The serializer's `PrimaryKeyRelatedField` already proved existence and liveness; re-validating would require a redundant query. |
| **The seed command's randomness is deterministic** | A fixed seed means "random" accounts repeat between runs. | Intentional — it is what makes the top-up logic idempotent. Names remain unknown until inspected, which is all the discovery flow needs. |

---

## 7. Out of scope

- Replacing DRF serializers with pydantic at the HTTP boundary (explicitly deferred under D29).
- The MetaMask console output — not this application's code.
- An env-driven sweep cadence (§1.2).
- Any change to the §8.7 error contract, the permission matrix, or the notification design.
