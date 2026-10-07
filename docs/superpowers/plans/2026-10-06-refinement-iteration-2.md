# Refinement Iteration 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the five refinements in [2026-10-06-refinement-iteration-2-design.md](../specs/2026-10-06-refinement-iteration-2-design.md) — pydantic DTOs at the service boundary, a parameterised seed command, a refresh-first auth bootstrap, a responsive users table, and a pre-push hook that tries Compose before local `uv`.

**Architecture:** Nothing in the first iteration's layering moves. DRF keeps the HTTP boundary and pydantic takes the service boundary (D29), so the `{detail, code, errors}` contract and the drf-spectacular schema are untouched. On the frontend, `api-client.ts` keeps sole ownership of the access token and gains one exported, single-flighted session-restore; `AuthContext` calls it instead of probing `/users/me/`.

**Tech Stack:** Python 3.14 · Django 6.0 · DRF 3.18.1 · pydantic 2 (new) · pytest · uv · React 19 · TypeScript 6 · Vitest · MSW · Tailwind 3

---

## Execution Notes

**Run the backend suite through Compose.** It is the project default (D36):

```bash
docker compose exec -T backend pytest -x -q
```

`uv run --directory backend pytest -x -q` is the supported fallback, but note spec §1.1: a native PostgreSQL on `127.0.0.1:5432` makes the local path fail on the machine this plan was written for. Task 1 makes the choice automatic, so **do Task 1 first** and use `bash scripts/run-backend-tests.sh` thereafter.

**Frontend:** `npm run --prefix frontend test`. (npm 10 has no working `--prefix` for `install`, but `run` is fine.)

**Commit after every task.** Each task leaves both suites green.

**Tasks 5, 6 and 7 are atomic by necessity.** Each converts a service, its callers and its tests in one commit — a half-converted service does not import. Do not split them to get a smaller diff.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `scripts/run-backend-tests.sh` | Choose the environment that runs the backend suite, and report which one passed. The repository's first shell script. |
| `backend/apps/tasks/dto.py` | The typed input and output contracts for the tasks service layer. |
| `backend/apps/users/dto.py` | The same for users. |
| `backend/apps/tasks/tests/test_dto.py` | DTO-shape tests: `extra="forbid"`, `model_fields_set` semantics. |
| `backend/apps/users/tests/test_dto.py` | The same for the users DTOs. |
| `frontend/src/features/users/components/UserTable.tsx` | The ≥`md` presentation of the user list, mirroring `TaskTable`. |
| `frontend/src/features/users/components/UserCard.tsx` | The <`md` presentation, mirroring `TaskCard`. |

### Modified files

| File | Change |
|---|---|
| `.pre-commit-config.yaml` | the `pytest` hook calls the new script |
| `backend/pyproject.toml` | `pydantic>=2`; `plugins = ["pydantic.mypy"]` |
| `backend/uv.lock` | regenerated and committed |
| `backend/apps/tasks/services.py` | DTO parameters; `model_fields_set` branching; the audit-log fix |
| `backend/apps/users/services.py` | DTO parameters; `model_fields_set` branching |
| `backend/apps/tasks/selectors.py` | `task_stats` returns `TaskStatsOutput`; drop the `Any` import |
| `backend/apps/tasks/views.py` | build DTOs; `.model_dump()` for stats |
| `backend/apps/users/views.py` | build DTOs |
| `backend/apps/users/management/commands/seed_demo_data.py` | `--users` / `--tasks`, random names, random assignment |
| `backend/apps/core/tests/test_layering.py` | guard against `data: dict` returning |
| 4 backend test modules | 16 service call sites migrate to DTOs |
| `backend/apps/tasks/tests/test_selectors.py` | 5 stats subscripts become attribute access |
| `frontend/src/lib/api-client.ts` | export a single-flighted `refreshSession()` |
| `frontend/src/features/auth/services/auth-service.ts` | add `restoreSession()` |
| `frontend/src/features/auth/AuthContext.tsx` | bootstrap via `restoreSession()`; rewrite the stale comment |
| `frontend/src/test/msw-handlers.ts` | default `POST /auth/refresh/` |
| `frontend/src/app/layout/AppShell.test.tsx` | session-aware refresh handler |
| `frontend/src/features/users/UserListPage.tsx` | delegate to `UserTable` / `UserCard` |
| `frontend/src/features/users/UserListPage.test.tsx` | scope 3 assertions with `within(table)`; add a card test |
| `README.md` | seeding flags; expected console output |

---

## Task 1: The pre-push script (spec §5.3, D36)

First, because it makes every later task's test run work on a machine where the local `uv` path is broken.

**Files:**
- Create: `scripts/run-backend-tests.sh`
- Modify: `.pre-commit-config.yaml:29-34`

- [ ] **Step 1: Confirm the hook can run a shell script here at all**

The spec flags this as unverified, and the rest of the task depends on it.

```bash
bash --version
docker compose ps --status running backend
```

Expected: a Git Bash version banner, and either a container line for `backend` or empty output. Note which — it decides which branch Step 5 exercises. If `bash` is not found, **stop and report**: the hook cannot be shell-based on this host and the task needs redesign.

- [ ] **Step 2: Write the script**

```bash
#!/usr/bin/env bash
# Run the backend suite in the project's default environment, falling back to a
# local interpreter.
#
# D36: EITHER environment passing is sufficient, including when Compose ran the
# suite and failed. That is a deliberate trade-off by the project owner (the
# local path must stay usable where Docker is not), and the risk it accepts is
# recorded in design spec §6.2. The script therefore always prints WHICH
# environment produced the pass, so a divergence between the two shows up in
# the push output instead of passing silently.
#
# CI remains the authority: its `backend` job runs one environment, no fallback.
set -uo pipefail

compose_outcome="not attempted"
local_outcome="not attempted"

# Probe, never assume. A missing docker binary, a stopped stack and a failing
# exec must all route to the local attempt rather than abort the push.
compose_available() {
    command -v docker >/dev/null 2>&1 || return 1
    [ -n "$(docker compose ps --status running --quiet backend 2>/dev/null)" ]
}

if compose_available; then
    echo "==> pytest via docker compose"
    if docker compose exec -T backend pytest -x -q; then
        echo "backend tests passed in: docker compose"
        exit 0
    fi
    compose_outcome="failed"
else
    compose_outcome="unavailable (no docker, or the backend service is not running)"
fi

echo "==> pytest via local uv"
if uv run --directory backend pytest -x -q; then
    echo "backend tests passed in: local uv"
    # Deliberate per D36, but named loudly: a Compose failure that a local pass
    # overrides is exactly the divergence worth seeing.
    if [ "$compose_outcome" = "failed" ]; then
        echo "NOTE: docker compose FAILED and local uv passed. CI runs Compose only — check this."
    fi
    exit 0
fi
local_outcome="failed"

echo
echo "backend tests failed in every environment attempted:"
echo "  docker compose : $compose_outcome"
echo "  local uv       : $local_outcome"
exit 1
```

Note `set -uo pipefail` **without** `-e`: the script's whole purpose is to continue past a failing command, and `-e` would exit on the first failed `pytest`.

- [ ] **Step 3: Point the hook at it**

Replace `.pre-commit-config.yaml:29-34` with:

```yaml
      - id: pytest
        name: pytest (docker compose, falling back to local uv)
        entry: bash scripts/run-backend-tests.sh
        language: system
        pass_filenames: false
        stages: [pre-push]
```

- [ ] **Step 4: Run the script directly**

```bash
bash scripts/run-backend-tests.sh
```
Expected: exit 0, last line naming an environment — `backend tests passed in: docker compose`.

- [ ] **Step 5: Prove the fallback is real, not decoration**

A fallback never observed falling back is untested. Force the Compose branch to be skipped:

```bash
docker compose stop backend
bash scripts/run-backend-tests.sh
docker compose start backend
```
Expected: it prints `==> pytest via local uv`. On the machine in spec §1.1 the local run then **fails** on the Postgres role error, and the final block prints both outcomes — that is the correct, informative result, not a problem to fix. What matters is that the branch was taken.

- [ ] **Step 6: Verify the hook fires**

```bash
uv run pre-commit run pytest --hook-stage pre-push --all-files
```
Expected: `pytest (docker compose, falling back to local uv)....Passed`

- [ ] **Step 7: Commit**

```bash
git add scripts/run-backend-tests.sh .pre-commit-config.yaml
git commit -m "build: run pre-push pytest in Compose with a local fallback"
```

---

## Task 2: Add pydantic (spec §3.5)

**Files:**
- Modify: `backend/pyproject.toml` — `[project] dependencies`, `[tool.mypy]`
- Modify: `backend/uv.lock` — regenerated

- [ ] **Step 1: Add the dependency and the mypy plugin**

In `[project] dependencies`:

```toml
    "pydantic>=2",
```

Under `[tool.mypy]` (line 63) — so the contract hook understands model constructors instead of reporting every DTO call as untyped:

```toml
plugins = ["pydantic.mypy"]
```

- [ ] **Step 2: Sync and confirm the lockfile moved**

```bash
uv sync --directory backend
git status --short backend/uv.lock
```
Expected: `uv.lock` listed as modified. It is a deliverable — the `compat` CI job resolves from it.

