# Iteration 3 Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the four fixes in [2026-10-06-iteration-3-fixes-design.md](../specs/2026-10-06-iteration-3-fixes-design.md): a task-delete confirmation, an honest status selector, dashboard CTAs with a full-row due-soon card, and a green `compat` CI job verified in GitHub Actions.

**Architecture:** No layering changes. The API gains one reported field (`allowed_transitions`, D39) beside the existing `can_delete`; the SPA reads it instead of hard-coding the transition table. Frontend changes stay inside the task and dashboard features and follow existing components (`DeleteUserDialog`, `TaskListPage`'s header).

**Tech Stack:** Django 6 · DRF 3.18 · drf-spectacular · pytest · React 19 · TypeScript 6 · TanStack Router + Query v5 · Tailwind v3 · Vitest + RTL + MSW · GitHub Actions + `gh`

---

## Execution Notes

**Branch:** `fix/iteration-3` (already created, spec committed). Never commit to `main`.

**Backend suite:** `bash scripts/run-backend-tests.sh` (Compose first, forcing the test settings). Single modules:

```bash
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest <path> -q --no-cov
```

`-e DJANGO_SETTINGS_MODULE=...` is load-bearing (the container's `.env` names the local settings, and pytest-django ranks that env var above `pyproject.toml`). `--no-cov` is needed on single-module runs because `addopts` carries the 80% gate — exactly the trap Task 1 fixes in CI.

**Local `uv` runs** need `POSTGRES_PORT=5442` exported to reach Compose's Postgres.

**Frontend:** `npm run --prefix frontend test`, plus `-- <file-fragment>` for one module.

**Test queries:** jsdom applies no CSS, so table rows *and* cards are both in the DOM — every row button exists twice. Scope row buttons with `within(table)` and dialog buttons with `within(screen.getByRole("dialog"))`. `onUnhandledRequest: "error"` is on: every request a test causes needs a handler.

**Commit after every task.** Each leaves both suites green.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `.github/workflows/ci.yml` | modify | `compat` stage 2 gains `--no-cov` |
| `README.md` | modify | compat stage-2 note; "same gate" sentence qualified |
| `backend/apps/tasks/serializers.py` | modify | `allowed_transitions` on `TaskDetailSerializer` |
| `backend/apps/tasks/tests/test_serializers.py` | modify | field-list test + transition tests |
| `frontend/src/features/tasks/types.ts` | modify | `TaskDetail.allowed_transitions` |
| `frontend/src/features/tasks/components/TaskForm.tsx` | modify | status field driven by a mount-time snapshot |
| `frontend/src/features/tasks/components/DeleteTaskDialog.tsx` | **create** | the delete confirmation |
| `frontend/src/features/tasks/TaskListPage.tsx` | modify | delete via the dialog |
| `frontend/src/features/tasks/TaskDetailPage.tsx` | modify | delete via the dialog |
| `frontend/src/features/tasks/TaskForm.test.tsx` | modify | form + detail-page tests |
| `frontend/src/features/tasks/TaskListPage.test.tsx` | modify | list-page delete tests |
| `frontend/src/features/dashboard/components/StatTile.tsx` | modify | named-group card with a stretched CTA link |
| `frontend/src/features/dashboard/StatsPage.tsx` | modify | header with "New task"; wide due-soon card |
| `frontend/src/features/dashboard/StatsPage.test.tsx` | modify | card-based assertions |

---

## Task 1: The `compat` job (spec §6, D43)

First, because it is independent and cheap — and the reproduction it starts with is the evidence the fix targets the right thing.

**Files:**
- Modify: `.github/workflows/ci.yml:62-64`
- Modify: `README.md` (compat section, stage 2; "Running the checks" gate sentence)

- [ ] **Step 1: Reproduce the CI failure locally**

```bash
POSTGRES_PORT=5442 uv run --directory backend pytest apps/users/tests/test_api_auth.py -q
```
Expected: `14 passed`, then `FAIL Required test coverage of 80% not reached. Total coverage: 63.34%`, exit code 1 — the same numbers as run 37559034429.

- [ ] **Step 2: Confirm the fix locally**

```bash
POSTGRES_PORT=5442 uv run --directory backend pytest apps/users/tests/test_api_auth.py -q --no-cov
```
Expected: `14 passed`, exit 0.

- [ ] **Step 3: Edit the workflow**

In `.github/workflows/ci.yml`, replace the stage-2 comment and step:

```yaml
      # Stage 2: the git-pinned simplejwt actually issues and verifies a token
      # on Django 6.0 — the single most load-bearing claim in D3. --no-cov: this
      # runs ONE module as a smoke test, and addopts' 80% gate is a whole-suite
      # measurement that belongs to the backend job.
      - name: Login round-trip against the cookie auth views
        run: uv run --directory backend pytest apps/users/tests/test_api_auth.py -q --no-cov
```

- [ ] **Step 4: Update the README**

In "The `compat` CI job, and when to delete it", stage 2 becomes:

```markdown
2. Run the login round-trip, which is the single most load-bearing claim in D3 — that the
   git-pinned simplejwt actually issues and verifies a token on Django 6.0. It runs with
   `--no-cov`: it is a smoke test of one module, and the 80% gate is a whole-suite
   measurement that belongs to the `backend` job.
```

In "Running the checks", replace the **whole paragraph** that begins "`pytest` carries `--cov=apps …` in `addopts`, so a local run and CI apply the same gate" (it ends "80 is a floor, not a target."), so its last sentence is not duplicated:

```markdown
`pytest` carries `--cov=apps --cov-report=term-missing --cov-fail-under=80` in `addopts`,
so every full-suite run — a local run, the pre-push script and CI's `backend` job — applies
the same gate rather than two thresholds that can drift. Only `compat`'s one-module smoke
step opts out, with `--no-cov`. The suite currently sits at 100% of `apps/`; 80 is a floor,
not a target.
```

- [ ] **Step 5: Validate the workflow file and run stage 3 locally**

```bash
pre-commit run check-yaml --files .github/workflows/ci.yml
docker compose exec -T backend python manage.py spectacular --validate --file /tmp/schema.yaml
```
Expected: `check yaml....Passed`; the spectacular command exits 0. Writing to the container's `/tmp` leaves nothing behind in the repository.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci: run compat's one-module smoke step without the coverage gate"
```

---

## Task 2: `allowed_transitions` on the task detail (spec §4.1, D39)

**Files:**
- Modify: `backend/apps/tasks/serializers.py` (imports; `TaskDetailSerializer`)
- Test: `backend/apps/tasks/tests/test_serializers.py`

- [ ] **Step 1: Write the failing tests**

In `test_serializers.py`, add `"allowed_transitions"` to the set in `test_detail_serializer_adds_the_detail_only_fields` (keep the rest of the set as it is):

```python
        "status",
        "allowed_transitions",
```

Then add, after that test:

```python
@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (TaskStatus.PENDING, ["IN_PROGRESS", "CANCELLED"]),
        (TaskStatus.IN_PROGRESS, ["PENDING", "CANCELLED"]),
        (TaskStatus.COMPLETED, []),
        (TaskStatus.CANCELLED, []),
    ],
)
def test_detail_reports_the_allowed_transitions(status, expected):
    """D39: reported so the SPA never offers a status change the API would
    refuse. Declaration order, not alphabetical; COMPLETED never appears, since
    only the complete action reaches it.

    The expectations are written out rather than computed from TRANSITIONS, so
    the test is an independent oracle instead of restating the implementation.
    """
    # The check constraint requires completed_at exactly when COMPLETED.
    completed_at = timezone.now() if status == TaskStatus.COMPLETED else None
    task = TaskFactory(status=status, completed_at=completed_at)
    assert TaskDetailSerializer(task).data["allowed_transitions"] == expected


