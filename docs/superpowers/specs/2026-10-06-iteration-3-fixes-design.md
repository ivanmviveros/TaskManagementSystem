# Iteration 3 Fixes — Design Specification

**Date:** 2026-10-06
**Builds on:** [2026-10-06-refinement-iteration-2-design.md](2026-10-06-refinement-iteration-2-design.md)
**Branch:** `fix/iteration-3`, off `main` at `6e2c54d`
**Status:** approved

---

## 1. Scope

Four issues found after iteration 2 was merged and pushed. Each was traced to a root cause
before any fix was designed.

| # | Issue | Root cause |
|---|---|---|
| 1 | Deleting a task has no confirmation | Both entry points call `remove.mutateAsync` straight from the button: `TaskListPage` (table and card, via `runAction`) and `TaskDetailPage`. |
| 2 | Editing a completed task shows **Pending** in the status selector, yet the PATCH sends `COMPLETED` | `TaskForm` initialises `status` from the task, but the `<select>` only offers `EDITABLE_STATUSES` (Pending, In progress, Cancelled). A controlled select whose value matches no option *displays* the first option while the state keeps `COMPLETED`, and submit sends it. |
| 3 | Dashboard: no call-to-action buttons; the bottom row holds one lone card | Each `StatTile` is a whole-card `<Link>` with no visible affordance. Seven tiles in `grid-cols-2 lg:grid-cols-3` leave "Due in 7 days" alone on the last row at **both** breakpoints (3+3+1 and 2+2+2+1). |
| 4 | GitHub Actions `compat` job fails ([run 37559034429](https://github.com/ivanmviveros/TaskManagementSystem/actions/runs/37559034429/job/112591873156)) | `addopts` applies `--cov-fail-under=80` to **every** pytest run. `compat` stage 2 deliberately runs one module (`test_api_auth.py`, 14 tests) as a smoke test, so it measures 63.34% and exits 1. |

### 1.1 Issue 2 is worse than the report

The PATCH itself succeeds today: the serializer accepts `COMPLETED`, and `TaskService.update`
skips transition validation when the requested status equals the current one. The selector
is what lies. The real hazard is acting on that lie:

- On a **completed** task, "Pending" is displayed because React marks the first option
  selected when the value matches none. Re-picking that already-selected option fires no
  `change` event, so the state stays `COMPLETED` and a save still succeeds. But choosing
  **In progress** or **Cancelled** sends that status, and the API answers **409** —
  `TRANSITIONS[COMPLETED]` is empty. Every real choice the form offers is refused.
- On a **cancelled** task the selector shows the right value but offers Pending and In
  progress, both of which also 409.

Both terminal statuses are affected. Non-terminal ones are not: for `PENDING` and
`IN_PROGRESS`, `EDITABLE_STATUSES` happens to equal the current status plus its transitions.

### 1.2 Issue 4 predates iteration 2

Run 37559034429 is the repository's **first** CI run — iteration 1 was never pushed. The
gate has failed `compat` since iteration 1 enabled it (`7f19592`); this push merely surfaced
it. Reproduced locally with an identical 63.34% and exit 1, and `--no-cov` exits 0.

Stage 3 (`spectacular --validate`) never ran in CI, because stage 2 failed first. It was run
locally with the exact CI command and exits 0, so fixing stage 2 is expected to turn the whole
job green — but §7 verifies that in Actions rather than assuming it. Note that `--validate`
checks the generated document against the OpenAPI schema and does **not** fail on generator
warnings; only `--fail-on-warn` does.

---

## 2. Decision log

Continues from D37.

| # | Decision | Rationale |
|---|---|---|
| D38 | **Task deletion confirms through a dedicated `DeleteTaskDialog`, mirroring `DeleteUserDialog`.** | Two dialogs do not yet justify a generic `ConfirmDialog`; extracting one would also touch the users feature and its tests for no behavioural gain. |
| D39 | **The API reports `allowed_transitions` on the task detail; the SPA does not mirror `TRANSITIONS`.** | Same reasoning as `can_delete` (D27): a second copy of a business rule in TypeScript is how the UI and the API drift. `TRANSITIONS` stays the single source. |
| D40 | **The status field works from a snapshot taken when the form opens — `task.status` and `task.allowed_transitions`, captured once. Options, the read-only switch and the "did the user change it?" comparison all read that snapshot; `status` is sent only when it differs from the snapshot status.** | The PATCH then states only what the user did, and a terminal task offers no choice that the API would refuse. Comparing with the live `task.status` would be wrong: the detail query refetches (30 s `staleTime`, refetch on focus), so a status someone else changed while the form was open would make an untouched select look "changed" and silently undo their change. |
| D41 | **Dashboard cards are plain containers whose single "View tasks" CTA is a stretched link.** | A button inside a link is invalid HTML and breaks keyboard and screen-reader navigation. The CTA's `::after` covers the card, so the whole card stays clickable with exactly one link. |
| D42 | **"Due in 7 days" spans the full row at every breakpoint.** | The six cards before it divide evenly into both 2 and 3 columns, so a full-width last card leaves no breakpoint with a lone narrow one. Chosen by the project owner. |
| D43 | **`compat` stage 2 runs with `--no-cov`; the coverage gate stays in `addopts`.** | Stage 2 is a smoke test of one module, not a coverage measurement. Moving the gate out of `addopts` would break the README's promise that a local run and CI apply the same gate. |
| D44 | **The CI fix is verified in GitHub Actions by pushing the branch and watching the run with `gh`.** | Requested by the project owner. A local reproduction proves the mechanism; only Actions proves the job. |

---

## 3. Task delete confirmation (D38)

### 3.1 The dialog

`frontend/src/features/tasks/components/DeleteTaskDialog.tsx`, with the same structure and
classes as `DeleteUserDialog`:

```ts
interface DeleteTaskDialogProps {
  task: { title: string };
  error: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
```

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at its heading.
- Heading: **Delete "{title}"?**
- Body states what deletion does, as the users dialog does for deactivation: the task
  disappears from every list and from the dashboard; its record and history are kept for the
  audit trail; **there is no way to restore it from this application.** The last point is
  true — tasks are soft-deleted and no restore endpoint exists.
- `FormError` slot for a failed delete; Cancel and a danger **Delete** button, both disabled
  while `isDeleting`, the confirm label reading "Deleting…".

### 3.2 Wiring

| Page | Today | After |
|---|---|---|
| `TaskListPage` | `onDelete={(id) => void runAction(id, remove.mutateAsync)}` for table and cards | `onDelete` looks the task up in `data.results` by id **at click time** and stores the **task object** in `pendingDelete` (guarding the `undefined` that `find` can return), and clears any previous dialog error — as `UserListPage`'s `beginDelete` does. Storing the object rather than the id means a refetch while the dialog is open cannot make it disappear. Confirm runs the delete; success closes the dialog; failure shows its message inside the dialog and keeps it open. |
| `TaskDetailPage` | Delete runs `remove.mutateAsync` then navigates to `/tasks` | Delete opens the dialog. Confirm deletes, then navigates to `/tasks`; failure stays in the dialog. |

`TaskRowActions`, `TaskTable` and `TaskCard` keep their `onDelete(id)` signature, so no
component outside the two pages changes. The existing `can_delete` gating is untouched.

---

## 4. Status selector (D39, D40)

### 4.1 Backend

`TaskDetailSerializer` gains:

```python
# Reported, not re-derived — the can_delete reasoning (D27) applied to D19's
# transition table. COMPLETED never appears: it is reached only through the
# complete action, and TRANSITIONS never lists it as a target.
allowed_transitions = serializers.SerializerMethodField()

def get_allowed_transitions(self, task) -> list[str]:
    # TaskStatus declaration order, not alphabetical: sorted() would put
    # CANCELLED before IN_PROGRESS and the select would read oddly.
    allowed = TRANSITIONS[task.status]
    return [status for status in TaskStatus.values if status in allowed]
```

- Added to `Meta.fields` after `"status"`. Detail serializer only — list rows do not offer a
  status change.
- The `-> list[str]` hint is what lets drf-spectacular type the field. Without it the
  generator emits a warning — which `compat`'s `--validate` would **not** catch, but which
  breaks the README's "0 warnings" claim and fails `spectacular --fail-on-warn`. §7 runs that
  locally for this reason.
- `TRANSITIONS[task.status]` works for both a database-loaded `str` and an in-memory
  `TaskStatus` member, as `TaskService` already relies on.
- **Budgeted test change:** `test_detail_serializer_adds_the_detail_only_fields` in
  `apps/tasks/tests/test_serializers.py` asserts the serializer's **exact** field list, and
  must gain `allowed_transitions`.

### 4.2 Frontend

- `TaskDetail` in `features/tasks/types.ts` gains `allowed_transitions: TaskStatus[]`.
- `TaskForm`:
  - **One snapshot, taken when the form opens** (D40):

    ```ts
    const [initialStatus] = useState(task?.status);
    const [initialTransitions] = useState(task?.allowed_transitions ?? []);
    ```

    Everything about the status field reads this snapshot, and none of it changes when the
    detail query refetches. The form holds three statuses — the live `task.status`, the
    snapshot and the `status` state — and only the snapshot is a correct basis for each job:
    - **Options** are `initialStatus` plus `initialTransitions`, rendered in the fixed display
      order `STATUS_LABEL` already declares (Pending, In progress, Completed, Cancelled) — a
      display order, not a rule. Basing them on the `status` *state* would be a bug: picking
      In progress on a pending task would shrink the options to {In progress, Cancelled},
      dropping Pending so the change could not be undone. `EDITABLE_STATUSES` is deleted.
    - **Read-only when `initialTransitions` is empty:** instead of a select, the form shows the
      status (as a `StatusBadge`) with one line explaining that completed and cancelled tasks
      keep their status. The heading is plain text, not a `<label htmlFor="status">`, since
      there is no control for it to label. Basing this on the *live* task would be a bug: a
      refetch that made the task terminal after the user changed the select would remove the
      control while the changed value kept being sent and refused — with no way to revert it.
    - **Submit** includes `status` only when it differs from `initialStatus`:
      `...(isEdit && status !== initialStatus ? { status } : {})`.

    `TaskEditPage` mounts the form only after the task has loaded, so the snapshot always
    captures real values, and a background refetch does not remount it.
- **Budgeted test changes** in `TaskForm.test.tsx` — the only fixture typed as `TaskDetail`
  (`TaskEditPage` is the only edit-mode caller, and `msw-handlers.ts` has no task-detail
  default):
  - `DETAIL` (a pending task) gains `allowed_transitions: ["IN_PROGRESS", "CANCELLED"]`, so
    "never offers COMPLETED" still finds the Cancelled option. Terminal-status tests override
    it with `allowed_transitions: []`.
  - "surfaces a 409 invalid_status_transition" must **select In progress first**. Under D40
    an untouched form sends no `status`, so the test would still pass against its mocked 409
    while no longer modelling a real case.

The existing test "never offers COMPLETED in the status select" stays and keeps passing:
`COMPLETED` can only appear as the *current* status, which renders read-only.

---

## 5. Dashboard (D41, D42)

### 5.1 Header

"Dashboard" plus a primary **New task** button to `/tasks/new`, marked up exactly like the
task list's header (`<Link to="/tasks/new" className="ml-auto"><Button>New task</Button></Link>`).
Both dashboard roles — Supervisor and Operator — may create tasks, and the route guard
already admits both. The header renders in the loading and error states too, so creating a
task does not depend on stats loading.

### 5.2 Cards

`StatTile` stops being a link:

```
┌──────────────────────┐   relative, rounded, shadow; hover and focus-within raise it
│ Pending              │   label
│ 15                   │   value (accent colour unchanged)
│ [View tasks]         │   <Link> styled as a button; its ::after is absolute inset-0
└──────────────────────┘
```

- The CTA keeps today's `to` and `search` exactly, so every drill-through still carries the
  tile's full predicate — including the due-soon card's open-status filter.
- **Accessible name:** visible text "View tasks" plus a visually hidden suffix with the card's
  label, giving names like "View tasks — Overdue". Seven links named only "View tasks" would be
  indistinguishable in a screen reader's link list.
- **The card is a named group:** `role="group"` with `aria-labelledby` pointing at the label,
  so each card is addressable as `getByRole("group", { name: "Pending" })`. This is what the
  tests use to read a card's number (§5.4) — a stable handle, unlike `closest("div")`, which
  breaks the moment the wide card's label and value sit in a wrapper.
- `focus-within` shows the focus ring on the card, since the focused element is the link.
- The stretched `::after` would cover any other interactive element inside the card. The
  unused `children` prop is **removed**, so that constraint is enforced by the type rather
  than only by a comment.
- The card's `relative` is required, not decorative: without it the `::after` escapes the
  card and covers the page.
- `StatusDistributionBar` sits outside the grid and is unaffected.

### 5.3 Layout

`StatTile` takes a `wide` prop. The "Due in 7 days" card passes it, which adds `col-span-full`
and lays the label, value and CTA out in one row. The grid itself is unchanged
(`grid-cols-2 lg:grid-cols-3`).

| Breakpoint | Rows |
|---|---|
| < `lg` (2 columns) | 2 + 2 + 2, then "Due in 7 days" full width |
| ≥ `lg` (3 columns) | 3 + 3, then "Due in 7 days" full width |

### 5.4 Existing tests need changes

`StatsPage.test.tsx` finds tiles through a `tile(name)` helper over `getByRole("link")`, and
two of its assumptions break once the value moves out of the link:

- **Anchored patterns stop matching.** `/^pending/i`, `/^completed/i` and `/^cancelled/i` are
  anchored at the start, and the new names begin with "View tasks". Re-anchor them on the
  label suffix (e.g. `/— pending$/i`).
- **Value assertions fail.** "renders all six figures" asserts each number with
  `toHaveTextContent` on the link; the number now sits on the card, outside it. Value
  assertions move to the card's group (`getByRole("group", { name })`, §5.2); href assertions
  keep using the link. Note the first assertion in that test — the "10" on "All tasks" — calls
  `findByRole("link", …)` directly rather than through `tile()`, so it must be changed too.
- **"renders identically for a Supervisor and an Operator"** still passes, but it compares link
  text, which no longer contains the numbers. It must compare card text so it still proves
  what its name says.

The href and API-query assertions themselves are unchanged. The new "New task" link creates
no ambiguity: no existing pattern matches it.

---

## 6. CI `compat` job (D43)

`.github/workflows/ci.yml`, stage 2:

```yaml
      # Stage 2: the git-pinned simplejwt actually issues and verifies a token
      # on Django 6.0 — the single most load-bearing claim in D3. --no-cov: this
      # runs ONE module as a smoke test, and addopts' 80% gate is a whole-suite
      # measurement that belongs to the backend job.
      - name: Login round-trip against the cookie auth views
        run: uv run --directory backend pytest apps/users/tests/test_api_auth.py -q --no-cov
```

The `backend` job, `scripts/run-backend-tests.sh` and plain local runs keep the gate.

README, "The `compat` CI job" section, stage 2 gains one sentence: it runs without coverage
because it is a smoke test of one module, and the gate is the `backend` job's responsibility.
The "Running the checks" section's claim that "a local run and CI apply the same gate" is
qualified to say the gate is applied by the full-suite runs — the `backend` job and the
pre-push script — and not by `compat`'s smoke step.

---

## 7. Delivery and verification in Actions (D44)

1. All work lands on `fix/iteration-3`.
2. Before pushing, the exact stage-2 and stage-3 commands are run locally and must exit 0,
   plus `manage.py spectacular --fail-on-warn` — the check `--validate` does not make (§1.2).
3. `git push -u origin fix/iteration-3`. The workflow triggers on `push` to any branch, so
   this runs all four jobs. **The push needs the project owner's approval** — pushes have
   been blocked by permission settings so far.
4. `gh run list --branch fix/iteration-3 --limit 1` to find the run, then
   `gh run watch <id> --exit-status`.
5. **Done means all four jobs green** — `lint`, `compat`, `backend`, `frontend` — not only
   `compat`. A failure is read with `gh run view --job <id> --log-failed` and fixed on the
   branch, then re-pushed.
6. Merging to `main` is the project owner's call, as before.

---

## 8. Testing

| Area | Test |
|---|---|
| Delete, list page | Delete opens the dialog with the task's title; Cancel closes it and sends no `DELETE` |
| Delete, list page | Confirm sends exactly one `DELETE`, then closes the dialog |
| Delete, list page | A failed `DELETE` shows its message inside the dialog, which stays open |
| Delete, detail page | Confirm deletes and navigates to `/tasks`; Cancel stays on the page |
| Delete, detail page | A failed `DELETE` shows its message inside the dialog, which stays open |
| Status, backend | `allowed_transitions` for each of the four statuses equals `TRANSITIONS[status]` in `TaskStatus` declaration order; the detail field list includes it. (A `COMPLETED` factory task needs `completed_at`, or the check constraint rejects it.) |
| Status, form | A completed task shows its status read-only, with no status combobox |
| Status, form | A cancelled task likewise |
| Status, form | Saving a completed task sends a PATCH **without** `status` |
| Status, form | A pending task offers Pending, In progress and Cancelled, and changing it sends `status` |
| Status, form | Saving a pending task without touching the status sends no `status` |
| Status, form | After changing a pending task to In progress, Pending is still offered — so the change can be undone (D40) |
| Status, form | If the task's status changes underneath an open, untouched form (a refetch), saving still sends no `status` (D40) |
| Dashboard | Each card has a "View tasks" link with the same href as before |
| Dashboard | "New task" links to `/tasks/new` |
| Dashboard | The header and "New task" render in the loading and error states too |
| Dashboard | Each card shows its number (asserted on the card, §5.4) |
| Dashboard | The due-soon card carries `col-span-full` |
| CI | Stage 2 and stage 3 exit 0 locally with the CI commands; all four jobs green in Actions |

**Triggering the refetch in the D40 test.** `renderApp` does not expose its `QueryClient`,
and the test client uses the default `staleTime` of 0, so a refetch is triggered with
`focusManager.setFocused(false)` then `setFocused(true)` from `@tanstack/react-query`. The
second `GET` returns `IN_PROGRESS`, so an implementation comparing against the live
`task.status` would send `PENDING` and fail. The test asserts the `GET` was hit **twice**
before saving: under the correct design the UI does not change on refetch, so without that
count the test could pass without the refetch ever happening.

**Query scoping in the delete tests.** jsdom renders both the table and the cards, so each
row's "Delete <title>" button appears twice, and the dialog's own "Delete" button also matches
`/^delete/i` — as does the detail page's Delete button. Dialog interactions are scoped with
`within(screen.getByRole("dialog"))`, row buttons with `within(table)`. With
`onUnhandledRequest: "error"`, every delete test registers an `http.delete` handler, which
is also how "sends exactly one DELETE" and "sends no DELETE" are counted.

jsdom applies no CSS, so `col-span-full` is asserted as a class rather than as a layout. The
dashboard's visual result — the stretched link, the full-width row — is checked in a browser
before the branch is pushed, at a width below and above `lg`.

---

## 9. Out of scope

- A generic `ConfirmDialog` (D38).
- Focus trapping and Escape-to-close for dialogs. `DeleteTaskDialog` matches
  `DeleteUserDialog`; improving both belongs together.
- The codebase's existing `<Link><Button>` nesting in page headers. The dashboard header
  follows it for consistency; the cards avoid it because the CTA must itself be the link.
- Replacing the client-side `isOpen` checks in `TaskRowActions` and `TaskDetailPage` with
  `allowed_transitions`.
- `TaskEditPage` checks `isError` before `data`. In TanStack Query v5 a failed *background*
  refetch sets `isError` while keeping `data`, so a transient failure on a focus refetch
  unmounts the form and discards the user's unsaved edits. Pre-existing and independent of
  these fixes, but D40 is reasoned around those refetches, so it is recorded here.
- Whether completed tasks should be editable at all. Today the API allows editing their
  title, description, due date and assignee; this iteration leaves that unchanged.