- [ ] **Step 3: Confirm the toolchain still starts**

```bash
docker compose build backend
bash scripts/run-backend-tests.sh
uv run --directory backend mypy
```
Expected: all pass, 320 tests. Nothing imports pydantic yet; this only proves the plugin loads and the image builds.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "build: add pydantic and its mypy plugin"
```

---

## Task 3: The tasks DTOs (spec §3.2, §3.4)

Pure addition — no existing code changes, so the suite stays green throughout.

**Files:**
- Create: `backend/apps/tasks/dto.py`
- Create: `backend/apps/tasks/tests/test_dto.py`

- [ ] **Step 1: Write the failing tests**

```python
"""The DTO contract itself, independent of any service.

These exist because `extra="forbid"` and `model_fields_set` are the two
properties the whole refactor rests on, and both can break silently while every
service test still passes.
"""

import pytest
from pydantic import ValidationError

from apps.core.roles import Role
from apps.tasks.dto import TaskCreateInput, TaskStatsOutput, TaskUpdateInput
from apps.users.models import User


class TestExtraForbid:
    def test_an_unexpected_key_is_rejected_not_ignored(self):
        # The loud failure D30 describes: a view and a service that disagree
        # about the contract must raise, not silently drop the field.
        with pytest.raises(ValidationError):
            TaskCreateInput(title="t", unknown_field="ignored")

    def test_a_known_field_set_is_accepted_with_defaults(self):
        data = TaskCreateInput(title="t")
        assert data.title == "t"
        assert data.description == ""
        assert data.due_date is None
        assert data.assignee is None


class TestModelFieldsSet:
    """D32: absent and explicitly-null must stay distinguishable."""

    def test_an_omitted_field_is_not_in_the_set(self):
        assert "assignee" not in TaskUpdateInput(title="t").model_fields_set

    def test_an_explicit_none_assignee_is_in_the_set(self):
        # The whole reason the services cannot branch on `is not None`.
        assert "assignee" in TaskUpdateInput(assignee=None).model_fields_set

    def test_an_explicit_none_due_date_is_in_the_set(self):
        assert "due_date" in TaskUpdateInput(due_date=None).model_fields_set

    def test_an_empty_dto_has_an_empty_set(self):
        assert TaskUpdateInput().model_fields_set == set()


@pytest.mark.django_db
class TestArbitraryTypes:
    def test_it_carries_a_resolved_user_instance(self):
        # D31: the serializer already proved the row exists and is live, so the
        # DTO carries the instance rather than an id the service would re-fetch.
        user = User.objects.create_user(
            email="a@example.com",
            password="DemoPass!2026",
            first_name="A",
            last_name="B",
            role=Role.OPERATOR,
        )
        assert TaskCreateInput(title="t", assignee=user).assignee is user


class TestStatsOutput:
    def test_model_dump_reproduces_the_wire_shape(self):
        stats = TaskStatsOutput(total=1, by_status={"PENDING": 1}, overdue=0, due_next_7_days=1)
        assert stats.model_dump() == {
            "total": 1,
            "by_status": {"PENDING": 1},
            "overdue": 0,
            "due_next_7_days": 1,
        }
```

- [ ] **Step 2: Run them and watch them fail**

```bash
docker compose exec -T backend pytest apps/tasks/tests/test_dto.py -q
```
Expected: collection error — `ModuleNotFoundError: No module named 'apps.tasks.dto'`

- [ ] **Step 3: Write the module**

`backend/apps/tasks/dto.py`:

```python
"""The typed input and output contracts for the tasks service layer.

Pydantic validates at the SERVICE boundary; DRF serializers keep the HTTP
boundary (D29). Nothing here produces a user-facing error message — a
ValidationError at DTO construction means the view and the service disagree
about the contract, which is a programming error surfaced as 500 (D30), never
mapped to a 400.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from apps.users.models import User


class TaskCreateInput(BaseModel):
    # arbitrary_types_allowed: `assignee` is a Django model instance the
    # serializer already resolved and proved live (D31). extra="forbid": an
    # unexpected key is a view/service contract mismatch and must fail loudly
    # rather than vanish into a default — the view splats validated_data, which
    # is what gives this something to catch.
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    title: str
    description: str = ""
    due_date: datetime | None = None
    assignee: User | None = None


class TaskUpdateInput(BaseModel):
    """Every field optional, because PATCH is partial.

    Callers MUST branch on `model_fields_set`, never on truthiness or
    `is not None` (D32): `assignee=None` means "unassign" and an omitted
    `assignee` means "leave alone", and the value alone cannot tell them apart.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    assignee: User | None = None
    status: str | None = None


class TaskStatsOutput(BaseModel):
    """The GET /tasks/stats/ payload.

    Field order matches the dict the selector returns today, so `model_dump()`
    is byte-identical on the wire and the drf-spectacular inline_serializer
    annotation for /tasks/stats/ still describes it correctly.
    """

    total: int
    by_status: dict[str, int]
    overdue: int
    due_next_7_days: int
```

- [ ] **Step 4: Run them and watch them pass**

```bash
docker compose exec -T backend pytest apps/tasks/tests/test_dto.py -q
```
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tasks/dto.py backend/apps/tasks/tests/test_dto.py
git commit -m "feat: add the tasks service-layer DTOs"
```

---

## Task 4: The users DTOs (spec §3.2)

**Files:**
- Create: `backend/apps/users/dto.py`
- Create: `backend/apps/users/tests/test_dto.py`

- [ ] **Step 1: Write the failing tests**

```python
"""The users DTO contract. See apps/tasks/tests/test_dto.py for why these two
properties get tests of their own."""

import pytest
from pydantic import ValidationError

from apps.core.roles import Role
from apps.users.dto import UserCreateInput, UserUpdateInput


class TestCreateInput:
    def test_every_field_is_required(self):
        with pytest.raises(ValidationError):
            UserCreateInput(email="a@example.com")

    def test_a_complete_payload_is_accepted(self):
        data = UserCreateInput(
            email="a@example.com",
            password="DemoPass!2026",
            first_name="A",
            last_name="B",
            role=str(Role.OPERATOR),
        )
        assert data.email == "a@example.com"
        assert data.role == str(Role.OPERATOR)

    def test_an_unexpected_key_is_rejected(self):
        with pytest.raises(ValidationError):
            UserCreateInput(
                email="a@example.com",
                password="DemoPass!2026",
                first_name="A",
                last_name="B",
                role=str(Role.OPERATOR),
                unknown_field="ignored",
            )


class TestUpdateInput:
    def test_an_omitted_field_is_not_in_the_set(self):
        assert "role" not in UserUpdateInput(first_name="A").model_fields_set

    def test_an_explicit_false_is_in_the_set(self):
        # is_active=False is the users-side equivalent of assignee=None: a falsy
        # value that must not be mistaken for "absent".
        data = UserUpdateInput(is_active=False)
        assert "is_active" in data.model_fields_set
        assert data.is_active is False

    def test_an_empty_dto_has_an_empty_set(self):
        assert UserUpdateInput().model_fields_set == set()

    def test_an_unexpected_key_is_rejected(self):
        with pytest.raises(ValidationError):
            UserUpdateInput(unknown_field="ignored")
```

- [ ] **Step 2: Run them and watch them fail**

```bash
docker compose exec -T backend pytest apps/users/tests/test_dto.py -q
```
Expected: `ModuleNotFoundError: No module named 'apps.users.dto'`

- [ ] **Step 3: Write the module**

`backend/apps/users/dto.py`:

```python
"""The typed input contracts for the users service layer.

See apps/tasks/dto.py for the division of responsibility (D29, D30). No
`arbitrary_types_allowed` here: unlike TaskCreateInput, neither users DTO
carries a model instance.
"""

from pydantic import BaseModel, ConfigDict


class UserCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str
    first_name: str
    last_name: str
    role: str


class UserUpdateInput(BaseModel):
    """Partial by design. Callers branch on `model_fields_set` (D32) — note that
    `is_active=False` is a legitimate value, so truthiness is not an option."""

    model_config = ConfigDict(extra="forbid")

    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None
```

- [ ] **Step 4: Run them and watch them pass**