def test_the_list_payload_does_not_carry_allowed_transitions():
    # List rows offer no status change, so the field would be dead weight.
    assert "allowed_transitions" not in TaskListSerializer(TaskFactory()).data
```

Add `from django.utils import timezone` after `import pytest` and before `from rest_framework.test import APIRequestFactory`, so ruff's import sorting (I001) stays clean.

- [ ] **Step 2: Run them and watch them fail**

```bash
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest apps/tasks/tests/test_serializers.py -q --no-cov
```
Expected: the field-list test and the four parametrized cases fail (`KeyError: 'allowed_transitions'` / set mismatch); the list test passes.

- [ ] **Step 3: Implement**

In `serializers.py`, extend the models import:

```python
from apps.tasks.models import TRANSITIONS, Task, TaskStatus
```

In `TaskDetailSerializer`, after `get_can_delete`:

```python
    # D39: reported, not re-derived — the can_delete reasoning (D27) applied to
    # D19's transition table, so the SPA never offers a status change the API
    # would refuse. COMPLETED never appears: only the complete action reaches
    # it, and TRANSITIONS never lists it as a target. Declaration order rather
    # than sorted(), which would put CANCELLED before IN_PROGRESS.
    allowed_transitions = serializers.SerializerMethodField()

    def get_allowed_transitions(self, task) -> list[str]:
        allowed = TRANSITIONS[task.status]
        return [status for status in TaskStatus.values if status in allowed]
```

and in its `Meta.fields`, insert `"allowed_transitions"` directly after `"status"`.

The `-> list[str]` hint is required: without it drf-spectacular emits a warning, which `compat`'s `--validate` would not catch but `--fail-on-warn` and the README's "0 warnings" claim would.

- [ ] **Step 4: Run them and watch them pass**

```bash
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest apps/tasks/tests/test_serializers.py -q --no-cov
```
Expected: all pass.

- [ ] **Step 5: Full suite, types, lint, schema**

```bash
bash scripts/run-backend-tests.sh
uv run --directory backend mypy
uv run --directory backend ruff check .
docker compose exec -T backend python manage.py spectacular --fail-on-warn --file /tmp/schema.yaml
```
Expected: all pass; coverage stays at 100%; spectacular exits 0 with no warnings.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tasks/serializers.py backend/apps/tasks/tests/test_serializers.py
git commit -m "feat: report allowed status transitions on the task detail"
```

---

## Task 3: The status field reads a mount-time snapshot (spec §4.2, D40)

**Files:**
- Modify: `frontend/src/features/tasks/types.ts` (`TaskDetail`)
- Modify: `frontend/src/features/tasks/components/TaskForm.tsx`
- Test: `frontend/src/features/tasks/TaskForm.test.tsx`

- [ ] **Step 1: Add the field to the type and the fixture**

`types.ts`, in `TaskDetail`:

```ts
  /**
   * D39: the statuses a PATCH may move this task to, reported by the API from
   * its transition table rather than re-derived here. Empty for a terminal
   * task; never contains COMPLETED, which only the complete action reaches.
   */
  allowed_transitions: TaskStatus[];
```

`TaskForm.test.tsx`, in `DETAIL` (a pending task), after `status: "PENDING",`:

```ts
  allowed_transitions: ["IN_PROGRESS", "CANCELLED"],
```

Add `act` and `within` to the `@testing-library/react` import, and add:

```ts
import { focusManager } from "@tanstack/react-query";
```

- [ ] **Step 2: Write the failing tests**

Add a capture helper beside `taskDetail()`:

```ts
/** Records each PATCH body so a test can assert what was — and was not — sent. */
function capturePatches(): { bodies: Record<string, unknown>[] } {
  const record = { bodies: [] as Record<string, unknown>[] };
  server.use(
    http.patch(`${BASE}/tasks/${TASK_ID}/`, async ({ request }) => {
      record.bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(DETAIL);
    }),
  );
  return record;
}

const COMPLETED = {
  status: "COMPLETED" as const,
  completed_at: "2026-10-02T10:00:00Z",
  allowed_transitions: [],
};
```

Inside `describe("TaskForm", …)`:

```ts
  it("shows a completed task's status read-only, with no status control", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail(COMPLETED);
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByLabelText(/title/i);
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText(/keep their status/i)).toBeInTheDocument();
  });

  it("shows a cancelled task's status read-only too", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail({ status: "CANCELLED", allowed_transitions: [] });
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByLabelText(/title/i);
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("saves a completed task without sending a status", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail(COMPLETED);
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patches.bodies).toHaveLength(1));
    expect(patches.bodies[0]).not.toHaveProperty("status");
  });

  it("offers a pending task's status and its transitions, and sends a changed status", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const select = await screen.findByRole("combobox", { name: /status/i });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Pending",
      "In progress",
      "Cancelled",
    ]);
    const user = userEvent.setup();
    await user.selectOptions(select, "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patches.bodies).toHaveLength(1));
    expect(patches.bodies[0]).toMatchObject({ status: "IN_PROGRESS" });
  });

  it("keeps Pending on offer after changing a pending task to In progress", async () => {
    // The options come from the snapshot, not from the select's own state —
    // otherwise picking In progress would drop Pending and the change could
    // not be undone (D40).
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const select = await screen.findByRole("combobox", { name: /status/i });
    const user = userEvent.setup();
    await user.selectOptions(select, "IN_PROGRESS");
    expect(within(select).getByRole("option", { name: "Pending" })).toBeInTheDocument();
  });

  it("saves an untouched pending task without sending a status", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patches.bodies).toHaveLength(1));
    expect(patches.bodies[0]).not.toHaveProperty("status");
  });

  it("does not undo a status someone else changed while the form was open", async () => {
    // D40. A focus refetch brings the task back IN_PROGRESS while this form,
    // opened on PENDING, is untouched. Comparing against the LIVE task would
    // send PENDING and silently revert the other person's change.
    signedInAs(SUPERVISOR);
    assignableUsers();
    let gets = 0;
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () => {
        gets += 1;
        return HttpResponse.json(
          gets === 1
            ? DETAIL
            : { ...DETAIL, status: "IN_PROGRESS", allowed_transitions: ["PENDING", "CANCELLED"] },
        );
      }),
    );
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByRole("combobox", { name: /status/i });
    try {
      // renderApp does not expose its QueryClient; the test client's default
      // staleTime of 0 makes a focus event refetch the active detail query.
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      // The UI deliberately does not change on refetch, so count the GETs —
      // otherwise this could pass without the refetch ever happening.
      await waitFor(() => expect(gets).toBe(2));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      await waitFor(() => expect(patches.bodies).toHaveLength(1));
      expect(patches.bodies[0]).not.toHaveProperty("status");
    } finally {
      // Restores the shared singleton. isFocused() then resolves to true, which
      // fires one more focus refetch — harmless, the handlers are still in place.
      focusManager.setFocused(undefined);
    }
  });
```