```bash
docker compose exec -T backend pytest apps/users/tests/test_dto.py -q
```
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add backend/apps/users/dto.py backend/apps/users/tests/test_dto.py
git commit -m "feat: add the users service-layer DTOs"
```

---

## Task 5: Convert `TaskService` (spec §3.3) — the highest-risk task

**Atomic.** The service, its two view call sites and its tests change in one commit.

Spec §3.3 is explicit that `TaskService.update` has **three** `in data` branches, and that converting two while missing one "leaves a latent bug in the riskiest part of the refactor". Convert all three, and do the audit-log line in the same pass — on a dict `sorted(data)` yields field names, but a pydantic model iterates as `(name, value)` pairs, so the unchanged expression would start writing task titles into the logs.

**Files:**
- Modify: `backend/apps/tasks/services.py:39-83`
- Modify: `backend/apps/tasks/views.py:90`, `:114`
- Modify: `backend/apps/tasks/tests/test_services.py` (8 call sites)
- Modify: `backend/apps/notifications/tests/test_on_commit.py` (1 call site)
- Modify: `backend/apps/core/tests/test_error_paths.py` (task-service call sites)

- [ ] **Step 1: Write the failing tests first**

Append to `backend/apps/tasks/tests/test_services.py`. These are the D32 cases §6.1 requires, plus the audit-log guard:

```python
class TestPartialUpdateSemantics:
    """D32. Each of these passes under a correct `model_fields_set` branch and
    fails under `if value:` or `if value is not None:` — which is the point."""

    def test_an_explicit_null_assignee_unassigns(self):
        operator = make_user(email="op@example.com")
        task = Task(title="t", status=TaskStatus.PENDING, assignee=operator)
        service, repository, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(assignee=None), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.assignee is None
        assert repository.saved == [task]

    def test_an_omitted_assignee_leaves_it_alone(self):
        operator = make_user(email="op@example.com")
        task = Task(title="t", status=TaskStatus.PENDING, assignee=operator)
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(title="new"), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.assignee == operator
        assert updated.title == "new"

    def test_an_explicit_null_due_date_clears_it(self):
        task = Task(title="t", status=TaskStatus.PENDING, due_date=timezone.now())
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(due_date=None), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.due_date is None

    def test_an_omitted_due_date_leaves_it_alone(self):
        due = timezone.now() + timedelta(days=3)
        task = Task(title="t", status=TaskStatus.PENDING, due_date=due)
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(title="new"), actor=make_user(Role.SUPERVISOR)
        )
        assert updated.due_date == due

    def test_a_dto_with_no_fields_set_changes_nothing(self):
        due = timezone.now()
        task = Task(title="t", status=TaskStatus.PENDING, due_date=due)
        service, _, _ = build([task])
        updated = service.update(
            task_id=task.pk, data=TaskUpdateInput(), actor=make_user(Role.SUPERVISOR)
        )
        assert (updated.title, updated.due_date, updated.status) == ("t", due, TaskStatus.PENDING)


def test_the_update_log_records_field_names_never_values(caplog):
    """backend §28: field NAMES only.

    This test exists for one specific hazard: `sorted(data)` on a dict yields
    keys, but a pydantic model iterates as (name, value) PAIRS. Leaving that
    expression unchanged would write task titles and descriptions into the
    audit log, and no other test would notice.
    """
    task = Task(title="old", status=TaskStatus.PENDING)
    service, _, _ = build([task])
    with caplog.at_level(logging.INFO, logger="apps.tasks.services"):
        service.update(
            task_id=task.pk,
            data=TaskUpdateInput(title="Acquisition of Northwind", description="confidential"),
            actor=make_user(Role.SUPERVISOR),
        )
    logged = next(
        r.getMessage() for r in caplog.records if r.getMessage().startswith("task.updated")
    )
    assert "'description'" in logged and "'title'" in logged
    assert "Acquisition of Northwind" not in logged
    assert "confidential" not in logged
```

Add the imports this needs at the top of the module:

```python
import logging

from apps.tasks.dto import TaskCreateInput, TaskUpdateInput
```

- [ ] **Step 2: Run them and watch them fail**

```bash
docker compose exec -T backend pytest apps/tasks/tests/test_services.py -q
```
Expected: the six new tests fail. `TaskUpdateInput` constructs fine, but `update()` still does `"status" in data` — a model has no `__contains__` — so the failure is `TypeError: argument of type 'TaskUpdateInput' is not iterable`. That error is the proof the conversion is needed.

- [ ] **Step 3: Convert the service**

`backend/apps/tasks/services.py` — replace `create` (lines 39-55):

```python
    def create(self, *, data: TaskCreateInput, actor: User) -> Task:
        self._reject_admin_assignee(data.assignee)
        task = Task(
            title=data.title,
            description=data.description,
            due_date=data.due_date,
            assignee=data.assignee,
            created_by=actor,
            status=TaskStatus.PENDING,
        )
        with transaction.atomic():
            self._tasks.add(task)
            if data.assignee is not None:
                self._enqueue("task_assigned", task, actor)
        logger.info("task.created id=%s by=%s assignee=%s", task.pk, actor.pk, task.assignee_id)
        return task
```

Replace `update` (lines 57-83). `fields` is bound **once** so the three branches read the same way — spec §3.3 warns that converting two and missing one is the likely mistake:

```python
    def update(self, *, task_id: UUID, data: TaskUpdateInput, actor: User) -> Task:
        # D32: branch on what the caller actually SENT, never on truthiness or
        # `is not None`. `assignee=None` unassigns and an omitted `assignee`
        # leaves it alone; the value alone cannot tell those apart. Bound once
        # here so all three branches below are visibly parallel.
        fields = data.model_fields_set

        with transaction.atomic():
            task = self._tasks.get_for_update(task_id)
            if task is None:
                raise TaskNotFound
            before = (task.assignee_id, task.status, task.due_date)

            # `status` is the one mutable field with no meaningful null — the
            # serializer's ChoiceField cannot produce one — so narrowing it here
            # satisfies mypy without weakening the rule above for the others.
            requested = data.status
            if "status" in fields and requested is not None and requested != task.status:
                self._validate_transition(task.status, requested)
            if "assignee" in fields:
                self._reject_admin_assignee(data.assignee)

            for field in _MUTABLE_FIELDS:
                if field in fields:
                    setattr(task, field, getattr(data, field))
            self._tasks.save(task)

            assignee_changed = task.assignee_id != before[0] and task.assignee_id is not None
            if assignee_changed:
                self._enqueue("task_assigned", task, actor)
            if task.status != before[1]:
                self._enqueue("task_status_changed", task, actor)
            if task.due_date != before[2]:
                self._enqueue("task_due_date_changed", task, actor)

        # sorted(fields), NOT sorted(data): a pydantic model iterates as
        # (name, value) pairs, so the latter would write submitted titles and
        # descriptions into the audit log (backend §28).
        logger.info("task.updated id=%s fields=%s by=%s", task.pk, sorted(fields), actor.pk)
        return task
```

Add the import:

```python
from apps.tasks.dto import TaskCreateInput, TaskUpdateInput
```

- [ ] **Step 4: Convert the two view call sites**

`backend/apps/tasks/views.py:90`:

```python
        task = self.get_service().create(
            data=TaskCreateInput(**serializer.validated_data), actor=request.user
        )
```

`backend/apps/tasks/views.py:114`:

```python
            task_id=task.pk,
            data=TaskUpdateInput(**serializer.validated_data),
            actor=request.user,
```

Splatting is deliberate (spec §3.1): mapping field by field would make `extra="forbid"` unreachable. Add the import:

```python
from apps.tasks.dto import TaskCreateInput, TaskUpdateInput
```

- [ ] **Step 5: Migrate the existing call sites**

Enumerate them, so none is missed:

```bash
grep -rn "data={" backend/apps/tasks/tests/test_services.py backend/apps/notifications/tests/test_on_commit.py backend/apps/core/tests/test_error_paths.py
```
Expected: 8 + 1 + 3 lines. One of the three in `test_error_paths.py` is a *users* call site — leave that for Task 6.

The conversion is mechanical: a dict literal becomes a constructor call with the same keys as keyword arguments.

```python
# before
data={"title": "Do it", "description": "", "due_date": None, "assignee": operator},
# after
data=TaskCreateInput(title="Do it", description="", due_date=None, assignee=operator),
```

```python
# before
data={"status": TaskStatus.IN_PROGRESS},
# after
data=TaskUpdateInput(status=str(TaskStatus.IN_PROGRESS)),
```

Two things to watch:

- **`str(TaskStatus.X)` for status values.** The DTO types `status` as `str`. Passing the enum member works at runtime, but mypy reads a `TextChoices` member in a class body as `tuple[str, str]` without django-stubs — the trap already recorded in the iteration-1 insights. `str(...)` typechecks and is runtime-correct.
- **Any test passing a key the DTO does not declare now raises.** That is `extra="forbid"` working as designed (D30). The fix is to drop the key, not to widen the DTO — unless the serializer really does produce it, which would be a genuine finding worth reporting.

- [ ] **Step 6: Run the whole backend suite**

```bash
bash scripts/run-backend-tests.sh
docker compose exec -T backend mypy .
```
Expected: all pass, including the six new tests. If `test_the_update_log_records_field_names_never_values` fails with the title present, Step 3's log line was left as `sorted(data)`.

- [ ] **Step 7: Prove the log guard can fail**

Temporarily change the log line back to `sorted(data)` and run that one test:

```bash
docker compose exec -T backend pytest apps/tasks/tests/test_services.py::test_the_update_log_records_field_names_never_values -q
```
Expected: **FAIL**, with the submitted title visible in the assertion diff. Restore `sorted(fields)`. A guard that cannot fail is decoration.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/tasks/services.py backend/apps/tasks/views.py backend/apps/tasks/tests/test_services.py backend/apps/notifications/tests/test_on_commit.py backend/apps/core/tests/test_error_paths.py
git commit -m "refactor: take typed DTOs at the TaskService boundary"
```

---

## Task 6: Convert `UserService` (spec §3.3, §3.5)

**Atomic**, same reason. Two `in data` branches here: the `for name in (...)` loop and `if "password" in data`.

This task also **replaces** `test_an_update_with_no_recognised_fields_writes_nothing`, which passes `data={"unknown_field": "ignored"}` and asserts the field is ignored. That is exactly the behaviour `extra="forbid"` removes. Per spec §3.5 it is replaced, not repaired: it encoded the dict-era contract this iteration deliberately changes, so breaking it is not a regression.

**Files:**
- Modify: `backend/apps/users/services.py:24-54`
- Modify: `backend/apps/users/views.py:73`, `:82`
- Modify: `backend/apps/users/tests/test_services.py` (4 call sites)
- Modify: `backend/apps/core/tests/test_error_paths.py:98-110` (the replaced test)

- [ ] **Step 1: Write the replacement tests**

In `backend/apps/core/tests/test_error_paths.py`, replace `TestUserServiceNoOp` entirely:

```python
@pytest.mark.django_db
class TestUserServiceNoOp:
    def test_a_dto_with_no_fields_set_writes_nothing(self):
        """The early return is the point: no write reaches the repository.

        Replaces an older test that passed {"unknown_field": "ignored"} and
        asserted the key WAS ignored. extra="forbid" makes that payload raise
        instead, so the no-op case is now expressed with an empty DTO, and the
        other half of the old assertion becomes the rejection test below.
        """
        repository = FakeUserRepository()
        target = User(email="target@example.com", role=Role.OPERATOR, first_name="A", last_name="B")
        service = UserService(users=repository)
        returned = service.update(
            user=target,
            data=UserUpdateInput(),
            actor=User(email="admin@example.com", role=Role.ADMIN),
        )
        assert returned is target
        assert repository.saved == []

    def test_an_unrecognised_field_is_rejected_rather_than_ignored(self):
        # D30: a view and a service disagreeing about the contract is a
        # programming error, surfaced loudly — not silently dropped.
        with pytest.raises(ValidationError):
            UserUpdateInput(unknown_field="ignored")
```

Imports to add in that module:

```python
from pydantic import ValidationError

from apps.users.dto import UserUpdateInput
```

- [ ] **Step 2: Run and watch them fail**

```bash
docker compose exec -T backend pytest apps/core/tests/test_error_paths.py -q
```
Expected: `test_a_dto_with_no_fields_set_writes_nothing` fails with `TypeError: argument of type 'UserUpdateInput' is not iterable`. The rejection test already passes — the DTO landed in Task 4.

- [ ] **Step 3: Convert the service**

`backend/apps/users/services.py` — replace `create` (lines 24-37):

```python
    def create(self, *, data: UserCreateInput, actor: User) -> User:
        email = data.email.strip().lower()
        if self._users.get_by_email(email) is not None:
            raise EmailAlreadyInUse
        with transaction.atomic():
            user = self._users.add(
                email=email,
                password=data.password,
                first_name=data.first_name,
                last_name=data.last_name,
                role=data.role,
            )
        logger.info("user.created id=%s role=%s by=%s", user.pk, user.role, actor.pk)
        return user
```

Replace `update` (lines 39-54):

```python
    def update(self, *, user: User, data: UserUpdateInput, actor: User) -> User:
        # D32: `is_active=False` is a legitimate value, so this must branch on
        # what was sent rather than on truthiness.
        fields = data.model_fields_set
        changed: list[str] = []
        for name in ("first_name", "last_name", "role", "is_active"):
            if name in fields:
                setattr(user, name, getattr(data, name))
                changed.append(name)
        if "password" in fields and data.password is not None:
            user.set_password(data.password)
            changed.append("password")
        if not changed:
            return user
        with transaction.atomic():
            self._users.save(user)
        # Field NAMES only — never a password, and never the new value.
        # `changed` is a locally-built list of names, so this line needs none of
        # the DTO-specific care tasks/services.py does; see its comment.
        logger.info("user.updated id=%s fields=%s by=%s", user.pk, sorted(changed), actor.pk)
        return user
```

The `data.password is not None` narrowing is for mypy (`set_password` takes `str`); `password=None` is not a value the serializer can produce.

Add the import:

```python
from apps.users.dto import UserCreateInput, UserUpdateInput
```

- [ ] **Step 4: Convert the two view call sites**

`backend/apps/users/views.py:73`:

```python
        user = self.get_service().create(
            data=UserCreateInput(**serializer.validated_data), actor=request.user
        )
```

`backend/apps/users/views.py:82`:

```python
            user=user,
            data=UserUpdateInput(**serializer.validated_data),
            actor=request.user,
```

Add the import:

```python
from apps.users.dto import UserCreateInput, UserUpdateInput
```

- [ ] **Step 5: Migrate the remaining call sites**

```bash
grep -rn "data={" backend/apps/users/tests/test_services.py backend/apps/core/tests/test_error_paths.py
```
Expected: 4 lines in `test_services.py`; anything left in `test_error_paths.py` is already handled. Convert each as in Task 5, including the password-rehash cases.

- [ ] **Step 6: Run the whole suite**

```bash
bash scripts/run-backend-tests.sh
docker compose exec -T backend mypy .
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/users/services.py backend/apps/users/views.py backend/apps/users/tests/test_services.py backend/apps/core/tests/test_error_paths.py
git commit -m "refactor: take typed DTOs at the UserService boundary"
```

---

## Task 7: `task_stats` returns a model (spec §3.4)

**Atomic**: the selector, the view and the 5 subscript sites move together.

**Files:**
- Modify: `backend/apps/tasks/selectors.py:10`, `:65`, and its return statement
- Modify: `backend/apps/tasks/views.py:152`
- Modify: `backend/apps/tasks/tests/test_selectors.py` (5 subscript sites)

- [ ] **Step 1: Write the failing test**

Add to `backend/apps/tasks/tests/test_selectors.py`:

```python
def test_task_stats_returns_a_typed_model(supervisor):
    stats = task_stats(supervisor)
    assert isinstance(stats, TaskStatsOutput)
    # The dashboard contract does not move: the dict the view puts on the wire
    # is unchanged, which is what keeps the drf-spectacular annotation honest.
    assert set(stats.model_dump()) == {"total", "by_status", "overdue", "due_next_7_days"}
```

Import `TaskStatsOutput` from `apps.tasks.dto`, and use whichever user fixture the module already provides rather than inventing one.

- [ ] **Step 2: Run and watch it fail**

```bash
docker compose exec -T backend pytest apps/tasks/tests/test_selectors.py -q
```
Expected: `AssertionError` on the `isinstance` — `task_stats` still returns a dict.

- [ ] **Step 3: Convert the selector**

Change the signature at `selectors.py:65`:

```python
def task_stats(user: User) -> TaskStatsOutput:
```

Wrap the existing return value. The key order already matches the model's declaration order, so `model_dump()` is byte-identical:

```python
    return TaskStatsOutput(
        total=aggregated["total"],
        by_status={ ... },          # unchanged
        overdue=aggregated["overdue"],
        due_next_7_days=aggregated["due_next_7_days"],
    )
```

Add `from apps.tasks.dto import TaskStatsOutput`, and **remove `from typing import Any` (line 10)** — it existed only for the old return annotation, and ruff's `F401` will fail the commit otherwise.

- [ ] **Step 4: Convert the view**

`backend/apps/tasks/views.py:152`:

```python
        return Response(task_stats(request.user).model_dump())
```

- [ ] **Step 5: Convert the 5 subscript sites**

```bash
grep -n 'stats\[\|task_stats(.*)\[' backend/apps/tasks/tests/test_selectors.py
```
Expected: 5 lines. `stats["total"]` becomes `stats.total`; `task_stats(user)["due_next_7_days"]` becomes `task_stats(user).due_next_7_days`. `stats["by_status"]` becomes `stats.by_status`, which is still a dict — any nested subscript on it stays as it is.

- [ ] **Step 6: Confirm the wire format did not move**

This is the assertion that matters most — the dashboard reads this endpoint.

```bash
docker compose exec -T backend pytest apps/tasks -q -k "stats"
bash scripts/run-backend-tests.sh
docker compose exec -T backend mypy .
docker compose exec -T backend python manage.py spectacular --fail-on-warn
```
Expected: all pass. The schema command matters because drf-spectacular drops a whole viewset with only a warning when generation throws (iteration-1 insight).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/tasks/selectors.py backend/apps/tasks/views.py backend/apps/tasks/tests/test_selectors.py
git commit -m "refactor: return a typed model from task_stats"
```

---

## Task 8: Lock the old shape out (spec §3.5, §6.1)

A guard, so `data: dict` cannot return unnoticed. `test_layering.py` already scans service module source for forbidden patterns, so this follows an established idiom rather than inventing one.

**Files:**
- Modify: `backend/apps/core/tests/test_layering.py`

- [ ] **Step 1: Write the test**

```python
@pytest.mark.parametrize("module", [task_services, user_services], ids=["tasks", "users"])
def test_no_service_declares_an_untyped_data_parameter(module):
    """Services take DTOs, not dicts (D29).

    Coarse on purpose, in the same spirit as the Django*Repository scan above:
    a source-text check has no false negatives for the pattern that matters,
    and the alternative is an import-graph dependency for one rule.
    """
    source = inspect.getsource(module)
    assert "data: dict" not in source