Update the existing **"surfaces a 409 invalid_status_transition"** test: under D40 an untouched form sends no `status`, so it must change the status first to model a real case. Replace its two `user` lines with:

```ts
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole("combobox", { name: /status/i }), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
```

- [ ] **Step 3: Run them and watch them fail**

```bash
npm run --prefix frontend test -- TaskForm
```
Expected: **five fail**, each for a stated reason —
- the two read-only tests: a status combobox still exists;
- "saves a completed task…", "saves an untouched pending task…" and the refetch test: the body still carries `status`.

**Two pass already, by design:** "offers a pending task's status and its transitions…" and "keeps Pending on offer…". Today's static `EDITABLE_STATUSES` happens to produce the right options for a pending task. These are guards against a *wrong* new implementation (options derived from the select's state), and Step 6 proves they can fail.

- [ ] **Step 4: Implement**

In `TaskForm.tsx`:

1. Delete the local `STATUS_LABEL` and the `EDITABLE_STATUSES` constant together with its doc comment, and import the shared label map instead:

```ts
import { STATUS_LABEL, StatusBadge } from "./StatusBadge";
```

2. Add, at module level:

```ts
/**
 * Display order only — Pending, In progress, Completed, Cancelled — taken from
 * the label map's declaration order. Which statuses are OFFERED is the API's
 * call (allowed_transitions, D39), never this list's.
 */
const STATUS_ORDER = Object.keys(STATUS_LABEL) as TaskStatus[];
```

3. In the component, replace the `status` state line with:

```ts
  // D40: ONE snapshot, taken when the form opens, drives the status field: the
  // options, the read-only switch and the "did the user change it?" check. The
  // detail query refetches (30 s staleTime, refetch on focus), and none of those
  // three may follow it — options from the select's own state would drop the
  // original status after a change; read-only from the live task could strand
  // a changed value after a refetch; comparing with the live status would
  // silently undo a change someone else made meanwhile.
  const [initialStatus] = useState(task?.status);
  const [initialTransitions] = useState<TaskStatus[]>(task?.allowed_transitions ?? []);
  const statusOptions = STATUS_ORDER.filter(
    (option) => option === initialStatus || initialTransitions.includes(option),
  );
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "PENDING");
```

4. In `handleSubmit`, replace the status spread:

```ts
        // Sent only when the user changed it (D40). TaskEditPage omits an
        // undefined status from the PATCH.
        ...(isEdit && status !== initialStatus ? { status } : {}),
```

5. Replace the edit-mode status block in the JSX:

```tsx
      {/* Edit mode only: TaskCreateSerializer accepts no status field. */}
      {isEdit && initialTransitions.length > 0 && (
        <div className="mb-4">
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* A terminal task has nothing to choose, so nothing to get wrong. Plain
          text, not a <label>: there is no control for it to label. */}
      {isEdit && initialTransitions.length === 0 && initialStatus !== undefined && (
        <div className="mb-4">
          <p className="mb-1 text-sm font-medium text-slate-700">Status</p>
          <StatusBadge status={initialStatus} />
          <p className="mt-1 text-sm text-slate-500">
            Completed and cancelled tasks keep their status.
          </p>
        </div>
      )}
```

- [ ] **Step 5: Run them and watch them pass**

```bash
npm run --prefix frontend test -- TaskForm
```
Expected: all pass, including "never offers COMPLETED", which now finds Cancelled through `DETAIL.allowed_transitions`.

- [ ] **Step 6: Prove the refetch test can tell the designs apart**

Temporarily change the submit comparison to the live task — `status !== task?.status` — and re-run:

```bash
npm run --prefix frontend test -- TaskForm
```
Expected: **"does not undo a status someone else changed…" FAILS** with `status: "PENDING"` in the body. Restore `initialStatus`.

Then temporarily derive the options from the select's state instead of the snapshot — `option === status || initialTransitions.includes(option)` — and re-run. Expected: **"keeps Pending on offer…" FAILS**. Restore it. A test that cannot fail is decoration.

- [ ] **Step 7: Whole suite, typecheck, lint**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
```
Expected: all pass. `typecheck` catches any other `TaskDetail` literal now missing the field.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/tasks/types.ts frontend/src/features/tasks/components/TaskForm.tsx frontend/src/features/tasks/TaskForm.test.tsx
git commit -m "fix: show terminal task statuses read-only and send status only when changed"
```

---

## Task 4: `DeleteTaskDialog` and the list page (spec §3, D38)

**Files:**
- Create: `frontend/src/features/tasks/components/DeleteTaskDialog.tsx`
- Modify: `frontend/src/features/tasks/TaskListPage.tsx`
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `TaskListPage.test.tsx`:

```ts
describe("task deletion from the list", () => {
  const TASK = task({ can_delete: true });

  /** Counts DELETEs; onUnhandledRequest: "error" requires a handler anyway. */
  function deletesRespondWith(response: () => Response) {
    const record = { count: 0 };
    server.use(
      http.delete(`${BASE}/tasks/${TASK.id}/`, () => {
        record.count += 1;
        return response();
      }),
    );
    return record;
  }

  async function openDialog() {
    signedInAs(OPERATOR);
    tasksRespondWith([TASK]);
    await renderApp("/tasks");
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: /^delete review the brief/i }));
    return { user, dialog: screen.getByRole("dialog") };
  }

  it("asks for confirmation, naming the task, and Cancel deletes nothing", async () => {
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    const { user, dialog } = await openDialog();
    expect(dialog).toHaveTextContent(/review the brief/i);
    expect(dialog).toHaveTextContent(/no way to restore/i);
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deletes.count).toBe(0);
  });

  it("deletes exactly once on confirm and closes the dialog", async () => {
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deletes.count).toBe(1);
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    deletesRespondWith(() =>
      HttpResponse.json(
        { detail: "You can only delete tasks you created.", code: "permission_denied" },
        { status: 403 },
      ),
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/only delete tasks you created/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run --prefix frontend test -- TaskListPage
```
Expected: all three fail — clicking Delete deletes immediately, so `getByRole("dialog")` throws.

- [ ] **Step 3: Create the dialog**

`frontend/src/features/tasks/components/DeleteTaskDialog.tsx`:

```tsx
import { Button } from "../../../components/Button";
import { FormError } from "../../../components/FormError";

interface DeleteTaskDialogProps {
  task: { title: string };
  error: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirms a task deletion and says plainly what it does (D38): the task is
 * soft-deleted, so its record and history remain for the audit trail, but no
 * endpoint restores it — calling this "delete" without saying so would mislead
 * someone about a decision they cannot reverse. Mirrors DeleteUserDialog.
 */
export function DeleteTaskDialog({
  task,
  error,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteTaskDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-title"
      className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 id="delete-task-title" className="mb-3 text-lg font-semibold text-slate-900">
          Delete &ldquo;{task.title}&rdquo;?
        </h2>
        <p className="mb-2 text-sm text-slate-700">
          The task disappears from every list and from the dashboard. Its record and history are
          kept for the audit trail.
        </p>
        <p className="mb-4 text-sm font-medium text-slate-900">
          There is no way to restore it from this application.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the list page**

In `TaskListPage.tsx`:

1. Imports: add `import { DeleteTaskDialog } from "./components/DeleteTaskDialog";` and change the types import to `import type { TaskFilters as Filters, TaskListItem } from "./types";`.
2. State, after `busyId`:

```ts
  const [pendingDelete, setPendingDelete] = useState<TaskListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```

3. Functions, after `runAction`:

```ts
  /** Looked up at click time and stored as the object, so a refetch while the
   *  dialog is open cannot make it disappear. */
  function beginDelete(id: string) {
    const target = data?.results.find((candidate) => candidate.id === id);
    if (target === undefined) return;
    setDeleteError(null);
    setPendingDelete(target);
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "Could not delete that task.",
      );
    }
  }