```

Confirm how the existing scans read the module source and match it — if they use `inspect.getsource`, reuse it; if they read `module.__file__`, do that instead.

- [ ] **Step 2: Run it — it should pass immediately**

```bash
docker compose exec -T backend pytest apps/core/tests/test_layering.py -q
```
Expected: pass, because Tasks 5 and 6 already converted both services.

- [ ] **Step 3: Prove it can fail**

Temporarily change one service signature back to `data: dict` and re-run. Expected: **FAIL** for that module. Revert.

- [ ] **Step 4: Commit**

```bash
git add backend/apps/core/tests/test_layering.py
git commit -m "test: guard against dict parameters returning to the service layer"
```

---

## Task 9: Parameterise the seed command (spec §5.1, D33, D34)

Three things change together: the flags, the random user generation, and the randomised assignment. The `--tasks` flag **replaces** the existing `if Task.objects.exists(): return` early return, so a default run against a partly-emptied database now refills to 45 where today it does nothing. That is the intended top-up behaviour, but it is a change the default run inherits — worth knowing when the test for it is written.

**Files:**
- Modify: `backend/apps/users/management/commands/seed_demo_data.py`
- Create or modify: `backend/apps/users/tests/test_seed_demo_data.py` (check whether one exists)

- [ ] **Step 1: Find the existing seed tests**

```bash
grep -rln "seed_demo_data" backend/apps
```
Expected: the command plus any existing test module. Extend what is there rather than starting a parallel file.

- [ ] **Step 2: Write the failing tests**

```python
"""The seed command's flags. Each case maps to a row in design spec §6.1."""

import pytest
from django.core.management import CommandError, call_command

from apps.core.roles import Role
from apps.tasks.models import Task
from apps.users.models import User

pytestmark = pytest.mark.django_db

FIXED_ACCOUNTS = 5


class TestUserFlag:
    def test_it_creates_exactly_n_users_beyond_the_fixed_accounts(self):
        call_command("seed_demo_data", "--users", "7", "--tasks", "0")
        assert User.objects.count() == FIXED_ACCOUNTS + 7
        # The index, not the name, carries uniqueness: a finite name list can
        # repeat a pair, and an email built from the name would collide and
        # silently create fewer than N.
        assert User.objects.filter(email__startswith="user").count() == 7

    def test_the_fixed_accounts_survive_and_still_authenticate(self):
        call_command("seed_demo_data", "--users", "3", "--tasks", "0")
        for email in (
            "admin@demo.local",
            "supervisor@demo.local",
            "operator@demo.local",
            "operator2@demo.local",
            "operator3@demo.local",
        ):
            assert User.objects.filter(email=email).exists()
        # admin@demo.local is fixed precisely so you can always sign in and
        # discover the generated accounts through the user list.
        admin = User.objects.get(email="admin@demo.local")
        assert admin.check_password("DemoPass!2026")

    def test_rerunning_with_the_same_count_is_a_no_op(self):
        call_command("seed_demo_data", "--users", "4", "--tasks", "0")
        call_command("seed_demo_data", "--users", "4", "--tasks", "0")
        assert User.objects.count() == FIXED_ACCOUNTS + 4

    def test_raising_the_count_adds_only_the_difference(self):
        call_command("seed_demo_data", "--users", "4", "--tasks", "0")
        call_command("seed_demo_data", "--users", "6", "--tasks", "0")
        assert User.objects.count() == FIXED_ACCOUNTS + 6

    def test_roughly_a_quarter_are_supervisors(self):
        call_command("seed_demo_data", "--users", "20", "--tasks", "0")
        generated = User.objects.filter(email__startswith="user")
        supervisors = generated.filter(role=Role.SUPERVISOR).count()
        # Loose bounds on purpose: the point is that the assignee picker has
        # variety and D27 has subjects, not an exact ratio.
        assert 1 <= supervisors < 20


class TestTaskFlag:
    def test_it_tops_up_to_m(self):
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        assert Task.objects.count() == 12

    def test_rerunning_is_a_no_op(self):
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        assert Task.objects.count() == 12

    def test_raising_it_adds_only_the_difference_and_continues_the_numbering(self):
        call_command("seed_demo_data", "--users", "2", "--tasks", "12")
        call_command("seed_demo_data", "--users", "2", "--tasks", "15")
        assert Task.objects.count() == 15
        assert Task.objects.filter(title="Demo task 15").exists()

    def test_the_default_is_45(self):
        call_command("seed_demo_data")
        assert Task.objects.count() == 45

    def test_every_task_has_an_assignable_assignee(self):
        call_command("seed_demo_data", "--users", "10", "--tasks", "30")
        # D17: never an Admin.
        assert not Task.objects.filter(assignee__role=Role.ADMIN).exists()
        assert not Task.objects.filter(assignee__isnull=True).exists()

    def test_created_by_varies_so_the_delete_rule_is_demonstrable(self):
        call_command("seed_demo_data", "--users", "10", "--tasks", "30")
        # D27 is only visible in the UI if some tasks are Operator-created.
        creators = set(Task.objects.values_list("created_by_id", flat=True))
        assert len(creators) > 1


class TestValidation:
    @pytest.mark.parametrize("flag", ["--users", "--tasks"])
    def test_it_rejects_a_negative_count(self, flag):
        with pytest.raises(CommandError):
            call_command("seed_demo_data", flag, "-1")
```

- [ ] **Step 3: Run them and watch them fail**

```bash
docker compose exec -T backend pytest apps/users/tests/test_seed_demo_data.py -q
```
Expected: the flag tests fail with `CommandError: unrecognized arguments: --users`.

- [ ] **Step 4: Add the flags and the name lists**

In `seed_demo_data.py`, after `DEMO_USERS`:

```python
# D34: an embedded list, NOT factory_boy. factory_boy is in the `dev`
# dependency group, and a management command is application code — importing a
# dev-only package here would break a production install.
FIRST_NAMES = [
    "Ana", "Bruno", "Carla", "Diego", "Elena", "Felipe", "Gabriela", "Hugo",
    "Irene", "Javier", "Karla", "Luis", "Marta", "Nestor", "Olivia", "Pablo",
    "Rocio", "Sergio", "Teresa", "Ulises", "Valeria", "Wilson", "Ximena", "Yago",
]
LAST_NAMES = [
    "Alvarez", "Bermudez", "Castillo", "Duarte", "Escobar", "Fuentes",
    "Guzman", "Herrera", "Ibarra", "Jimenez", "Lozano", "Medina", "Navarro",
    "Ortega", "Pardo", "Quintero", "Rios", "Salazar", "Trujillo", "Vargas",
]

# One in four, so the assignee picker has variety and D27 has subjects.
SUPERVISOR_EVERY = 4
```

Add `add_arguments`:

```python
    def add_arguments(self, parser):
        parser.add_argument(
            "--users",
            type=int,
            default=0,
            help="Random users to add ON TOP of the five fixed demo accounts. Top-up: "
            "re-running with the same number changes nothing.",
        )
        parser.add_argument(
            "--tasks",
            type=int,
            default=TASK_COUNT,
            help=f"Ensure at least this many tasks exist (default {TASK_COUNT}). Top-up.",
        )
```

In `handle`, validate before any write — `type=int` catches non-integers, but not negatives:

```python
        for name in ("users", "tasks"):
            if options[name] < 0:
                raise CommandError(f"--{name} must be zero or greater.")
```

and thread the values through:

```python
        with transaction.atomic():
            users = self._seed_users(options["users"])
            self._seed_tasks(users, options["tasks"])
```

- [ ] **Step 5: Generate the random users**

Replace `_seed_users` (lines 49-64):

```python
    def _seed_users(self, extra: int) -> dict[str, User]:
        users: dict[str, User] = {}
        for email, first, last, role in DEMO_USERS:
            existing = User.objects.filter(email=email).first()
            if existing is None:
                existing = User.objects.create_user(
                    email=email,
                    password=DEMO_PASSWORD,
                    first_name=first,
                    last_name=last,
                    role=role,
                    is_staff=(role == Role.ADMIN),
                    is_superuser=(role == Role.ADMIN),
                )
            users[email] = existing

        # The INDEX carries uniqueness, not the name: a finite name list can
        # repeat a pair, and an email built from the name alone would collide
        # and silently create fewer than `extra` users. Keying on the index also
        # makes top-up trivial — count what exists, create the missing indices.
        for index in range(1, extra + 1):
            email = f"user{index}@demo.local"
            existing = User.objects.filter(email=email).first()
            if existing is None:
                role = Role.SUPERVISOR if index % SUPERVISOR_EVERY == 0 else Role.OPERATOR
                existing = User.objects.create_user(
                    email=email,
                    password=DEMO_PASSWORD,
                    first_name=random.choice(FIRST_NAMES),
                    last_name=random.choice(LAST_NAMES),
                    role=role,
                )
            users[email] = existing
        return users
```

Rows are created one at a time deliberately: `bulk_create` skips `django-simple-history` records, and the audit trail is a project requirement. Large values are therefore slow, which the README states.

- [ ] **Step 6: Top up the tasks and randomise assignment**

Replace `_seed_tasks` (lines 66-95). The `if Task.objects.exists(): return` guard goes:

```python
    def _seed_tasks(self, users: dict[str, User], target: int) -> None:
        existing = Task.objects.count()
        if existing >= target:
            return  # already at or above the target; top-up never deletes

        # Every role except Admin may hold a task (D17). Includes the generated
        # users, which is what gives the assignee picker variety.
        assignable = [u for u in users.values() if u.role != Role.ADMIN]
        # created_by is randomised rather than pinned to one Supervisor, so some
        # tasks end up Operator-created and the D27 delete rule becomes visible
        # in the UI. This is the one respect in which the default output differs
        # from the previous version's (D33).
        creators = assignable
        now = timezone.now()

        # Due dates straddle now so the overdue sweep, the overdue filter and
        # due_next_7_days all have subjects on the very first run.
        offsets = (
            [timedelta(days=-d) for d in range(1, 9)]  # past
            + [timedelta(days=d) for d in range(1, 8)]  # within seven days
            + [timedelta(days=d) for d in (20, 45, 90)]  # far future
            + [None] * 4  # no deadline
        )

        # Continue the existing numbering, so topping up from 45 to 60 adds
        # Demo task 46 - Demo task 60 rather than renumbering anything.
        for index in range(existing, target):
            status = TaskStatus.values[index % len(TaskStatus.values)]
            offset = offsets[index % len(offsets)]
            Task.objects.create(
                title=f"Demo task {index + 1:02d}",
                description="Seeded for review. Edit freely.",
                status=status,
                # The check constraint requires these two to agree.
                completed_at=now if status == TaskStatus.COMPLETED else None,
                due_date=None if offset is None else now + offset,
                assignee=random.choice(assignable),
                created_by=random.choice(creators),
            )
```

Keep the existing `random.seed(20261006)` in `handle`. It makes a fresh run reproducible but is **not** what makes top-up work — the index-keyed email is. Generated names may differ between a fresh `--users 20` and a top-up from 10 to 20 because the RNG stream shifts; nothing depends on name stability.

- [ ] **Step 7: Run the tests**

```bash
docker compose exec -T backend pytest apps/users/tests/test_seed_demo_data.py -q
bash scripts/run-backend-tests.sh
```
Expected: all pass.

- [ ] **Step 8: Run it for real and check the discovery flow**

The point of randomising the users is that you find them through the UI, so verify that end to end rather than only in tests:

```bash
docker compose exec backend python manage.py seed_demo_data --users 8 --tasks 60
docker compose exec backend python manage.py shell -c "from apps.users.models import User; print(User.objects.filter(email__startswith='user').values_list('email','first_name','role'))"
```
Expected: 8 rows with varied names and a mix of `OPERATOR` and `SUPERVISOR`. Then sign in as `admin@demo.local` / `DemoPass!2026` and confirm the generated accounts appear in the user list.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/users/management/commands/seed_demo_data.py backend/apps/users/tests/test_seed_demo_data.py
git commit -m "feat: parameterise seed_demo_data with user and task counts"
```

---

## Task 10: The default refresh handler (spec §4.5)

Lands **before** the bootstrap inversion and on its own, because it is a safe no-op today: nothing posts to `/auth/refresh/` during a test whose `/users/me/` returns a user. Separating it means that if the inversion in Task 12 goes wrong, the fixture change is not entangled with it.

**Files:**
- Modify: `frontend/src/test/msw-handlers.ts`

- [ ] **Step 1: Add the default**

After the four existing defaults (lines 29-32):

```ts
  /**
   * The default fixture represents a VALID session (spec §4.5).
   *
   * Once AuthContext bootstraps refresh-first, this is the request that decides
   * whether a rendered test is signed in — `/users/me/` no longer is. Tests
   * that want an anonymous visitor override this with a 401, which
   * LoginPage.test.tsx already does.
   */
  http.post(`${BASE}/auth/refresh/`, () =>
    HttpResponse.json({ access: "default-fixture-access-token" }),
  ),
```

- [ ] **Step 2: Confirm the suite is unchanged**