```

4. Replace **both** `onDelete={(id) => void runAction(id, remove.mutateAsync)}` (table and card) with `onDelete={beginDelete}`.
5. Before the closing `</section>`:

```tsx
      {pendingDelete !== null && (
        <DeleteTaskDialog
          task={pendingDelete}
          error={deleteError}
          isDeleting={remove.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
```

- [ ] **Step 5: Run them and watch them pass**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
```
Expected: all pass, including the existing "hides/shows the delete control" tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/tasks/components/DeleteTaskDialog.tsx frontend/src/features/tasks/TaskListPage.tsx frontend/src/features/tasks/TaskListPage.test.tsx
git commit -m "feat: confirm before deleting a task from the list"
```

---

## Task 5: Delete confirmation on the detail page (spec §3.2)

**Files:**
- Modify: `frontend/src/features/tasks/TaskDetailPage.tsx`
- Test: `frontend/src/features/tasks/TaskForm.test.tsx` (its `TaskDetailPage` describe)

- [ ] **Step 1: Write the failing tests**

Inside `describe("TaskDetailPage", …)`:

```ts
  function deletesRespondWith(response: () => Response) {
    const record = { count: 0 };
    server.use(
      http.delete(`${BASE}/tasks/${TASK_ID}/`, () => {
        record.count += 1;
        return response();
      }),
    );
    return record;
  }

  it("deletes after confirmation and returns to the task list", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(await screen.findByRole("heading", { name: /^tasks$/i })).toBeInTheDocument();
    expect(deletes.count).toBe(1);
  });

  it("stays on the task when the confirmation is cancelled", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /review the brief/i })).toBeInTheDocument();
    expect(deletes.count).toBe(0);
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    deletesRespondWith(() =>
      HttpResponse.json(
        { detail: "You can only delete tasks you created.", code: "permission_denied" },
        { status: 403 },
      ),
    );
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/only delete tasks you created/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run --prefix frontend test -- TaskForm
```
Expected: the three new tests fail — Delete runs immediately, so there is no dialog.

- [ ] **Step 3: Implement**

In `TaskDetailPage.tsx`:

1. Import: `import { DeleteTaskDialog } from "./components/DeleteTaskDialog";`
2. State, beside `actionError` — **before** the early returns, as hooks must be:

```ts
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
```

3. `run` loses its now-unused `after` parameter:

```ts
  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again.",
      );
    }
  }

  async function confirmDelete() {
    setDeleteError(null);
    try {
      // taskId, not task.id: a function DECLARATION is hoisted, so TypeScript
      // does not carry the early return's narrowing into it — `task` would still
      // be TaskDetail | undefined here (TS18048). The route param is a string.
      await remove.mutateAsync(taskId);
      await navigate({ to: "/tasks" });
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "Could not delete that task.",
      );
    }
  }
```

4. The Delete button opens the dialog instead of deleting:

```tsx
        {task.can_delete && (
          <Button
            variant="danger"
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
          >
            Delete
          </Button>
        )}