```bash
npm run --prefix frontend test
```
Expected: all 84 pass. No test posts to `/auth/refresh/` yet unless it registered its own handler, so this adds a default that nothing currently reaches.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/test/msw-handlers.ts
git commit -m "test: add a default refresh handler to the shared fixture"
```

---

## Task 11: Export a single-flighted `refreshSession()` (spec §4.3.1)

The deduplication is a **required** part of the bootstrap change, not a side benefit. Spec §4.3.1 records why at length: an earlier draft assumed the existing single-flight would cover it, which is false — `refreshAccessToken` and `refreshInFlight` are module-private and `/auth/refresh/` is in `NO_REFRESH_PATHS`, so a bootstrap implemented as `apiClient.post("/auth/refresh/", {})` is not deduplicated at all. With `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION` both on, StrictMode's second call presents a just-blacklisted cookie, gets a 401, and logs out a returning user.

**Files:**
- Modify: `frontend/src/lib/api-client.ts`
- Modify or create: `frontend/src/lib/api-client.test.ts` (an existing single-flight test is already there — find it)

- [ ] **Step 1: Find the existing single-flight test**

```bash
grep -rn "refreshInFlight\|single\|expected 5 to be 1" frontend/src/lib/
```
It is the model for the new test: the iteration-1 suite proved the guard by removing it and watching `expected 5 to be 1`.

- [ ] **Step 2: Write the failing test**

```ts
describe("refreshSession", () => {
  it("makes one request when two bootstraps run concurrently", async () => {
    // The StrictMode case from spec §4.3.1. With ROTATE_REFRESH_TOKENS and
    // BLACKLIST_AFTER_ROTATION both on, a second request would present a
    // just-blacklisted cookie, 401, and log out a returning user.
    let calls = 0;
    server.use(
      http.post(`${BASE}/auth/refresh/`, () => {
        calls += 1;
        return HttpResponse.json({ access: "rotated" });
      }),
    );

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(calls).toBe(1);
  });

  it("returns false and clears the token when there is no valid cookie", async () => {
    server.use(
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
      ),
    );
    await expect(refreshSession()).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

```bash
npm run --prefix frontend test -- api-client
```
Expected: `refreshSession is not exported` / `is not a function`.

- [ ] **Step 4: Export it**

In `frontend/src/lib/api-client.ts`, after `refreshAccessToken` (line 76):

```ts
/**
 * Restore a session from the refresh cookie. Returns whether it worked.
 *
 * Exported so AuthContext's bootstrap reuses `refreshInFlight` instead of
 * posting to /auth/refresh/ itself (spec §4.3.1). That matters: the endpoint is
 * in NO_REFRESH_PATHS and the promise is module-private, so a direct post would
 * NOT be deduplicated, and StrictMode's double-invoked effect would fire two
 * refreshes. With rotation plus blacklisting server-side, the second presents a
 * cookie the first just invalidated and the bootstrap signs the user out.
 *
 * Never rejects: "no session" is an ordinary answer here, not an error.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    await refreshAccessToken(); // single-flighted; assigns accessToken on success
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}
```

- [ ] **Step 5: Run and watch it pass**

```bash
npm run --prefix frontend test -- api-client
```
Expected: pass.

- [ ] **Step 6: Prove the dedup guard can fail**

Temporarily change `refreshSession` to bypass the shared promise:

```ts
    await apiClient.post("/auth/refresh/", {});   // the WRONG implementation
```

Re-run. Expected: **FAIL** with `expected 2 to be 1`. This is the single most valuable check in the task — it is the exact regression §4.3.1 was written to prevent. Restore the correct body.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api-client.ts frontend/src/lib/api-client.test.ts
git commit -m "feat: export a single-flighted refreshSession from the api client"
```

---

## Task 12: Invert the bootstrap (spec §4.3, §4.4, D35)

**Atomic**: `AuthContext` and `AppShell.test.tsx` change together. That test's refresh handler returns 401 unconditionally, so after the inversion its own signed-in tests would bootstrap to `user = null` and route to `/login`.

**Files:**
- Modify: `frontend/src/features/auth/services/auth-service.ts`
- Modify: `frontend/src/features/auth/AuthContext.tsx:28-46`
- Modify: `frontend/src/app/layout/AppShell.test.tsx:46-48`

- [ ] **Step 1: Add `restoreSession()`**

Append to `frontend/src/features/auth/services/auth-service.ts`:

```ts
/**
 * Bootstrap a session from the refresh cookie, refresh FIRST (D35).
 *
 * The access token is held in module memory only, so after a page reload the
 * cookie is the only thing that can restore a session — the refresh cannot
 * simply be dropped (spec §4.2). Probing /users/me/ first, as this used to,
 * made a guaranteed 401 for every anonymous visitor AND still needed the
 * refresh afterwards. This way an anonymous visitor makes one expected failed
 * request and a returning user makes none.
 *
 * Named differently from api-client's `refreshSession` on purpose, so this
 * module does not shadow its own import.
 */
export async function restoreSession(): Promise<CurrentUser | null> {
  if (!(await refreshSession())) return null;
  return fetchCurrentUser();
}
```

Import `refreshSession` from `../../../lib/api-client`. The caller never touches the token — `refreshSession` reuses `refreshAccessToken`, which assigns it internally.

- [ ] **Step 2: Rewrite the bootstrap effect**

`frontend/src/features/auth/AuthContext.tsx:28-46`. The existing comment — "A 401 here is not an error… api-client silently refreshes first" — describes the old order and becomes untrue, so it is replaced, not kept:

```tsx
  useEffect(() => {
    let cancelled = false;
    // Refresh FIRST, then fetch the user (D35). The access token is memory-only,
    // so after a reload the cookie is the only way back into a session; probing
    // /users/me/ first was a guaranteed 401 for anonymous visitors and did not
    // avoid the refresh anyway. restoreSession resolves to null rather than
    // rejecting when there is no session, because that is an ordinary answer.
    authService
      .restoreSession()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

The `.catch` stays: `restoreSession` returns `null` for "no session", but `fetchCurrentUser()` can still reject on a 5xx after a successful refresh.

- [ ] **Step 3: Make `AppShell.test.tsx`'s refresh handler session-aware**

It already tracks `signedInAs` for `/users/me/`; the refresh handler just needs to read the same flag (lines 46-48):

```ts
    http.post(`${BASE}/auth/refresh/`, () =>
      signedInAs === null
        ? HttpResponse.json(
            { detail: "no cookie", code: "refresh_cookie_missing" },
            { status: 401 },
          )
        : HttpResponse.json({ access: "rotated-access-token" }),
    ),
```

- [ ] **Step 4: Run the whole frontend suite**

```bash
npm run --prefix frontend test
```
Expected: all pass. Spec §4.5 predicts which modules are affected — work through them in this order if anything fails:

| Module | Expectation |
|---|---|
| `app/layout/AppShell.test.tsx` | fixed by Step 3 |
| `features/auth/LoginPage.test.tsx` | **no change needed** — it already registers a 401 refresh in `beforeEach`. If it passes untouched, that is the useful signal the chosen default is the right way round |
| `features/auth/auth-routing.test.tsx` | should pass on Task 10's default; confirm, do not assume |
| `features/dashboard/StatsPage.test.tsx` | as above |
| `features/tasks/TaskListPage.test.tsx` | as above |
| `features/tasks/TaskForm.test.tsx` | as above |
| `features/users/UserListPage.test.tsx` | as above |
| `features/users/UserForm.test.tsx` | as above |

A failure mentioning `onUnhandledRequest` means a module registers its own `/users/me/` override but reaches a refresh the fixture does not serve — add a handler to that module rather than loosening `setup.ts`.

- [ ] **Step 5: Add the bootstrap assertions (spec §6.1)**

In `frontend/src/features/auth/auth-routing.test.tsx` (or whichever module owns bootstrap behaviour):

```ts
it("makes exactly one failed request for an anonymous visitor, and it is the refresh", async () => {
  const failures: string[] = [];
  server.events.on("response:mocked", ({ response, request }) => {
    if (response.status >= 400) failures.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  server.use(
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
    ),
  );

  renderApp({ initialPath: "/login" });
  await screen.findByRole("heading", { name: /sign in/i });

  expect(failures).toEqual(["POST /api/v1/auth/refresh/"]);
});

it("restores a session from a valid cookie with no failed request", async () => {
  const failures: string[] = [];
  server.events.on("response:mocked", ({ response }) => {
    if (response.status >= 400) failures.push(String(response.status));
  });

  renderApp({ initialPath: "/" });
  await screen.findByRole("navigation", { name: /main/i });

  expect(failures).toEqual([]);
});
```

Remove the listener in cleanup (`server.events.removeAllListeners()`), or it leaks into later tests. The remaining 401 on `/auth/refresh/` for an anonymous visitor is correct HTTP and stays — returning 200 for "no session" would contradict the status the permission-matrix suite asserts.

- [ ] **Step 6: Verify in the browser**

The tests cannot see StrictMode's double invoke (`render-app.tsx` does not wrap in it; only `src/main.tsx` does), so this is the only place the dev-mode numbers get checked:

```bash
docker compose up -d
```

Open the app in a private window with no refresh cookie, with the console open. Expected: **one** failed request, `POST /api/v1/auth/refresh/` → 401, where today there are three. Then sign in, reload, and confirm the session survives with no failed request — that is the §4.2 regression check, and the reason refresh-first replaced "skip the refresh".

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/auth/services/auth-service.ts frontend/src/features/auth/AuthContext.tsx frontend/src/app/layout/AppShell.test.tsx frontend/src/features/auth/auth-routing.test.tsx
git commit -m "fix: bootstrap the session refresh-first instead of probing /users/me/"
```

---

## Task 13: Extract `UserTable` (spec §5.2)

Mirroring the tasks pattern includes extracting the table: `TaskListPage` delegates to `TaskTable`, while `UserListPage` holds its `<table>` inline. Extract first, then add the card, so each commit is one idea.

**Files:**
- Create: `frontend/src/features/users/components/UserTable.tsx`
- Modify: `frontend/src/features/users/UserListPage.tsx:119-172`

- [ ] **Step 1: Create the component**

Move the markup from `UserListPage.tsx:120-171` verbatim, parameterised. Follow `TaskTable.tsx`'s prop shape — callbacks in, no state:

```tsx
import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/Button";
import type { UserDetail } from "../types";

interface UserTableProps {
  users: UserDetail[];
  onDelete: (user: UserDetail) => void;
}

export function UserTable({ users, onDelete }: UserTableProps) {
  return (
    <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th scope="col" className="p-3 font-medium text-slate-700">
            Name
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Email
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Role
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Active
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b border-slate-100">
            <td className="p-3">
              {user.first_name} {user.last_name}
            </td>
            <td className="p-3 text-slate-600">{user.email}</td>
            <td className="p-3 text-slate-600">{user.role}</td>
            <td className="p-3 text-slate-600">{user.is_active ? "Yes" : "No"}</td>
            <td className="p-3">
              <div className="flex flex-wrap gap-2">
                <Link to="/users/$userId" params={{ userId: user.id }}>
                  <Button variant="secondary" aria-label={`Edit ${user.email}`}>
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  aria-label={`Deactivate ${user.email}`}
                  onClick={() => onDelete(user)}
                >
                  Deactivate
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Delegate from the page**

Replace `UserListPage.tsx:119-172` with:

```tsx
          <div className="overflow-x-auto">
            <UserTable
              users={data.results}
              onDelete={(user) => {
                setDeleteError(null);
                setPendingDelete(user);
              }}
            />
          </div>
```

This keeps the page about filters, paging and the delete dialog, and leaves it comparable in size to `TaskListPage`.

- [ ] **Step 3: Run the suite — it should pass untouched**

```bash
npm run --prefix frontend test -- UserListPage
```
Expected: pass with **no test changes**. A pure extraction that needs test edits has changed behaviour; if that happens, find out what moved before continuing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/users/components/UserTable.tsx frontend/src/features/users/UserListPage.tsx
git commit -m "refactor: extract UserTable from UserListPage"
```

---

## Task 14: Add `UserCard` and the responsive switch (spec §5.2, §6.1)

**Atomic**: the card and the three unscoped test assertions change together. Each of those currently queries `/deactivate operator@demo.local/i` unscoped and will match **twice** once a card exists, because jsdom applies no CSS and both presentations are in the DOM.

**Files:**
- Create: `frontend/src/features/users/components/UserCard.tsx`
- Modify: `frontend/src/features/users/UserListPage.tsx`
- Modify: `frontend/src/features/users/UserListPage.test.tsx` (3 assertions at ~104, 133, 151)

- [ ] **Step 1: Scope the existing assertions first**

```bash
grep -n "deactivate operator@demo.local" frontend/src/features/users/UserListPage.test.tsx
```
Expected: 3 lines. Wrap each in `within(table)`, as the task list already does:

```ts
const table = screen.getByRole("table");
const deactivate = await within(table).findByRole("button", {
  name: /deactivate operator@demo.local/i,
});
```

Import `within` from `@testing-library/react` if it is not already imported.

- [ ] **Step 2: Write the failing card test**

```ts
it("renders a card per user for narrow viewports", async () => {
  // jsdom applies no CSS, so BOTH presentations are in the DOM. That is why
  // the table assertions above are scoped, and why the card gets its own test
  // rather than pretending one does not exist.
  renderApp({ initialPath: "/users" });

  const cards = await screen.findAllByRole("article");
  expect(cards).toHaveLength(2);
  expect(within(cards[0]).getByText("operator@demo.local")).toBeInTheDocument();
  expect(
    within(cards[0]).getByRole("button", { name: /deactivate operator@demo.local/i }),
  ).toBeInTheDocument();
});
```

Match the user count to whatever the module's fixture returns.

- [ ] **Step 3: Run and watch it fail**

```bash
npm run --prefix frontend test -- UserListPage
```
Expected: the card test fails — no `article` role in the document.

- [ ] **Step 4: Create `UserCard`**

Mirror `TaskCard.tsx`, including the `<article>` element and the `dl` body:

```tsx
import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/Button";
import type { UserDetail } from "../types";

interface UserCardProps {
  user: UserDetail;
  onDelete: (user: UserDetail) => void;
}

/**
 * The below-`md` presentation of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader (spec §5.2) — the
 * same reasoning as TaskCard.
 */
export function UserCard({ user, onDelete }: UserCardProps) {
  return (
    <article className="mb-3 rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-medium">
        {user.first_name} {user.last_name}
      </h3>
      <dl className="mb-3 grid grid-cols-2 gap-1 text-sm text-slate-600">
        <dt className="font-medium">Email</dt>
        <dd>{user.email}</dd>
        <dt className="font-medium">Role</dt>
        <dd>{user.role}</dd>
        <dt className="font-medium">Active</dt>
        <dd>{user.is_active ? "Yes" : "No"}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link to="/users/$userId" params={{ userId: user.id }}>
          <Button variant="secondary" aria-label={`Edit ${user.email}`}>
            Edit
          </Button>
        </Link>
        <Button
          variant="danger"
          aria-label={`Deactivate ${user.email}`}
          onClick={() => onDelete(user)}
        >
          Deactivate
        </Button>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Add the breakpoint switch**

In `UserListPage.tsx`, mirror `TaskListPage.tsx:95-117` exactly:

```tsx
          {/* The table collapses to stacked cards below md (spec §5.2). */}
          <div className="hidden overflow-x-auto md:block">
            <UserTable users={data.results} onDelete={beginDelete} />
          </div>
          <div className="md:hidden">
            {data.results.map((user) => (
              <UserCard key={user.id} user={user} onDelete={beginDelete} />
            ))}
          </div>
```

Hoist the shared callback so it is not duplicated:

```tsx
  function beginDelete(user: UserDetail) {
    setDeleteError(null);
    setPendingDelete(user);
  }
```

- [ ] **Step 6: Run both suites and the linters**

```bash
npm run --prefix frontend test
npm run --prefix frontend lint
npm run --prefix frontend build
```
Expected: all pass. `build` runs `tsc`, which catches a prop-type mismatch the tests would not.

- [ ] **Step 7: Check it in a browser at both widths**

```bash
docker compose up -d
```
Narrow the window below `md` (768px) on `/users` and confirm the table is replaced by cards, with Edit and Deactivate working in both presentations. Compare against `/tasks` at the same width — "matches the tasks table" is the actual requirement, and only a side-by-side look confirms it.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/users/components/UserCard.tsx frontend/src/features/users/UserListPage.tsx frontend/src/features/users/UserListPage.test.tsx
git commit -m "feat: give the users table the tasks table's responsive behaviour"
```

---

## Task 15: Documentation (spec §5.1, §4.4)

**Files:**
- Modify: `README.md` — the seeding section near line 152, and a new console-output section

- [ ] **Step 1: Document the seeding flags**

Extend the existing `## Demo credentials` section (line 152):

````markdown
### Seeding more data

```bash
docker compose exec backend python manage.py seed_demo_data --users 25 --tasks 300
```

| Flag | Default | Meaning |
|---|---|---|
| `--users N` | `0` | Add N randomly-named users **on top of** the five fixed accounts |
| `--tasks M` | `45` | Ensure at least M tasks exist |

Both flags are **top-up**: re-running with the same numbers changes nothing, raising one adds
the difference, and neither deletes anything. Every demo account uses the same password, so
`admin@demo.local` always works — sign in as the Admin and browse **Users** to discover the
generated accounts, whose names are random by design.

Generated users get `user{n}@demo.local`, numbered from 1. The index, not the name, carries
uniqueness: the name lists are finite, so an email built from a name would collide and
silently create fewer users than you asked for.

Tasks are assigned at random across every non-Admin user, and `created_by` is randomised too
— so some tasks end up Operator-created, which is what makes the "an Operator may delete only
a task they created" rule (D27) visible in the UI.

Rows are created one at a time rather than with `bulk_create`, because `bulk_create` skips the
`django-simple-history` records the audit trail depends on. Large values are therefore slow:
expect a few minutes for `--tasks 5000`.
````

- [ ] **Step 2: Document the expected console output**

Add a subsection under `## Known limitations and exit criteria` (line 841):

````markdown
### What you should see in the browser console

An anonymous visit to `/login` makes **one** failed request:

```
POST /api/v1/auth/refresh/  401
```

That is correct, not a bug. The access token lives in memory only, so on every load the client
asks whether the refresh cookie can restore a session; for a visitor who has never signed in,
the answer is no. Returning 200 for "no session" would contradict the status the API's own
permission tests assert.

**Two things that look like application errors and are not:**

- `MaxListenersExceededWarning: Possible EventEmitter memory leak` and
  `ObjectMultiplex - orphaned data for stream "app-init-liveness"`, from a
  `chrome-extension://...` origin, are the **MetaMask** extension's content script talking to
  itself. They appear on any page in a browser profile that has it installed, and no change to
  this codebase affects them.
- A `500` from `POST /api/v1/auth/login/` with `relation "users_user" does not exist` means
  `migrate` has not run against this database yet:

  ```bash
  docker compose exec backend python manage.py migrate
  ```

  This is the same startup-ordering sharp edge documented for `celery beat`.
````

- [ ] **Step 3: Check the markdown renders**

```bash
grep -n "seed_demo_data --users" README.md
```
Expected: the new example line. Skim the rendered file for broken tables or unclosed code fences — the nested fences above are the risk.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the seeding flags and the expected console output"
```

---

## Task 16: Full verification

Every task verified its own slice. This runs what CI runs, together, which is the only check that catches an interaction between them.

- [ ] **Step 1: Backend, in both environments**

```bash
docker compose exec -T backend pytest --cov=apps --cov-report=term-missing -q
docker compose exec -T backend mypy .
docker compose exec -T backend ruff check .
docker compose exec -T backend ruff format --check .
```
Expected: all pass; coverage of `apps/` at 100% against the gate of 80. If coverage dropped, the likely cause is a branch in the new seeding code with no test — `--cov-report=term-missing` names the lines.

- [ ] **Step 2: Frontend**

```bash
npm run --prefix frontend test
npm run --prefix frontend lint
npm run --prefix frontend build
```
Expected: all pass.

- [ ] **Step 3: The schema still describes every endpoint**

```bash
docker compose exec -T backend python manage.py spectacular --fail-on-warn
```
Expected: no warnings. drf-spectacular drops a whole viewset with only a warning when generation throws, so a silent `/tasks/stats/` regression from Task 7 would show up here and nowhere else.

- [ ] **Step 4: A clean end-to-end run**

The one check that exercises migrations, seeding and the UI together, in the order a new contributor meets them:

```bash
docker compose down -v
docker compose up -d --build
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_demo_data --users 12 --tasks 80
```

Then sign in as each of `admin@demo.local`, `supervisor@demo.local` and `operator@demo.local` and confirm:

- the dashboard tiles match the lists they link to (compare the numbers, do not eyeball the tiles)
- the Users page shows the 12 generated accounts, and reflows to cards below `md`
- an Operator sees a Delete button only on tasks they created
- a reload keeps you signed in, with no failed request in the console

- [ ] **Step 5: The pre-push hook, for real**

```bash
git push --dry-run origin HEAD
```
Expected: the hook runs the suite via Compose and reports `backend tests passed in: docker compose`.

- [ ] **Step 6: Commit anything the verification changed**

If nothing changed, there is nothing to commit — say so rather than inventing a commit.

---

## Task 17: Persist insights to `claude-insights/`

**Files:**
- Modify: `D:\VirtualWrapper\code\claude-insights\projects\task-management-system.md`

- [ ] **Step 1: Read what is already there**

The file exists and already covers the iteration-1 patterns and gotchas. Append; do not duplicate or restructure.

- [ ] **Step 2: Add only what cost time to discover**

Candidates from this iteration, each non-obvious and transferable:

- **`sorted(model)` is not `sorted(dict)`.** A pydantic v2 model iterates as `(name, value)` pairs, so an audit-log line that logged field names from a dict starts logging **values** when the parameter becomes a model — a silent security regression that passes every behavioural test. Pin it with a test that asserts a submitted value is absent from the log.
- **`extra="forbid"` only does something if the caller splats.** Mapping `validated_data` field by field makes it unreachable; the loud failure it buys is the whole reason to prefer splatting.
- **`model_fields_set` is the only way to express PATCH.** Truthiness and `is not None` both collapse "explicitly null" into "absent", which breaks unassign and clear-due-date identically.
- **A module-private single-flight is not reusable.** `refreshInFlight` deduplicated the 401-retry path but not a new bootstrap caller, and `/auth/refresh/` being in `NO_REFRESH_PATHS` meant a direct post bypassed it entirely. With token rotation plus blacklisting, that turns StrictMode's double-invoked effect into a spurious logout.
- **`onUnhandledRequest: "error"` makes the msw default fixture part of the contract.** Changing which request a bootstrap makes first breaks every rendered test at once; the cheapest fix is deciding what the *default* fixture represents, not patching each module.
- **Verifying a claim about test infrastructure means reading the harness.** `renderApp()` has no `StrictMode` wrapper even though `main.tsx` does, so a "two concurrent bootstraps" test written against `renderApp` would be a tautology that passes for the wrong reason.

- [ ] **Step 3: Commit**

```bash
cd D:/VirtualWrapper/code/claude-insights
git add projects/task-management-system.md
git commit -m "docs: add refinement iteration 2 insights"
```

Note the repository is mostly untracked and two unrelated files carry modifications from other work — stage narrowly, as the previous commit there did.