```

5. Before the closing `</section>`:

```tsx
      {confirmingDelete && (
        <DeleteTaskDialog
          task={task}
          error={deleteError}
          isDeleting={remove.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
```
Expected: all pass. `typecheck` matters here specifically: Vitest strips types, so a `task.id`
inside `confirmDelete` would pass every test and still fail CI's `frontend` job.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/tasks/TaskDetailPage.tsx frontend/src/features/tasks/TaskForm.test.tsx
git commit -m "feat: confirm before deleting a task from its detail page"
```

---

## Task 6: Dashboard cards become named groups with a stretched CTA (spec §5.2, §5.4, D41)

The tests change first — to the new contract — and fail against today's link-tiles.

**Files:**
- Modify: `frontend/src/features/dashboard/components/StatTile.tsx`
- Test: `frontend/src/features/dashboard/StatsPage.test.tsx`

- [ ] **Step 1: Move the tests to the new contract**

In `StatsPage.test.tsx`:

1. Below `tile()`, add:

```ts
/** A card is a named group (role="group" + aria-labelledby), so its number can
 *  be read without depending on the markup inside it. */
function card(label: string): HTMLElement {
  return screen.getByRole("group", { name: label });
}
```

and update `tile()`'s comment to: `/** The card's CTA link; its href is what the drill-through assertions read. */`

2. Replace the body of **"renders all six figures from one GET /tasks/stats/ call"** after `await renderApp("/dashboard");`:

```ts
    expect(await screen.findByRole("group", { name: "All tasks" })).toHaveTextContent("10");
    expect(card("Pending")).toHaveTextContent("4");
    expect(card("In progress")).toHaveTextContent("3");
    expect(card("Completed")).toHaveTextContent("2");
    expect(card("Cancelled")).toHaveTextContent("1");
    expect(card("Overdue")).toHaveTextContent("5");
    expect(card("Due in 7 days")).toHaveTextContent("6");
    expect(statsCalls).toBe(1);
```

3. In **"links a status tile to that status's list"**, `tile(/^pending/i)` becomes `tile(/— pending$/i)`.

4. In **"renders identically for a Supervisor and an Operator"**, both collections read the cards, which carry the numbers, instead of the links, which no longer do:

```ts
    const supervisorTiles = screen
      .getAllByRole("group")
      .map((group) => group.textContent)
      .join("|");
```

and the same for `operatorTiles`.

5. Add:

```ts
  it("gives every card a 'View tasks' link named after its card", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("group", { name: "All tasks" });
    for (const label of ["All tasks", "Pending", "In progress", "Completed", "Cancelled", "Overdue", "Due in 7 days"]) {
      const link = within(card(label)).getByRole("link");
      expect(link).toHaveTextContent(/^view tasks/i);
      expect(link).toHaveAccessibleName(`View tasks — ${label}`);
    }
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run --prefix frontend test -- StatsPage
```
Expected: **four** fail —
- three card-based tests ("renders all six figures", "renders identically…", "gives every card…")
  with `Unable to find role="group"`;
- "links a status tile to that status's list" with `Unable to find … role "link" and name
  /— pending$/i`, because today's tile link is named "Pending 4".

- [ ] **Step 3: Rewrite `StatTile`**

```tsx
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { useId } from "react";

interface StatTileProps {
  label: string;
  value: number;
  /** Where the CTA drills through to. Must carry the tile's FULL predicate. */
  to: string;
  search?: Record<string, unknown>;
  accent?: string;
  /** Span the whole grid row and lay out in one line (D42). */
  wide?: boolean;
}

/**
 * A card whose single CTA is a stretched link (D41): the link's ::after covers
 * the card, so the whole card is clickable while there is exactly one link and
 * no button nested inside an anchor. Nothing else interactive may go inside —
 * the ::after would cover it — which is why this takes no children. `relative`
 * on the card is what keeps the ::after inside it.
 *
 * role="group" + aria-labelledby names the card after its label. The id comes
 * from useId(), never from the label text: aria-labelledby reads a
 * space-separated LIST of ids, so an id built from "In progress" would break.
 */
export function StatTile({ label, value, to, search, accent, wide = false }: StatTileProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={clsx(
        "relative rounded-lg bg-white p-4 shadow-sm transition hover:shadow focus-within:ring-2 focus-within:ring-status-progress",
        wide && "col-span-full flex flex-wrap items-center gap-x-6 gap-y-2",
      )}
    >
      <p id={labelId} className="text-sm font-medium text-slate-600">
        {label}
      </p>
      <p className={clsx("text-3xl font-semibold", accent ?? "text-slate-900", !wide && "mt-1")}>
        {value}
      </p>
      <Link
        to={to}
        search={search}
        className={clsx(
          "inline-block rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none",
          "after:absolute after:inset-0 after:content-['']",
          wide ? "ml-auto" : "mt-3",
        )}
      >
        View tasks<span className="sr-only"> — {label}</span>
      </Link>
    </div>
  );
}
```

The visible CTA reuses the secondary `Button`'s classes so it reads as a button; it stays an `<a>`, because a stretched link has to be the link.

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
```
Expected: all pass. The href and drill-through tests are unchanged and still pass, because the CTA keeps each tile's `to` and `search`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/dashboard/components/StatTile.tsx frontend/src/features/dashboard/StatsPage.test.tsx
git commit -m "feat: give dashboard cards a View tasks call to action"
```

---

## Task 7: Dashboard header and the full-row card (spec §5.1, §5.3, D42)

**Files:**
- Modify: `frontend/src/features/dashboard/StatsPage.tsx`
- Test: `frontend/src/features/dashboard/StatsPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
  it("offers New task in the header", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    const newTask = await screen.findByRole("link", { name: /new task/i });
    expect(newTask.getAttribute("href")).toBe("/tasks/new");
  });

  it("keeps New task available while stats load and when they fail", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/tasks/stats/`, () =>
        HttpResponse.json({ detail: "Stats are unavailable.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp("/dashboard");
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: /new task/i })).toBeInTheDocument();
  });

  it("spans the due-soon card across the full row, and only that card", async () => {
    signedInAs(SUPERVISOR);
    statsRespondWith(STATS);
    await renderApp("/dashboard");
    await screen.findByRole("group", { name: "All tasks" });
    // jsdom applies no CSS, so the layout is asserted through its class.
    expect(card("Due in 7 days")).toHaveClass("col-span-full");
    expect(card("Overdue")).not.toHaveClass("col-span-full");
  });
```

In the existing **"shows a loading state"** test, add after its `expect`:

```ts
    expect(screen.getByRole("link", { name: /new task/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npm run --prefix frontend test -- StatsPage
```
Expected: the four header and layout assertions fail.

- [ ] **Step 3: Implement**

In `StatsPage.tsx`:

1. Imports:

```ts
import { Link } from "@tanstack/react-router";

import { Button } from "../../components/Button";
```

2. Above `StatsPage`:

```tsx
/**
 * Rendered in every state, so creating a task never waits on statistics. The
 * same <Link><Button> markup as the task list's header; both dashboard roles
 * may create tasks.
 */
function DashboardHeader() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <Link to="/tasks/new" className="ml-auto">
        <Button>New task</Button>
      </Link>
    </div>
  );
}
```

3. Replace each of the three `<h1 className="mb-4 text-xl font-semibold text-slate-900">Dashboard</h1>` (loading, error, loaded) with `<DashboardHeader />`.
4. Pass `wide` to the "Due in 7 days" `StatTile`, and extend its comment:

```tsx
        {/* wide: the six cards above divide evenly into 2 and 3 columns, so a
            full-row last card leaves no breakpoint with a lone narrow one (D42). */}
        <StatTile
          label="Due in 7 days"
          wide
```

- [ ] **Step 4: Run them and watch them pass**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
```
Expected: all pass across the suite — `AppShell` and auth tests find the dashboard by its "Dashboard" heading, which is unchanged.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/dashboard/StatsPage.tsx frontend/src/features/dashboard/StatsPage.test.tsx
git commit -m "feat: add New task to the dashboard and span the due-soon card"
```

---

## Task 8: Verify locally, then in GitHub Actions (spec §7, D44)

- [ ] **Step 1: Backend**

```bash
bash scripts/run-backend-tests.sh
uv run --directory backend mypy
uv run --directory backend ruff check .
uv run --directory backend ruff format --check .
docker compose exec -T backend python manage.py spectacular --fail-on-warn --file /tmp/schema.yaml
```
Expected: all pass; coverage 100%; no schema warnings.

- [ ] **Step 2: The two `compat` steps, exactly as CI runs them**

```bash
POSTGRES_PORT=5442 uv run --directory backend pytest apps/users/tests/test_api_auth.py -q --no-cov
docker compose exec -T backend python manage.py spectacular --validate --file /tmp/schema.yaml
```
Expected: both exit 0.

- [ ] **Step 3: Frontend**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
npm run --prefix frontend build
```
Expected: all pass; lint shows no errors.

- [ ] **Step 4: Visual check**

With `docker compose up -d`, open `http://localhost:5173/dashboard` as `supervisor@demo.local` and check, below and above 1024 px (`lg`):
- every card shows "View tasks"; clicking anywhere on a card follows it; Tab reaches each CTA with a visible ring on the card;
- "Due in 7 days" spans the full last row at both widths;
- "New task" sits in the header.

Then delete a task from the list and from its detail page, and edit a completed task.

**If no browser is available in the executing environment, do not claim this step.** Record it as unverified, with the checklist above, for the project owner to run.

- [ ] **Step 5: Push the branch — needs the project owner's approval**

```bash
git push -u origin fix/iteration-3
```

The workflow triggers on `push` to any branch. Pushes have been blocked by permission settings in this project; if the push is refused, stop and ask the owner to approve or run it — do not look for a way around the block.

- [ ] **Step 6: Find the run for this commit and watch it**

```bash
git rev-parse HEAD
gh run list --branch fix/iteration-3 --limit 1 --json databaseId,headSha,status
```
Confirm `headSha` equals `HEAD` — otherwise this is an older run. Then:

```bash
gh run watch <databaseId> --exit-status
```
Expected: exit 0.

- [ ] **Step 7: Confirm all four jobs, not just `compat`**

```bash
gh run view <databaseId> --json jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'
```
Expected: `lint success`, `compat success`, `backend success`, `frontend success`.

On any failure:

```bash
gh run view --job <jobId> --log-failed
```

Fix on the branch, commit, push, and repeat from Step 6. Merging to `main` is the owner's call.

---

## Task 9: Persist insights to `claude-insights/`

**Files:**
- Modify: `D:\VirtualWrapper\code\claude-insights\projects\task-management-system.md`
- Modify: `D:\VirtualWrapper\code\claude-insights\debugging-notes.md`

- [ ] **Step 1: Append only what transfers**

Candidates from this iteration:

- **A controlled `<select>` whose value matches no option lies.** React marks the first option selected, the state keeps the real value, and re-picking the displayed option fires no `change` event — so the form *looks* like one value and *submits* another.
- **A form's "did the user change it?" baseline must be a mount-time snapshot.** With refetch-on-focus, comparing against the live query data makes an untouched field look changed after someone else edits the record, and the save silently reverts their change. Options and read-only switches must come from the same snapshot.
- **A coverage gate in `addopts` fails every narrow pytest run.** A one-module CI smoke step needs `--no-cov`; the gate belongs to the full-suite job.
- **A whole-card link cannot host a CTA button.** Use a stretched link (`relative` card, CTA `::after` with `absolute inset-0`), a `role="group"` card named via `aria-labelledby` with a `useId()` id — never a text-derived id, since `aria-labelledby` splits on spaces.
- **`focusManager.setFocused(false/true)` in `act`** triggers a TanStack Query refetch in tests that cannot reach the `QueryClient`; reset it with `setFocused(undefined)`.

- [ ] **Step 2: Commit narrowly**

```bash
git -C D:/VirtualWrapper/code/claude-insights add projects/task-management-system.md debugging-notes.md
git -C D:/VirtualWrapper/code/claude-insights commit -m "docs: add task management system iteration 3 insights"
```

Other files in that repository carry unrelated modifications — stage only these two.
