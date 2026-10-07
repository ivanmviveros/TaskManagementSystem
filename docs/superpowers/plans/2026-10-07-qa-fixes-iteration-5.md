# Iteration 5: QA Report Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all fourteen findings (F1–F14) of [`docs/qa/2026-10-07-frontend-qa-report.md`](../../qa/2026-10-07-frontend-qa-report.md), as designed in [2026-10-07-qa-fixes-iteration-5-design.md](../specs/2026-10-07-qa-fixes-iteration-5-design.md) (decisions D66–D78).

**Architecture:** There is one backend change: a self-action guard. It is split across the existing permission and service layers, following §7.3. Everything else is frontend:

- **Sorting:** a shared sort model (`features/tasks/sorting.ts`).
- **Navigation:** list state carried in router history state, a shared `NotFoundPanel`, and a `ShellLayout` extracted from `AppShell`.
- **Bootstrap:** the router/auth sync effect becomes one hook, shared with the test harness.
- **Forms:** a focus-on-error hook, plus small display fixes.

No new dependencies.

**Tech Stack:** Django 6 · DRF · pytest · React 19 · TypeScript 6 · TanStack Router + Query v5 · Tailwind v3 · Vitest + RTL + MSW · Playwright MCP (re-test)

---

## Execution Notes

**Branch:** `fix/iteration-5`. It already exists and holds the spec. Never commit to `main`.

**Backend, one module:**

```bash
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest <path> -q --no-cov
```

- `-e DJANGO_SETTINGS_MODULE=…` is load-bearing: the container's `.env` names the local settings, and pytest-django ranks that variable above `pyproject.toml`.
- `--no-cov` is required on single-module runs, because `addopts` carries the 80 % gate.
- **Full suite:** `bash scripts/run-backend-tests.sh`.

**Frontend, one file:**

```bash
npm run --prefix frontend test -- <path-fragment>
```

The full suite is `npm run --prefix frontend test`.

**Typecheck and lint:** `npm run --prefix frontend typecheck` and `npm run --prefix frontend lint`. The lint baseline is **5 warnings**; a task must not add one.

**Testing conventions**, all already in the suite:

- jsdom applies no CSS, so the table rows **and** the cards are both in the DOM. Scope row queries with `within(table)` or `within(card)`, and dialog buttons with `within(screen.getByRole("dialog"))`.
- `onUnhandledRequest: "error"` is on, so every request a test causes needs a handler. The defaults are in `src/test/msw-handlers.ts`: `/users/me/` (a Supervisor), `/users/`, `/tasks/`, `/tasks/stats/` and `/auth/refresh/`.
- `src/test/setup.ts` **fails any test that logs a console error or warning**, unless the test calls `allowConsole(...)`.
- `renderApp(path)` mounts the real router and providers, and returns `{ router }`, so a test can read `router.state.location`.

**Commit after every task.** Each task leaves both suites, typecheck and lint green. Commit messages end with the attribution line:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**One Bash command per call**, no `cd X && …`. Use `git -C`, `npm run --prefix frontend`, and `uv run --directory backend`.

---

## File Structure

| File | Change | Responsibility | Task |
|---|---|---|---|
| `backend/apps/core/permissions/classes.py` | modify | `IsNotSelf` object permission | 1 |
| `backend/apps/users/views.py` | modify | `get_permissions` adds `IsNotSelf` on `destroy` | 1 |
| `backend/apps/users/services.py` | modify | `CannotChangeOwnAccess` + guard in `update` | 1 |
| `backend/apps/users/tests/test_services.py`, `test_api_users.py`, `backend/apps/core/tests/test_exceptions.py` | modify | F1 tests | 1 |
| `frontend/src/features/users/components/UserTable.tsx`, `UserCard.tsx` | modify | hide Deactivate on own row; later, role labels | 2, 13 |
| `frontend/src/features/users/components/UserForm.tsx` | modify | own account: read-only role/active; focus on error | 2, 10, 13 |
| `frontend/src/features/users/UserListPage.tsx` | modify | pass `currentUserId`; role labels | 2, 13 |
| `frontend/src/app/useRouterAuthSync.ts` | **create** | the router/auth sync effect, guarded while loading | 3 |
| `frontend/src/app/providers.tsx`, `frontend/src/test/render-app.tsx` | modify | use the hook | 3 |
| `frontend/src/features/tasks/sorting.ts` (+ `sorting.test.ts`) | **create** | orderings, default, toggle, whitelist, options | 4 |
| `frontend/src/features/tasks/components/TaskTable.tsx` | modify | header sort state; list state on links; due-date format | 4, 7, 12 |
| `frontend/src/features/tasks/types.ts` | modify | `TASK_STATUSES` | 5 |
| `frontend/src/app/search-params.ts` (+ test) | modify | whitelist `status` and `ordering` | 5 |
| `frontend/src/features/tasks/components/TaskFilters.tsx` | modify | use `TASK_STATUSES`; inverted-range message | 5, 11 |
| `frontend/src/features/tasks/components/TaskSortSelect.tsx` | **create** | the below-`lg` sort control | 6 |
| `frontend/src/features/tasks/TaskListPage.tsx` | modify | sort select, `lg` breakpoint, list state on links | 6, 7 |
| `frontend/src/features/tasks/components/TaskCard.tsx` | modify | list state on link; due-date format | 7, 12 |
| `frontend/src/app/history-state.ts` | **create** | `HistoryState.tasksSearch` augmentation | 7 |
| `frontend/src/features/tasks/hooks/useTasksBackSearch.ts` | **create** | the validated list search to return to | 7 |
| `frontend/src/features/tasks/TaskDetailPage.tsx` | modify | back/delete/edit carry list state; not-found; due date | 7, 8, 12 |
| `frontend/src/features/tasks/TaskFormPage.tsx` | modify | forward list state; not-found on edit | 7, 8 |
| `frontend/src/components/NotFoundPanel.tsx` | **create** | the shared not-found panel | 8 |
| `frontend/src/features/tasks/components/TaskNotFound.tsx` | **create** | the task-specific panel | 8 |
| `frontend/src/features/users/UserFormPage.tsx` | modify | not-found on user edit | 8 |
| `frontend/src/app/layout/ShellLayout.tsx` | **create** | header + main, extracted from `AppShell` | 8, 9 |
| `frontend/src/app/layout/AppShell.tsx` | modify | `<ShellLayout><Outlet/></ShellLayout>` | 8 |
| `frontend/src/app/layout/AppNotFound.tsx` | **create** | the router's `defaultNotFoundComponent` | 8 |
| `frontend/src/app/router.tsx` | modify | `notFoundMode: "root"`, `defaultNotFoundComponent` | 8 |
| `frontend/src/components/useFocusFirstError.ts` | **create** | focus the first error after a failed submit | 10 |
| `frontend/src/components/FormError.tsx` | modify | `tabIndex={-1}` | 10 |
| `frontend/src/features/auth/LoginPage.tsx`, `features/tasks/components/TaskForm.tsx` | modify | use the focus hook | 10 |
| `frontend/src/features/tasks/components/DeleteTaskDialog.tsx`, `features/users/components/DeleteUserDialog.tsx` | modify (conditional) | focus the dialog's error | 10 |
| `frontend/src/lib/dates.ts` (+ `dates.test.ts`) | **create** | `formatDueDate` | 12 |
| `frontend/src/features/auth/types.ts` | modify | `ROLE_LABEL` beside `ROLES` | 13 |
| `README.md` | modify | D66–D78 section, accepted-risk row, GenAI record | 14 |
| `docs/qa/2026-10-07-frontend-qa-report.md` (+ screenshots) | modify | "Re-test (iteration 5)" | 15 |

---

## Task 1: F1 backend — an Admin cannot act on their own account (spec §3.1–§3.3, D66)

**Files:**
- Modify: `backend/apps/core/permissions/classes.py` (append after `IsTaskCreator`)
- Modify: `backend/apps/users/views.py` (imports; new `get_permissions` on `UserViewSet`)
- Modify: `backend/apps/users/services.py` (new exception; guard at the top of `update`)
- Test: `backend/apps/users/tests/test_services.py`, `backend/apps/users/tests/test_api_users.py`, `backend/apps/core/tests/test_exceptions.py`

- [ ] **Step 1: Write the failing service tests**

Append to `backend/apps/users/tests/test_services.py`, and add `CannotChangeOwnAccess` to its `from apps.users.services import …` line:

```python
def test_update_refuses_an_actor_changing_their_own_role():
    me = User(email="me@example.com", role=Role.ADMIN, is_active=True)
    with pytest.raises(CannotChangeOwnAccess) as caught:
        service([me]).update(user=me, data=UserUpdateInput(role=str(Role.OPERATOR)), actor=me)
    assert caught.value.default_code == "cannot_change_own_access"
    assert me.role == Role.ADMIN


def test_update_refuses_an_actor_deactivating_themselves():
    me = User(email="me@example.com", role=Role.ADMIN, is_active=True)
    with pytest.raises(CannotChangeOwnAccess):
        service([me]).update(user=me, data=UserUpdateInput(is_active=False), actor=me)
    assert me.is_active is True


def test_update_lets_an_actor_save_their_own_form_unchanged():
    """UserEditPage always sends role and is_active (D66): unchanged values must pass."""
    me = User(email="me@example.com", first_name="Old", role=Role.ADMIN, is_active=True)
    updated = service([me]).update(
        user=me,
        data=UserUpdateInput(
            first_name="New", role=str(Role.ADMIN), is_active=True, password="a-new-password-1"
        ),
        actor=me,
    )
    assert updated.first_name == "New"
    assert updated.check_password("a-new-password-1")


def test_update_still_lets_an_admin_demote_and_deactivate_someone_else():
    other = User(email="other@example.com", role=Role.ADMIN, is_active=True)
    actor = User(email="me@example.com", role=Role.ADMIN)
    updated = service([other]).update(
        user=other,
        data=UserUpdateInput(role=str(Role.OPERATOR), is_active=False),
        actor=actor,
    )
    assert updated.role == Role.OPERATOR
    assert updated.is_active is False
```

(`User(...)` gets its UUIDv7 `pk` on construction, so two instances never share a pk. The self cases pass the **same** object as `user` and `actor`.)

- [ ] **Step 2: Write the failing API and permission tests**

Append to `backend/apps/users/tests/test_api_users.py`:

```python
def test_admin_cannot_delete_their_own_account(admin_client, admin):
    response = admin_client.delete(f"{URL}{admin.pk}/")
    assert response.status_code == 403
    assert response.data["code"] == "cannot_delete_self"
    assert User.objects.filter(pk=admin.pk).exists()


def test_admin_cannot_demote_themselves(admin_client, admin):
    response = admin_client.patch(f"{URL}{admin.pk}/", {"role": Role.OPERATOR}, format="json")
    assert response.status_code == 400
    assert response.data["code"] == "cannot_change_own_access"
    admin.refresh_from_db()
    assert admin.role == Role.ADMIN


def test_admin_cannot_deactivate_themselves(admin_client, admin):
    response = admin_client.patch(f"{URL}{admin.pk}/", {"is_active": False}, format="json")
    assert response.status_code == 400
    assert response.data["code"] == "cannot_change_own_access"
    admin.refresh_from_db()
    assert admin.is_active is True


def test_admin_can_save_their_own_edit_form_unchanged(admin_client, admin):
    response = admin_client.patch(
        f"{URL}{admin.pk}/",
        {"first_name": "Renamed", "role": Role.ADMIN, "is_active": True},
        format="json",
    )
    assert response.status_code == 200
    admin.refresh_from_db()
    assert admin.first_name == "Renamed"
```

Append to `backend/apps/core/tests/test_exceptions.py`. Add `import pytest`, `from types import SimpleNamespace` and `from apps.core.permissions.classes import IsNotSelf` to its imports:

```python
def test_is_not_self_refuses_only_the_actors_own_row():
    me, other = SimpleNamespace(pk=1), SimpleNamespace(pk=2)
    request = SimpleNamespace(user=me)
    assert IsNotSelf().has_object_permission(request, None, other) is True
    with pytest.raises(PermissionDenied) as caught:
        IsNotSelf().has_object_permission(request, None, me)
    assert caught.value.get_codes() == "cannot_delete_self"
```

(Deleting **another** user is already covered by `test_admin_delete_is_a_soft_delete`.)

- [ ] **Step 3: Run them to verify they fail**

```bash
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest apps/users/tests/test_services.py apps/users/tests/test_api_users.py apps/core/tests/test_exceptions.py -q --no-cov
```

Expected: collection errors (`ImportError: cannot import name 'CannotChangeOwnAccess'` / `'IsNotSelf'`).

- [ ] **Step 4: Implement `IsNotSelf`**

Append to `backend/apps/core/permissions/classes.py`:

```python
class IsNotSelf(BasePermission):
    """D66: an Admin may not delete their own account.

    Object-level, like IsTaskCreator: the row is visible and readable, but this
    action on it is refused. Without it, one click leaves an Admin locked out,
    and D20 provides no restore endpoint.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        if obj.pk != request.user.pk:
            return True
        # RAISED, not returned: returning False yields DRF's generic
        # permission_denied code, and the error contract names this one.
        raise PermissionDenied(
            detail="You cannot delete your own account.",
            code="cannot_delete_self",
        )
```

Update the module docstring's first line to name both classes: `matrix; IsTaskCreator and IsNotSelf answer the object-level rules."""`.

- [ ] **Step 5: Wire it into `UserViewSet`**

In `backend/apps/users/views.py`, change the import to `from apps.core.permissions.classes import IsNotSelf, RolePermission`. Add this method to `UserViewSet`, directly after `get_queryset`:

```python
    def get_permissions(self):
        # D66, scoped to destroy as TaskViewSet scopes IsTaskCreator: an Admin may
        # still read and edit their own account. The service refuses the edits
        # that would lock them out.
        if self.action == "destroy":
            return [*super().get_permissions(), IsNotSelf()]
        return super().get_permissions()
```

- [ ] **Step 6: Implement the service guard**

In `backend/apps/users/services.py`, add after `EmailAlreadyInUse`:

```python
class CannotChangeOwnAccess(ApplicationError):
    """D66: a field-level refusal, so 400 like assignee_immutable (spec §8.7)."""

    default_detail = "You cannot change your own role or deactivate your own account."
    default_code = "cannot_change_own_access"
    status_code = 400
```

In `UserService.update`, insert this directly after the existing `fields = data.model_fields_set` line, before `changed: list[str] = []`:

```python
        # D66. Compared with the current values, not tested for presence: the edit
        # page always sends role and is_active, and saving one's own name with
        # them unchanged must keep working.
        if user.pk == actor.pk and (
            ("role" in fields and data.role != user.role)
            or ("is_active" in fields and data.is_active is False)
        ):
            raise CannotChangeOwnAccess
```

- [ ] **Step 7: Run the tests to verify they pass**

Same command as Step 3. Expected: all pass.

- [ ] **Step 8: Full backend gates**

```bash
bash scripts/run-backend-tests.sh
```

Expected: all pass, `Total coverage: 100.00%`.

```bash
uv run --directory backend ruff check .
```

```bash
uv run --directory backend ruff format --check .
```

```bash
uv run --directory backend mypy
```

Expected: clean.

- If `ruff check` reports import order (`I001`, from the new `import pytest` / `SimpleNamespace` / `IsNotSelf` imports in `test_exceptions.py`), run `uv run --directory backend ruff check --fix .`.
- If `ruff format --check` lists a file, run `uv run --directory backend ruff format .`.

Re-check after either.

- [ ] **Step 9: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add backend/apps/core/permissions/classes.py backend/apps/users/views.py backend/apps/users/services.py backend/apps/users/tests/test_services.py backend/apps/users/tests/test_api_users.py backend/apps/core/tests/test_exceptions.py
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: refuse an Admin deleting, demoting or deactivating their own account (D66)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: F1 UI — no self-actions offered (spec §3.4)

**Files:**
- Modify: `frontend/src/features/users/components/UserTable.tsx`
- Modify: `frontend/src/features/users/components/UserCard.tsx`
- Modify: `frontend/src/features/users/UserListPage.tsx`
- Modify: `frontend/src/features/users/components/UserForm.tsx`
- Test: `frontend/src/features/users/UserListPage.test.tsx`, `frontend/src/features/users/UserForm.test.tsx`

- [ ] **Step 1: Write the failing list test**

In `UserListPage.test.tsx`, add inside `describe("UserListPage", …)`. The signed-in user is the file's `ADMIN` fixture (see its `beforeEach`):

```tsx
  it("never offers the signed-in Admin a Deactivate for their own account (D66)", async () => {
    usersRespondWith([ADMIN, operator()]);
    await renderApp("/users");
    const table = await screen.findByRole("table");
    expect(
      within(table).queryByRole("button", { name: /deactivate admin@demo.local/i }),
    ).not.toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: /deactivate operator@demo.local/i }),
    ).toBeInTheDocument();
    const ownCard = screen
      .getAllByRole("article")
      .find((card) => within(card).queryByText("admin@demo.local") !== null);
    expect(ownCard).toBeDefined();
    expect(within(ownCard as HTMLElement).queryByRole("button", { name: /deactivate/i })).toBeNull();
    // Edit stays: an Admin may still rename themselves.
    expect(within(table).getByRole("link", { name: /edit admin@demo.local/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Write the failing form tests**

In `UserForm.test.tsx`, add inside `describe("UserForm", …)`:

```tsx
  it("shows an Admin's own role read-only, with no Active control (D66)", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/users/${ADMIN.id}/`, () => HttpResponse.json(ADMIN)),
      http.patch(`${BASE}/users/${ADMIN.id}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ADMIN);
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp(`/users/${ADMIN.id}`);
    expect(
      await screen.findByText(/you can't change your own role or deactivate your own account/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^role$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /active/i })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(body).not.toBeNull());
    // Unchanged values, which the API accepts (D66).
    expect(body).toMatchObject({ role: "ADMIN", is_active: true });
  });

  it("still offers role and Active when editing someone else", async () => {
    server.use(http.get(`${BASE}/users/${TARGET.id}/`, () => HttpResponse.json(TARGET)));
    await renderApp(`/users/${TARGET.id}`);
    expect(await screen.findByLabelText(/^role$/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /active/i })).toBeInTheDocument();
  });

  it("shows a cannot_change_own_access refusal as a form-level message", async () => {
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () => HttpResponse.json(TARGET)),
      http.patch(`${BASE}/users/${TARGET.id}/`, () =>
        HttpResponse.json(
          {
            detail: "You cannot change your own role or deactivate your own account.",
            code: "cannot_change_own_access",
            errors: null,
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot change your own role/i);
  });
```

The third test already passes, because any non-field code reaches the alert. It pins the contract for the new code. The second guards against hiding the controls for everyone.

- [ ] **Step 3: Run them to verify the new behaviour fails**

```bash
npm run --prefix frontend test -- src/features/users
```

Expected: the own-row and own-form tests FAIL (Deactivate found; Role select found). The others pass.

- [ ] **Step 4: Hide Deactivate on the actor's own row**

`UserTable.tsx`: add `currentUserId?: string;` to `UserTableProps`, destructure it, and wrap the Deactivate `Button` in `{user.id !== currentUserId && ( … )}`. Add a comment above it:

```tsx
                {/* D66, the UX mirror of IsNotSelf: never offer a refusal. */}
```

`UserCard.tsx`: the same prop (`currentUserId?: string`) and the same condition around its Deactivate `Button`.

`UserListPage.tsx`: add `import { useAuth } from "../auth/hooks/useAuth";`, then `const { user: currentUser } = useAuth();` at the top of the component. Pass `currentUserId={currentUser?.id}` to `<UserTable …>` and to each `<UserCard …>`.

- [ ] **Step 5: Read-only role and Active on the actor's own form**

In `UserForm.tsx`:

1. Add `import { useAuth } from "../../auth/hooks/useAuth";`.
2. After `const isEdit = user !== undefined;`, add:

```tsx
  const { user: currentUser } = useAuth();
  // D66: an Admin's own role and active flag are not theirs to change. The
  // values are still submitted, unchanged, which the API accepts.
  const isSelf = user !== undefined && user.id === currentUser?.id;
```

3. Replace the Role block, the `<div className="mb-4">` holding `<label htmlFor="role">` and its `<select>`, with:

```tsx
      {isSelf ? (
        <div className="mb-4">
          {/* Plain text, not a <label>: there is no control to label. */}
          <p className="mb-1 text-sm font-medium text-slate-700">Role</p>
          <p className="text-sm text-slate-900">{ROLE_LABEL[role]}</p>
          <p className="mt-1 text-sm text-slate-500">
            You can&apos;t change your own role or deactivate your own account.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-slate-700">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
      )}
```

4. Change `{isEdit && (` around the Active checkbox to `{isEdit && !isSelf && (`.

The test regex `/you can't change your own role/i` uses a straight apostrophe, and `&apos;` renders as one.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/users
```

Expected: all pass.

- [ ] **Step 7: Typecheck, lint, full suite**

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

```bash
npm run --prefix frontend test
```

Expected: clean typecheck, 5 lint warnings (unchanged), all tests pass.

- [ ] **Step 8: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/features/users
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: never offer an Admin a role change or deactivation of their own account (D66)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: F11 — no unjudged route load while auth is loading (spec §5.5, D74)

**Files:**
- Create: `frontend/src/app/useRouterAuthSync.ts`
- Modify: `frontend/src/app/providers.tsx` (the `useEffect` in `RoutedApp`)
- Modify: `frontend/src/test/render-app.tsx` (the `useEffect` in `AppAtPath`)
- Test: `frontend/src/features/auth/auth-routing.test.tsx`

- [ ] **Step 1: Write the failing test**

In `auth-routing.test.tsx`, inside `describe("session bootstrap requests", …)` (which records every mocked response into `requests`), add:

```tsx
  it.each(["/dashboard", "/tasks", "/users"])(
    "loads no page data for an anonymous deep link to %s — only the refresh (D74)",
    async (path) => {
      server.use(
        http.get(ME, () => HttpResponse.json({ detail: "x", code: "x" }, { status: 401 })),
        http.post(`${BASE}/auth/refresh/`, () =>
          HttpResponse.json(
            { detail: "no cookie", code: "refresh_cookie_missing" },
            { status: 401 },
          ),
        ),
      );
      await renderApp(path);
      expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
      expect(requests).toEqual(["POST /api/v1/auth/refresh/"]);
    },
  );
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run --prefix frontend test -- src/features/auth/auth-routing
```

Expected: FAIL. `requests` also contains the page's query, e.g. `"GET /api/v1/tasks/stats/"` for `/dashboard`.

**If it unexpectedly passes,** stop. The hypothesis in spec §1 would then be wrong for the test environment, so report back instead of continuing.

- [ ] **Step 3: Create the hook**

`frontend/src/app/useRouterAuthSync.ts`:

```ts
import { useEffect } from "react";

import type { AuthState } from "../features/auth/AuthContext";
import type { AppRouter } from "./router";

/**
 * Re-runs the route guards whenever auth changes: updating the router's
 * context does NOT re-run beforeLoad on its own. Shared by RoutedApp and the
 * test harness, so the tests exercise this exact code (D74).
 *
 * Its own .ts module, not an export of providers.tsx: react/only-export-components
 * would warn on a hook exported from a component file.
 */
export function useRouterAuthSync(router: AppRouter, auth: AuthState): void {
  useEffect(() => {
    // invalidate() LOADS (router-core), and while auth is loading guard() returns
    // early — so a load now would commit the page's matches unjudged, and the page
    // would mount and fetch before the redirect. RouterProvider's first load uses
    // the settled context.
    if (auth.isLoading) return;
    void router.invalidate();
  }, [router, auth.user, auth.isLoading]);
}
```

- [ ] **Step 4: Use it in `RoutedApp`**

In `frontend/src/app/providers.tsx`:

- Replace the whole `useEffect(() => { void router.invalidate(); }, [router, auth.user, auth.isLoading]);` block, together with its comment, with `useRouterAuthSync(router, auth);`.
- Add `import { useRouterAuthSync } from "./useRouterAuthSync";`.
- Change `import { useEffect, useMemo, useState } from "react";` to `import { useMemo, useState } from "react";`.

- [ ] **Step 5: Use it in the test harness**

In `frontend/src/test/render-app.tsx`:

- Replace the `useEffect` block in `AppAtPath` (the one commented "Mirrors RoutedApp") with `useRouterAuthSync(router, auth);`.
- Add `import { useRouterAuthSync } from "../app/useRouterAuthSync";`.
- Change `import { useEffect, useState } from "react";` to `import { useState } from "react";`.
- Change the docstring's "Mirrors RoutedApp in app/providers.tsx" to "Like RoutedApp in app/providers.tsx, and sharing its useRouterAuthSync".

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm run --prefix frontend test -- src/features/auth/auth-routing
```

Expected: all pass, including the three new cases.

- [ ] **Step 7: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 8: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/app/useRouterAuthSync.ts frontend/src/app/providers.tsx frontend/src/test/render-app.tsx frontend/src/features/auth/auth-routing.test.tsx
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: do not load routes while auth is still loading (D74)" -m "An anonymous deep link mounted the page and fetched its data before the guard redirected. The test harness copied the effect, so it now shares the hook." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: F6 — one sort model, and the table shows its sort state (spec §4.1–§4.2, D67, D68)

**Files:**
- Create: `frontend/src/features/tasks/sorting.ts`
- Create: `frontend/src/features/tasks/sorting.test.ts`
- Modify: `frontend/src/features/tasks/components/TaskTable.tsx` (`SORTABLE`, `nextOrdering`, the header map, the `onOrderingChange` type)
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing unit tests**

`frontend/src/features/tasks/sorting.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORDERING,
  SORT_OPTIONS,
  isOrdering,
  nextOrdering,
  parseOrdering,
} from "./sorting";

describe("parseOrdering", () => {
  it("resolves no ordering to the API default, newest first", () => {
    expect(DEFAULT_ORDERING).toBe("-created_at");
    expect(parseOrdering(undefined)).toEqual({ field: "created_at", direction: "descending" });
  });

  it.each([
    ["due_date", "due_date", "ascending"],
    ["-due_date", "due_date", "descending"],
    ["status", "status", "ascending"],
    ["created_at", "created_at", "ascending"],
  ])("reads %s", (ordering, field, direction) => {
    expect(parseOrdering(ordering)).toEqual({ field, direction });
  });

  it("treats an unknown ordering as the default", () => {
    expect(parseOrdering("title")).toEqual({ field: "created_at", direction: "descending" });
  });
});

describe("nextOrdering", () => {
  it("starts an inactive column ascending", () => {
    expect(nextOrdering(undefined, "due_date")).toBe("due_date");
    expect(nextOrdering("-status", "due_date")).toBe("due_date");
  });

  it("flips the active column", () => {
    expect(nextOrdering("due_date", "due_date")).toBe("-due_date");
    expect(nextOrdering("-due_date", "due_date")).toBe("due_date");
  });

  it("flips the default: the first click on Created is ascending", () => {
    expect(nextOrdering(undefined, "created_at")).toBe("created_at");
  });

  it("writes no ordering when the result is the default, so the URL stays canonical (D48)", () => {
    expect(nextOrdering("created_at", "created_at")).toBeUndefined();
  });
});

describe("isOrdering", () => {
  it.each(["due_date", "-due_date", "status", "-status", "created_at", "-created_at"])(
    "accepts %s",
    (value) => expect(isOrdering(value)).toBe(true),
  );

  it.each(["title", "-title", "", "due_date,status", 3, null, undefined])("rejects %j", (value) =>
    expect(isOrdering(value)).toBe(false),
  );
});

describe("SORT_OPTIONS", () => {
  it("offers every ordering exactly once, default first", () => {
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual([
      "-created_at",
      "created_at",
      "due_date",
      "-due_date",
      "status",
      "-status",
    ]);
  });
});
```

- [ ] **Step 2: Write the failing page tests**

In `TaskListPage.test.tsx`, append a new top-level `describe`:

```tsx
describe("sort state in the table header (F6)", () => {
  it("marks the default order — Created, descending — when the URL names none", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /created/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(within(table).getByRole("columnheader", { name: /due date/i })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(within(table).getByRole("columnheader", { name: /^title$/i })).not.toHaveAttribute(
      "aria-sort",
    );
  });

  it("shows the new column and direction after a click, and names the next action", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("table")).getByRole("button", {
        name: /^due date\. sort ascending$/i,
      }),
    );
    await waitFor(() => expect(lastQuery().get("ordering")).toBe("due_date"));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /due date/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(
      within(table).getByRole("button", { name: /^due date, sorted ascending\. sort descending$/i }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /created/i })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("returns to a URL with no ordering when Created is clicked back to newest first", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    const { router } = await renderApp("/tasks");
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("table")).getByRole("button", {
        name: /^created, sorted descending/i,
      }),
    );
    await waitFor(() => expect(router.state.location.search.ordering).toBe("created_at"));
    await user.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: /^created, sorted ascending/i,
      }),
    );
    await waitFor(() => expect(router.state.location.search.ordering).toBeUndefined());
    expect(router.state.location.href).not.toContain("ordering");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/features/tasks/sorting src/features/tasks/TaskListPage
```

Expected: `sorting.test.ts` fails to import `./sorting`, and the three new page tests fail (no `aria-sort`; old button names).

- [ ] **Step 4: Create the sort model**

`frontend/src/features/tasks/sorting.ts`:

```ts
/**
 * The task list's one sort model (D67). The table header, the below-lg select
 * and URL validation all read this, so they cannot disagree about which
 * orderings exist or what "no ordering" means.
 */

export const SORT_FIELDS = [
  { field: "due_date", label: "Due date" },
  { field: "status", label: "Status" },
  { field: "created_at", label: "Created" },
] as const;

export type SortField = (typeof SORT_FIELDS)[number]["field"];
export type SortDirection = "ascending" | "descending";

/** The API's own default (spec §8.3), so "no parameter" is shown as what it is. */
export const DEFAULT_ORDERING = "-created_at";

/** The below-lg select's options, in display order, default first. */
export const SORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date, earliest first" },
  { value: "-due_date", label: "Due date, latest first" },
  { value: "status", label: "Status, A–Z" },
  { value: "-status", label: "Status, Z–A" },
];

const ORDERINGS: readonly string[] = SORT_FIELDS.flatMap(({ field }) => [field, `-${field}`]);

/** The six values the UI writes; anything else is dropped by validateSearch (D73). */
export function isOrdering(value: unknown): value is string {
  return typeof value === "string" && ORDERINGS.includes(value);
}

/** undefined (or anything unknown) resolves to the default, so it is displayed too. */
export function parseOrdering(ordering: string | undefined): {
  field: SortField;
  direction: SortDirection;
} {
  const resolved = isOrdering(ordering) ? ordering : DEFAULT_ORDERING;
  const descending = resolved.startsWith("-");
  return {
    field: (descending ? resolved.slice(1) : resolved) as SortField,
    direction: descending ? "descending" : "ascending",
  };
}

/**
 * A click on `field`: flips it if it is the active field, else starts ascending.
 * Returns undefined when the result is DEFAULT_ORDERING, so the URL stays
 * canonical (D48).
 */
export function nextOrdering(current: string | undefined, field: SortField): string | undefined {
  const active = parseOrdering(current);
  const next = active.field === field && active.direction === "ascending" ? `-${field}` : field;
  return next === DEFAULT_ORDERING ? undefined : next;
}
```

- [ ] **Step 5: Render the sort state in `TaskTable`**

In `frontend/src/features/tasks/components/TaskTable.tsx`:

1. Delete the local `SORTABLE` constant and the local `nextOrdering` function.
2. Add these imports:

```tsx
import clsx from "clsx";

import { SORT_FIELDS, nextOrdering, parseOrdering } from "../sorting";
```

3. In `TaskTableProps`, change `onOrderingChange: (ordering: string) => void;` to `onOrderingChange: (ordering: string | undefined) => void;`.
4. At the top of the component body, add `const sort = parseOrdering(ordering);`.
5. Replace the `{SORTABLE.map(({ field, label }) => ( … ))}` header block with:

```tsx
          {SORT_FIELDS.map(({ field, label }) => {
            const active = sort.field === field;
            const next = active && sort.direction === "ascending" ? "descending" : "ascending";
            return (
              <th
                key={field}
                scope="col"
                // D68: the state a screen reader announces, and the visible glyph below.
                aria-sort={active ? sort.direction : "none"}
                className="p-3 font-medium text-slate-700"
              >
                <button
                  type="button"
                  onClick={() => onOrderingChange(nextOrdering(ordering, field))}
                  // Names the action the click will take, after the current state.
                  aria-label={
                    active ? `${label}, sorted ${sort.direction}. Sort ${next}` : `${label}. Sort ascending`
                  }
                  className={clsx(
                    "inline-flex items-center gap-1 underline-offset-2 hover:underline",
                    active ? "font-semibold text-slate-900" : "font-medium text-slate-700",
                  )}
                >
                  {label}
                  <span aria-hidden="true" className={active ? undefined : "text-slate-300"}>
                    {active ? (sort.direction === "ascending" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </th>
            );
          })}
```

`TaskListPage`'s handler, `(ordering) => editSearch((prev) => ({ ...prev, ordering, page: undefined }))`, already accepts `undefined`, which removes the parameter.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/tasks/sorting src/features/tasks/TaskListPage
```

Expected: all pass.

- [ ] **Step 7: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 8: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/features/tasks/sorting.ts frontend/src/features/tasks/sorting.test.ts frontend/src/features/tasks/components/TaskTable.tsx frontend/src/features/tasks/TaskListPage.test.tsx
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: show which column the task table is sorted by, and in which direction (D67, D68)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: F10 — whitelist `status` and `ordering` in the URL (spec §5.4, D73)

**Files:**
- Modify: `frontend/src/features/tasks/types.ts` (add `TASK_STATUSES`)
- Modify: `frontend/src/features/tasks/components/TaskFilters.tsx` (drop the private `STATUSES`)
- Modify: `frontend/src/app/search-params.ts`
- Test: `frontend/src/app/search-params.test.ts`, `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `search-params.test.ts`, inside `describe("validateTaskListSearch", …)`:

```ts
  it("drops statuses the API does not know (D73)", () => {
    expect(validateTaskListSearch({ status: ["BOGUS"] }).status).toBeUndefined();
    expect(validateTaskListSearch({ status: ["PENDING", "BOGUS"] }).status).toEqual(["PENDING"]);
    expect(validateTaskListSearch({ status: "BOGUS" }).status).toBeUndefined();
  });

  it("keeps a known ordering and drops an unknown one (D73)", () => {
    expect(validateTaskListSearch({ ordering: "-due_date" }).ordering).toBe("-due_date");
    expect(validateTaskListSearch({ ordering: "title" }).ordering).toBeUndefined();
    expect(validateTaskListSearch({ ordering: 3 }).ordering).toBeUndefined();
  });
```

In `TaskListPage.test.tsx`, inside `describe("TaskListPage URL state", …)`:

```tsx
  it("ignores an unknown status in the URL instead of sending it to the API (F10)", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp(`/tasks?status=${encodeURIComponent(JSON.stringify(["BOGUS"]))}`);
    await screen.findByRole("table");
    expect(lastQuery().getAll("status")).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/app/search-params src/features/tasks/TaskListPage
```

Expected: the three new cases FAIL (`["BOGUS"]` kept; `title` kept; `status=BOGUS` sent).

- [ ] **Step 3: Export `TASK_STATUSES` once**

In `frontend/src/features/tasks/types.ts`, directly after the `TaskStatus` type:

```ts
/** Every status, in display order. One list, as D56 did for ROLES (D73). */
export const TASK_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
```

In `TaskFilters.tsx`:

- delete `const STATUSES: TaskStatus[] = […];` and the blank line after it;
- change the types import to `import { TASK_STATUSES, type TaskFilters as Filters, type TaskStatus } from "../types";`;
- replace `STATUSES.map(` with `TASK_STATUSES.map(`.

- [ ] **Step 4: Whitelist in `search-params.ts`**

Add these imports:

```ts
import { isOrdering } from "../features/tasks/sorting";
import { TASK_STATUSES, type TaskStatus } from "../features/tasks/types";
```

Change `TaskListSearch.status` to `status?: TaskStatus[];`.

Add after `asArray`:

```ts
/** Statuses the API knows, or undefined when none survive (D73). */
function asStatuses(value: unknown): TaskStatus[] | undefined {
  const known = asArray(value)?.filter((status): status is TaskStatus =>
    (TASK_STATUSES as string[]).includes(status),
  );
  return known === undefined || known.length === 0 ? undefined : known;
}
```

In `validateTaskListSearch`, change:

- `status: asArray(search.status),` to `status: asStatuses(search.status),`;
- `ordering: asString(search.ordering),` to `ordering: isOrdering(search.ordering) ? search.ordering : undefined,`.

In `TaskListPage.tsx`, `status: search.status as Filters["status"],` can become `status: search.status,`. Make that change only if typecheck accepts it; leave the cast if it does not.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/app/search-params src/features/tasks/TaskListPage
```

Expected: all pass.

- [ ] **Step 6: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 7: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/features/tasks/types.ts frontend/src/features/tasks/components/TaskFilters.tsx frontend/src/app/search-params.ts frontend/src/app/search-params.test.ts frontend/src/features/tasks/TaskListPage.tsx frontend/src/features/tasks/TaskListPage.test.tsx
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: drop unknown statuses and orderings from the task list URL (D73)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: F3 + F8 — sort select and cards below `lg` (spec §4.3–§4.4, D69)

**Files:**
- Create: `frontend/src/features/tasks/components/TaskSortSelect.tsx`
- Modify: `frontend/src/features/tasks/TaskListPage.tsx`
- Modify: `frontend/src/features/tasks/components/TaskCard.tsx` (docstring)
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `TaskListPage.test.tsx`:

```tsx
describe("sorting and layout below lg (F3, F8)", () => {
  it("offers a Sort by select, showing the default order", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    await screen.findByRole("table");
    expect(screen.getByLabelText(/sort by/i)).toHaveDisplayValue("Newest first");
  });

  it("writes the chosen ordering to the URL and returns to page 1", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()], 60);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/sort by/i), "Due date, latest first");
    await waitFor(() => expect(lastQuery().get("ordering")).toBe("-due_date"));
    expect(router.state.location.search.page).toBeUndefined();
  });

  it("writes no ordering for Newest first, the default", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    const { router } = await renderApp("/tasks?ordering=due_date");
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/sort by/i), "Newest first");
    await waitFor(() => expect(router.state.location.search.ordering).toBeUndefined());
  });

  it("keeps the select when a filter empties the list", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp("/tasks");
    await screen.findByText(/no tasks match these filters/i);
    expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
  });

  it("switches between table and cards at lg, not md (D69)", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(table.parentElement).toHaveClass("hidden", "lg:block");
    expect(table.parentElement).not.toHaveClass("md:block");
    expect(screen.getByRole("article").parentElement).toHaveClass("lg:hidden");
    expect(screen.getByLabelText(/sort by/i).closest("div")).toHaveClass("lg:hidden");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskListPage
```

Expected: the five new tests FAIL (no "Sort by" control; `md:block` classes).

- [ ] **Step 3: Create `TaskSortSelect`**

`frontend/src/features/tasks/components/TaskSortSelect.tsx`:

```tsx
import clsx from "clsx";
import { useId } from "react";

import { DEFAULT_ORDERING, SORT_OPTIONS } from "../sorting";

interface TaskSortSelectProps {
  ordering: string | undefined;
  onChange: (ordering: string | undefined) => void;
  className?: string;
}

/**
 * The sort control where the table — and so its sortable headers — is not
 * shown (F3, D69). Writes the same `ordering` search param as the headers.
 */
export function TaskSortSelect({ ordering, onChange, className }: TaskSortSelectProps) {
  const id = useId();
  return (
    <div className={clsx("mb-3 flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Sort by
      </label>
      <select
        id={id}
        value={ordering ?? DEFAULT_ORDERING}
        // The default is written as no parameter, so the URL stays canonical (D48).
        onChange={(event) =>
          onChange(event.target.value === DEFAULT_ORDERING ? undefined : event.target.value)
        }
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Wire it in and move the breakpoint**

In `TaskListPage.tsx`:

1. Add `import { TaskSortSelect } from "./components/TaskSortSelect";`.
2. Add after `setPageSize`:

```tsx
  /** A sort change is an edit, like a filter: replace, keep scroll, page 1 (D47). */
  function setOrdering(ordering: string | undefined) {
    editSearch((prev) => ({ ...prev, ordering, page: undefined }));
  }
```

3. Change `TaskTable`'s `onOrderingChange={(ordering) => editSearch(…)}` to `onOrderingChange={setOrdering}`.
4. Directly after `<FormError message={actionError} />`, add:

```tsx
      {/* Outside the results, so it survives an empty result (spec §4.3). */}
      <TaskSortSelect ordering={filters.ordering} onChange={setOrdering} className="lg:hidden" />
```

5. Change `<div className="hidden overflow-x-auto md:block">` to `<div className="hidden overflow-x-auto lg:block">`, and `<div className="md:hidden">` to `<div className="lg:hidden">`.
6. Replace the comment above them with:

```tsx
          {/* Cards below lg, not md (D69): at md the table's six columns and two
              action buttons do not fit, so badges and actions wrapped. */}
```

In `TaskCard.tsx`'s docstring, change "The below-`md` presentation" to "The below-`lg` presentation (D69)".

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskListPage
```

Expected: all pass. The existing card test still finds its `article`.

- [ ] **Step 6: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 7: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/features/tasks
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: sort the task list on phones and tablets; show cards below lg (D69)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: F5 — "Back to tasks" returns to the same list (spec §5.1, D70)

**Files:**
- Create: `frontend/src/app/history-state.ts`
- Create: `frontend/src/features/tasks/hooks/useTasksBackSearch.ts`
- Modify: `frontend/src/features/tasks/components/TaskTable.tsx`, `TaskCard.tsx` (new `listSearch` prop, `state` on the title link)
- Modify: `frontend/src/features/tasks/TaskListPage.tsx` (pass `listSearch`; state on **New task**)
- Modify: `frontend/src/features/tasks/TaskDetailPage.tsx`, `frontend/src/features/tasks/TaskFormPage.tsx`
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Change the `import type { TaskListItem } from "./types";` line in `TaskListPage.test.tsx` to `import type { TaskDetail, TaskListItem } from "./types";`. Append:

```tsx
describe("returning to the list (F5, D70)", () => {
  const PENDING = encodeURIComponent(JSON.stringify(["PENDING"]));
  const LIST = `/tasks?status=${PENDING}&page=2&ordering=due_date`;
  const EXPECTED = { status: ["PENDING"], page: 2, ordering: "due_date" };

  function detailOf(item: TaskListItem): TaskDetail {
    return {
      ...item,
      description: "",
      created_by: SUPERVISOR,
      completed_at: null,
      updated_at: item.created_at,
      allowed_transitions: ["IN_PROGRESS", "CANCELLED"],
    };
  }

  function serveTask(item: TaskListItem) {
    tasksRespondWith([item], 60);
    server.use(
      http.get(`${BASE}/tasks/${item.id}/`, () => HttpResponse.json(detailOf(item))),
      http.patch(`${BASE}/tasks/${item.id}/`, () => HttpResponse.json(detailOf(item))),
      http.delete(`${BASE}/tasks/${item.id}/`, () => new HttpResponse(null, { status: 204 })),
    );
  }

  async function openFromList(item: TaskListItem) {
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("link", { name: item.title }));
    await screen.findByRole("heading", { level: 1, name: item.title });
    return user;
  }

  it("returns to the same filters, page and sort from Back to tasks", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = await openFromList(item);
    await user.click(screen.getByRole("link", { name: /back to tasks/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("keeps the list through an edit and save", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = await openFromList(item);
    await user.click(screen.getByRole("link", { name: /^edit$/i }));
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { level: 1, name: item.title });
    await user.click(screen.getByRole("link", { name: /back to tasks/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("returns to the same list after deleting the task", async () => {
    signedInAs(SUPERVISOR);
    const item = task({ can_delete: true });
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = await openFromList(item);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^delete$/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("falls back to the plain list for a task opened directly", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    await renderApp(`/tasks/${item.id}`);
    await screen.findByRole("heading", { level: 1, name: item.title });
    expect(screen.getByRole("link", { name: /back to tasks/i })).toHaveAttribute("href", "/tasks");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskListPage
```

Expected: the first three FAIL (search is `{}`); the fourth passes (it pins the fallback).

- [ ] **Step 3: Declare the history state**

`frontend/src/app/history-state.ts`:

```ts
import type { TaskListSearch } from "./search-params";

/**
 * D70: what a link may leave in a history entry. Declared once, so every
 * Link `state` and every `useLocation().state` read is typed.
 */
declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The task list's search when the user left it, to return to it. */
    tasksSearch?: TaskListSearch;
  }
}
```

There is no `export {};`. The `import type` line already makes this a module (and `moduleDetection` is `"force"`). An empty export would trip oxlint's `typescript(no-useless-empty-export)` and push lint to 6 warnings.

- [ ] **Step 4: The reader hook**

`frontend/src/features/tasks/hooks/useTasksBackSearch.ts`:

```ts
import { useLocation } from "@tanstack/react-router";

import { validateTaskListSearch, type TaskListSearch } from "../../../app/search-params";

/**
 * The task list search to return to (D70): what a list link left in this
 * history entry, validated like a URL because history state is just as
 * hand-editable. With none — a deep link, the dashboard — it resolves to the
 * plain list. The result always carries every key, undefined where unset.
 */
export function useTasksBackSearch(): TaskListSearch {
  const left = useLocation({ select: (location) => location.state.tasksSearch });
  return validateTaskListSearch((left ?? {}) as Record<string, unknown>);
}
```

- [ ] **Step 5: Writers — links leaving the list**

1. **`TaskTable.tsx`**:
   - add `import type { TaskListSearch } from "../../../app/search-params";`;
   - add `listSearch: TaskListSearch;` to the props interface, documented `/** Left in history state by each title link, so the detail can return here (D70). */`;
   - destructure it;
   - add `state={{ tasksSearch: listSearch }}` to the title `<Link to="/tasks/$taskId" …>`.
2. **`TaskCard.tsx`**: the same import, prop and `state` on its title `Link`.
3. **`TaskListPage.tsx`**:
   - pass `listSearch={search}` to `<TaskTable>` and each `<TaskCard>`;
   - add `state={{ tasksSearch: search }}` to the header `<ButtonLink to="/tasks/new" …>`.

- [ ] **Step 6: Consumers — detail, edit and create**

**`TaskDetailPage.tsx`:**

1. Add `import { useTasksBackSearch } from "./hooks/useTasksBackSearch";`, then `const back = useTasksBackSearch();` directly after `const navigate = useNavigate();`. It must sit above the early returns: hooks first.
2. In `confirmDelete`, change `await navigate({ to: "/tasks" });` to `await navigate({ to: "/tasks", search: back });`.
3. On the Edit link, add `state={{ tasksSearch: back }}` to `<ButtonLink variant="secondary" to="/tasks/$taskId/edit" params={{ taskId: task.id }}>`.
4. Change `<ButtonLink variant="secondary" to="/tasks">` to `<ButtonLink variant="secondary" to="/tasks" search={back}>`.

**`TaskFormPage.tsx`:**

1. Add `import { useTasksBackSearch } from "./hooks/useTasksBackSearch";`.
2. In `TaskCreatePage`:
   - add `const back = useTasksBackSearch();` after `useCreateTask()`;
   - change the redirect to `await navigate({ to: "/tasks/$taskId", params: { taskId: task.id }, state: { tasksSearch: back } });`;
   - change Cancel to `onCancel={() => void navigate({ to: "/tasks", search: back })}`.
3. In `TaskEditPage`:
   - add `const back = useTasksBackSearch();` after `useUpdateTask(taskId)`, above the early returns;
   - change the save redirect to `await navigate({ to: "/tasks/$taskId", params: { taskId }, state: { tasksSearch: back } });`;
   - change Cancel to `onCancel={() => void navigate({ to: "/tasks/$taskId", params: { taskId }, state: { tasksSearch: back } })}`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/tasks
```

Expected: all pass, including `TaskForm.test.tsx`'s detail-page delete tests, which still land on the `Tasks` heading.

- [ ] **Step 8: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

If typecheck rejects `state={{ tasksSearch: … }}`, the augmentation is not being picked up. Confirm that `history-state.ts` is under `src/` (included by `tsconfig.app.json`) and keeps its `import type` line, which is what makes it a module. Do not widen anything to `any`.

- [ ] **Step 9: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/app/history-state.ts frontend/src/features/tasks
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: return to the same filtered, paged, sorted list from a task (D70)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: F4 — not-found states that lead somewhere (spec §5.2, D71, D72)

**Files:**
- Create: `frontend/src/components/NotFoundPanel.tsx`
- Create: `frontend/src/features/tasks/components/TaskNotFound.tsx`
- Create: `frontend/src/app/layout/ShellLayout.tsx`
- Create: `frontend/src/app/layout/AppNotFound.tsx`
- Modify: `frontend/src/app/layout/AppShell.tsx`, `frontend/src/app/router.tsx` (`createAppRouter`)
- Modify: `frontend/src/features/tasks/TaskDetailPage.tsx`, `frontend/src/features/tasks/TaskFormPage.tsx` (`TaskEditPage`), `frontend/src/features/users/UserFormPage.tsx` (`UserEditPage`)
- Test: `frontend/src/features/tasks/TaskForm.test.tsx`, `frontend/src/features/users/UserForm.test.tsx`, `frontend/src/app/layout/AppShell.test.tsx`

- [ ] **Step 1: Write the failing page tests**

In `TaskForm.test.tsx`, inside `describe("TaskDetailPage", …)`:

```tsx
  function taskIsGone() {
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () =>
        HttpResponse.json(
          { detail: "No Task matches the given query.", code: "not_found", errors: null },
          { status: 404 },
        ),
      ),
    );
  }

  it("explains a missing task without saying why, and links back (D72)", async () => {
    signedInAs(SUPERVISOR);
    taskIsGone();
    await renderApp(`/tasks/${TASK_ID}`);
    expect(await screen.findByRole("heading", { name: /task not found/i })).toBeInTheDocument();
    expect(screen.getByText(/deleted, or it isn't assigned to you/i)).toBeInTheDocument();
    expect(screen.queryByText(/no task matches/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to tasks/i })).toHaveAttribute("href", "/tasks");
  });

  it("does the same on the edit page", async () => {
    signedInAs(SUPERVISOR);
    taskIsGone();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    expect(await screen.findByRole("heading", { name: /task not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to tasks/i })).toBeInTheDocument();
  });

  it("keeps other errors' message and still offers the way back", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () =>
        HttpResponse.json({ detail: "Database is down.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp(`/tasks/${TASK_ID}`);
    expect(await screen.findByRole("alert")).toHaveTextContent(/database is down/i);
    expect(screen.getByRole("link", { name: /back to tasks/i })).toBeInTheDocument();
  });
```

In `UserForm.test.tsx`, inside `describe("UserForm", …)`:

```tsx
  it("explains a missing user and links back to the list", async () => {
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () =>
        HttpResponse.json({ detail: "Not found.", code: "not_found", errors: null }, { status: 404 }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    expect(await screen.findByRole("heading", { name: /user not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to users/i })).toHaveAttribute("href", "/users");
  });
```

- [ ] **Step 2: Write the failing unknown-address tests**

Append to `AppShell.test.tsx`. It already has the `signedInAs` session variable and the `nav()` helper:

```tsx
describe("unknown addresses (F4, D71)", () => {
  it.each(["/does-not-exist", "/tasks/a/b"])(
    "renders %s inside exactly one shell, with a link home",
    async (path) => {
      signedInAs = "SUPERVISOR";
      await renderApp(path);
      expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
      // A banner count is unreliable for a <header> nested in <main>; the named nav is not.
      expect(screen.getAllByRole("navigation", { name: /main/i })).toHaveLength(1);
      expect(screen.getByRole("link", { name: /go to your home page/i })).toHaveAttribute(
        "href",
        "/",
      );
    },
  );

  it("offers a signed-out visitor the sign-in page, with no app menu", async () => {
    signedInAs = null;
    await renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("navigation", { name: /main/i })).not.toBeInTheDocument();
  });
});
```

The console guard in `src/test/setup.ts` turns TanStack's "notFoundComponent … not configured" warning into a failure. That is what proves the warning is gone.

- [ ] **Step 3: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskForm src/features/users/UserForm src/app/layout/AppShell
```

Expected: the new tests FAIL: raw message / "Could not load that task." / no heading, and TanStack's console warning on unknown paths.

- [ ] **Step 4: The shared panel and the task panel**

`frontend/src/components/NotFoundPanel.tsx`:

```tsx
import { ButtonLink } from "./ButtonLink";

interface NotFoundPanelProps {
  title: string;
  message: string;
  linkTo: "/" | "/login" | "/tasks" | "/users";
  linkLabel: string;
  /** `object`, not Record<string, unknown>: TaskListSearch is an interface with
   *  no index signature, so it would not be assignable to a Record. */
  linkSearch?: object;
}

/** Every not-found state says what is missing and offers the way back (D71). */
export function NotFoundPanel({ title, message, linkTo, linkLabel, linkSearch }: NotFoundPanelProps) {
  return (
    <section className="rounded-lg bg-white p-6 shadow-sm">
      <h1 className="mb-2 text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mb-4 text-sm text-slate-600">{message}</p>
      <ButtonLink variant="secondary" to={linkTo} search={linkSearch}>
        {linkLabel}
      </ButtonLink>
    </section>
  );
}
```

`frontend/src/features/tasks/components/TaskNotFound.tsx`:

```tsx
import type { TaskListSearch } from "../../../app/search-params";
import { NotFoundPanel } from "../../../components/NotFoundPanel";

/**
 * A task 404 never says WHY (D72): "deleted" and "not yours" must read the same,
 * or the message would confirm the row exists (spec §7.2 rule 5).
 */
export function TaskNotFound({ backSearch }: { backSearch: TaskListSearch }) {
  return (
    <NotFoundPanel
      title="Task not found"
      message="It may have been deleted, or it isn't assigned to you."
      linkTo="/tasks"
      linkLabel="Back to tasks"
      linkSearch={backSearch}
    />
  );
}
```

- [ ] **Step 5: Use them on the detail, edit and user-edit pages**

**`TaskDetailPage.tsx`:** add `import { TaskNotFound } from "./components/TaskNotFound";`. Replace the `if (isError || task === undefined) { return (<p role="alert" …>…</p>); }` block with:

```tsx
  if (isError || task === undefined) {
    if (error instanceof ApiError && error.status === 404) {
      return <TaskNotFound backSearch={back} />;
    }
    return (
      <section>
        <p role="alert" className="mb-4 text-sm text-status-overdue">
          {error instanceof ApiError ? error.message : "Could not load that task."}
        </p>
        <ButtonLink variant="secondary" to="/tasks" search={back}>
          Back to tasks
        </ButtonLink>
      </section>
    );
  }
```

**`TaskFormPage.tsx` (`TaskEditPage`):**

1. Change the query line to `const { data: task, isPending, isError, error } = useTask(taskId);`.
2. Add these imports:

```tsx
import { ButtonLink } from "../../components/ButtonLink";
import { ApiError } from "../../lib/api-error";
import { TaskNotFound } from "./components/TaskNotFound";
```

3. Replace the `if (isError || task === undefined) return (<p role="alert" …>Could not load that task.</p>);` block with:

```tsx
  if (isError || task === undefined) {
    if (error instanceof ApiError && error.status === 404) {
      return <TaskNotFound backSearch={back} />;
    }
    return (
      <section>
        <p role="alert" className="mb-4 text-status-overdue">
          Could not load that task.
        </p>
        <ButtonLink variant="secondary" to="/tasks" search={back}>
          Back to tasks
        </ButtonLink>
      </section>
    );
  }
```

**`UserFormPage.tsx` (`UserEditPage`):**

1. Change the query line to `const { data: user, isPending, isError, error } = useUser(userId);`.
2. Add these imports:

```tsx
import { ButtonLink } from "../../components/ButtonLink";
import { NotFoundPanel } from "../../components/NotFoundPanel";
import { ApiError } from "../../lib/api-error";
```

3. Replace its error block with:

```tsx
  if (isError || user === undefined) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <NotFoundPanel
          title="User not found"
          message="They may have been deleted."
          linkTo="/users"
          linkLabel="Back to users"
        />
      );
    }
    return (
      <section>
        <p role="alert" className="mb-4 text-status-overdue">
          Could not load that user.
        </p>
        <ButtonLink variant="secondary" to="/users">
          Back to users
        </ButtonLink>
      </section>
    );
  }
```

- [ ] **Step 6: Extract `ShellLayout`; add `AppNotFound`; configure the router**

`frontend/src/app/layout/ShellLayout.tsx`: move `AppShell`'s **entire** current JSX here, unchanged, with `<Outlet />` replaced by `{children}`:

```tsx
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "../../features/auth/hooks/useAuth";
import { APP_NAME } from "../app-name";

/**
 * The signed-in page frame: header, menu and main column. Takes children rather
 * than rendering an <Outlet/>, so the router's not-found page can use the same
 * frame (D71).
 *
 * Navigation reflects what the backend actually allows, so nobody is offered a
 * link that would 403 (F4). An Admin gets no Tasks or Dashboard link at all,
 * because D13 gives them no task surface.
 */
export function ShellLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="min-h-full">
      {/* … the existing <header> … </header>, unchanged … */}
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
```

The `{/* … */}` line is a placeholder in this plan only. **Copy the real `<header>` element verbatim** from the current `AppShell.tsx`.

`frontend/src/app/layout/AppShell.tsx` becomes:

```tsx
import { Outlet } from "@tanstack/react-router";

import { ShellLayout } from "./ShellLayout";

/** The routed shell: every signed-in page renders inside ShellLayout. */
export function AppShell() {
  return (
    <ShellLayout>
      <Outlet />
    </ShellLayout>
  );
}
```

`frontend/src/app/layout/AppNotFound.tsx`:

```tsx
import { NotFoundPanel } from "../../components/NotFoundPanel";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { ShellLayout } from "./ShellLayout";

const MESSAGE = "There's nothing at this address.";

/**
 * The router's defaultNotFoundComponent (D71). With notFoundMode "root" it always
 * renders at the root, outside AppShell, so wrapping it in ShellLayout here
 * cannot double the header. "/" redirects to each role's landing page, so one
 * link serves every role.
 */
export function AppNotFound() {
  const { user } = useAuth();
  if (user === null) {
    return (
      <main className="mx-auto max-w-5xl p-4">
        <NotFoundPanel title="Page not found" message={MESSAGE} linkTo="/login" linkLabel="Sign in" />
      </main>
    );
  }
  return (
    <ShellLayout>
      <NotFoundPanel
        title="Page not found"
        message={MESSAGE}
        linkTo="/"
        linkLabel="Go to your home page"
      />
    </ShellLayout>
  );
}
```

In `frontend/src/app/router.tsx`, add `import { AppNotFound } from "./layout/AppNotFound";`. In `createAppRouter`'s `createRouter({ … })`, add after `defaultPreload: false,`:

```ts
    // D71: every unmatched path renders at the root — under the default "fuzzy"
    // mode, /tasks/a/b would render inside AppShell and /does-not-exist outside
    // it, and one component cannot be right in both places.
    notFoundMode: "root",
    defaultNotFoundComponent: AppNotFound,
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskForm src/features/users/UserForm src/app/layout/AppShell
```

Expected: all pass, including the existing AppShell tests (the header markup is unchanged).

- [ ] **Step 8: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings. `ShellLayout.tsx`, `AppNotFound.tsx` and `NotFoundPanel.tsx` each export one component, so they add no warning.

- [ ] **Step 9: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/components/NotFoundPanel.tsx frontend/src/features/tasks frontend/src/features/users frontend/src/app/layout frontend/src/app/router.tsx
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: show not-found pages that explain and lead back, inside the app (D71, D72)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: F7 + F14 — active nav item and 44 px header targets (spec §5.3, §6.5, D77)

**Files:**
- Modify: `frontend/src/app/layout/ShellLayout.tsx`
- Test: `frontend/src/app/layout/AppShell.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `AppShell.test.tsx`:

```tsx
describe("the menu marks where you are (F7, F14, D77)", () => {
  it("marks the current section, and only it", async () => {
    signedInAs = "SUPERVISOR";
    await renderApp("/dashboard");
    await screen.findByRole("heading", { name: /dashboard/i });
    const dashboard = within(nav()).getByRole("link", { name: /dashboard/i });
    const tasks = within(nav()).getByRole("link", { name: /tasks/i });
    expect(dashboard).toHaveAttribute("aria-current", "page");
    expect(dashboard).toHaveClass("border-status-progress");
    expect(tasks).not.toHaveAttribute("aria-current");
    expect(tasks).toHaveClass("border-transparent");
  });

  it.each([`/tasks?status=${encodeURIComponent(JSON.stringify(["PENDING"]))}`, "/tasks/new"])(
    "keeps Tasks marked on %s",
    async (path) => {
      signedInAs = "SUPERVISOR";
      await renderApp(path);
      await screen.findByRole("heading", { level: 1 });
      expect(within(nav()).getByRole("link", { name: /tasks/i })).toHaveClass(
        "border-status-progress",
      );
    },
  );

  it("gives every header control a 44px target", async () => {
    signedInAs = "SUPERVISOR";
    await renderApp("/dashboard");
    await screen.findByRole("heading", { name: /dashboard/i });
    for (const link of within(nav()).getAllByRole("link")) expect(link).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: /sign out/i })).toHaveClass("min-h-11");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/app/layout/AppShell
```

Expected: FAIL (no border classes; no `min-h-11`).

- [ ] **Step 3: Style the menu**

In `ShellLayout.tsx`, add above the component:

```tsx
/**
 * 44px targets (F14) with the header's vertical padding moved into them, so the
 * header keeps its height. The active link's 2px bottom border sits on the
 * header's bottom edge, like a tab (F7). Colours come from activeProps and
 * inactiveProps rather than the base class, so two border colours never compete
 * on one element (clsx would keep both, and CSS order would decide).
 */
const NAV_LINK = "inline-flex min-h-11 items-center border-b-2 text-sm font-medium";
const NAV_ACTIVE = { className: "border-status-progress text-slate-900" };
const NAV_INACTIVE = { className: "border-transparent text-slate-700 hover:text-slate-900" };
```

Then:

1. **Header row.** Change the inner header `div`'s classes from `mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3` to `mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 px-4`.
2. **App name.** Change its span to `className="inline-flex min-h-11 items-center font-semibold text-slate-900"`.
3. **Nav links.** Give each of the three `Link`s (Dashboard, Tasks, Users) `className={NAV_LINK} activeProps={NAV_ACTIVE} inactiveProps={NAV_INACTIVE}`, replacing `className="text-sm font-medium text-slate-700"`.
4. **Email.** Change its span to `className="ml-auto inline-flex min-h-11 items-center text-sm text-slate-500"`.
5. **Sign out.** Change its button to `className="inline-flex min-h-11 items-center text-sm font-medium text-slate-700 hover:text-slate-900"`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/app/layout/AppShell
```

Expected: all pass.

- [ ] **Step 5: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 6: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/app/layout
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: mark the current menu item and give header controls 44px targets (D77)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: F2 — focus the first error after a failed submit (spec §6.1, D75)

**Files:**
- Create: `frontend/src/components/useFocusFirstError.ts`
- Modify: `frontend/src/components/FormError.tsx`
- Modify: `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/features/tasks/components/TaskForm.tsx`, `frontend/src/features/users/components/UserForm.tsx`
- Conditionally modify: `frontend/src/features/tasks/components/DeleteTaskDialog.tsx`, `frontend/src/features/users/components/DeleteUserDialog.tsx`
- Test: `frontend/src/features/auth/LoginPage.test.tsx`, `frontend/src/features/tasks/TaskForm.test.tsx`, `frontend/src/features/users/UserForm.test.tsx`

- [ ] **Step 1: Write the failing form tests**

`LoginPage.test.tsx`, inside `describe("LoginPage", …)`:

```tsx
  it("moves focus to the first invalid field when sign-in fails validation (D75)", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          {
            detail: "Invalid input.",
            code: "validation_error",
            errors: { email: ["This field may not be blank."], password: ["This field may not be blank."] },
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/login");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveFocus());
  });

  it("moves focus to the alert when the failure names no field", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          { detail: "No active account found with the given credentials.", code: "no_active_account", errors: null },
          { status: 401 },
        ),
      ),
    );
    await renderApp("/login");
    await fillAndSubmit("nobody@demo.local", "wrong-password");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });
```

`TaskForm.test.tsx`, inside `describe("TaskForm", …)`:

```tsx
  it("moves focus to the first invalid field after a failed save, every time (D75)", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.post(`${BASE}/tasks/`, () =>
        HttpResponse.json(
          {
            detail: "Invalid input.",
            code: "validation_error",
            errors: { title: ["This field may not be blank."] },
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/tasks/new");
    const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: /create task/i });
    const title = screen.getByLabelText(/title/i);
    await user.click(submit);
    await waitFor(() => expect(title).toHaveFocus());
    // Clicking moves focus to the button; identical errors must still refocus.
    await user.click(submit);
    await waitFor(() => expect(title).toHaveFocus());
  });
```

`UserForm.test.tsx`, inside `describe("UserForm", …)`:

```tsx
  it("moves focus to the email field when the address is taken (D75)", async () => {
    server.use(
      http.post(`${BASE}/users/`, () =>
        HttpResponse.json(
          { detail: "A user with this email address already exists.", code: "email_already_in_use", errors: null },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "dupe@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "D");
    await user.type(screen.getByLabelText(/last name/i), "Upe");
    await user.type(screen.getByLabelText(/^password$/i), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toHaveFocus());
  });
```

- [ ] **Step 2: Write the dialog probe test**

In `TaskForm.test.tsx`, inside `describe("TaskDetailPage", …)`, next to "keeps the dialog open and shows the error when deletion fails":

```tsx
  it("keeps focus inside the dialog when deletion fails (D75)", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    deletesRespondWith(() =>
      HttpResponse.json({ detail: "Refused.", code: "permission_denied" }, { status: 403 }),
    );
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await within(dialog).findByRole("alert");
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  });
```

- [ ] **Step 3: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/features/auth/LoginPage src/features/tasks/TaskForm src/features/users/UserForm
```

Expected: the four form tests FAIL (focus is on `<body>`). **Record whether the dialog probe fails.** It decides Step 7.

- [ ] **Step 4: The hook**

`frontend/src/components/useFocusFirstError.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * After a failed submit, focus the first invalid field, or else the form's
 * alert (D75). The submit button is disabled while the request is in flight, and
 * disabling the focused element drops focus to <body>; without this, keyboard
 * and screen-reader users had to hunt for the errors.
 *
 * Attach `ref` to the <form>; call `signalFailure()` in the submit's catch. A
 * counter rather than a flag, so a repeat failure with identical errors still
 * refocuses.
 */
export function useFocusFirstError<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (failures === 0) return;
    const root = ref.current;
    if (root === null) return;
    const target =
      root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      root.querySelector<HTMLElement>('[role="alert"]');
    target?.focus();
  }, [failures]);

  const signalFailure = useCallback(() => setFailures((count) => count + 1), []);
  return { ref, signalFailure };
}
```

In `FormError.tsx`, add `tabIndex={-1}` to the `<p role="alert" …>`, and extend its comment with: "tabIndex -1 so useFocusFirstError can focus it without adding a Tab stop (D75)."

- [ ] **Step 5: Use it in the three forms**

The same three edits in each of `LoginPage.tsx`, `TaskForm.tsx` and `UserForm.tsx`:

1. Import the hook. Use `import { useFocusFirstError } from "../../components/useFocusFirstError";` in `LoginPage.tsx`, and `import { useFocusFirstError } from "../../../components/useFocusFirstError";` in `TaskForm.tsx` and `UserForm.tsx`.
2. At the top of the component, add `const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();`.
3. Add `ref={formRef}` to the `<form …>` element.
4. Call `signalFailure();` as the **last statement of the `catch` block**, after the error state is set. React batches it with those updates, so the effect runs once the errors are rendered and the button is re-enabled.

- [ ] **Step 6: Run the form tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/auth/LoginPage src/features/tasks/TaskForm src/features/users/UserForm
```

Expected: the four form tests pass.

- [ ] **Step 7: The dialogs — only if the probe failed in Step 3**

The plan review ran this probe against the current code and it **passed**, so expect this branch.

**If the probe passed in Step 3,** focus already stays inside the dialog. Keep the test as a guard, change nothing in the dialogs, and note "dialog focus verified, no change" in the commit body.

**If the probe failed,** add to **both** `DeleteTaskDialog.tsx` and `DeleteUserDialog.tsx`:

1. Add `import { useEffect } from "react";`.
2. After the `useModalDialog` call, add:

```tsx
  // D75: the buttons are disabled while the request runs, which drops focus to
  // <body>, outside the aria-modal dialog. On a failure, focus the error, so
  // the trap holds and the message is reached first.
  useEffect(() => {
    if (error !== null) {
      dialogRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
    }
  }, [error, dialogRef]);
```

Re-run the Step 3 command. Expected: the probe passes.

- [ ] **Step 8: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 9: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/components frontend/src/features
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: move focus to the first error after a failed submit (D75)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 11: F9 — explain an inverted date range (spec §6.2, D78)

**Files:**
- Modify: `frontend/src/features/tasks/components/TaskFilters.tsx`
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `TaskListPage.test.tsx`:

```tsx
describe("an impossible date range (F9, D78)", () => {
  const AFTER = encodeURIComponent("2026-10-10T00:00:00.000Z");
  const BEFORE = encodeURIComponent("2026-10-01T23:59:59.000Z");

  it("says why nothing can match, on the Due before field", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp(`/tasks?due_date_after=${AFTER}&due_date_before=${BEFORE}`);
    const before = await screen.findByLabelText(/due before/i);
    expect(before).toHaveAttribute("aria-invalid", "true");
    expect(before).toHaveAccessibleDescription(/later than .due before., so no task can match/i);
    // The URL still holds what was entered (D45); the empty state still shows.
    // findBy, not getBy: the filters render before the list query settles.
    expect(await screen.findByText(/no tasks match these filters/i)).toBeInTheDocument();
  });

  it("limits each picker to days the other allows", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp(`/tasks?due_date_after=${AFTER}&due_date_before=${BEFORE}`);
    expect(await screen.findByLabelText(/due after/i)).toHaveAttribute("max", "2026-10-01");
    expect(screen.getByLabelText(/due before/i)).toHaveAttribute("min", "2026-10-10");
  });

  it("says nothing for a valid range", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp(`/tasks?due_date_after=${BEFORE}&due_date_before=${AFTER}`);
    const before = await screen.findByLabelText(/due before/i);
    expect(before).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/so no task can match/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskListPage
```

Expected: the first two FAIL; the third passes.

- [ ] **Step 3: Implement**

In `TaskFilters.tsx`:

1. Add `import { useId } from "react";`.
2. After the two `useSearchParamDraft` calls, add:

```tsx
  // D78: explained, not prevented — the URL keeps what was entered (D45). ISO
  // days compare correctly as strings.
  const inverted = after.draft !== "" && before.draft !== "" && after.draft > before.draft;
  const rangeErrorId = useId();
```

3. On the Due after `<input>`, add `max={before.draft || undefined}`.
4. On the Due before `<input>`, add:

```tsx
            min={after.draft || undefined}
            aria-invalid={inverted || undefined}
            aria-describedby={inverted ? rangeErrorId : undefined}
```

5. After the closing `</div>` of the `flex flex-col gap-3 sm:flex-row sm:items-end` row, still inside the `<section>`, add:

```tsx
      {inverted && (
        <p id={rangeErrorId} className="mt-2 text-sm text-status-overdue">
          &ldquo;Due after&rdquo; is later than &ldquo;Due before&rdquo;, so no task can match.
        </p>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/tasks/TaskListPage
```

Expected: all pass.

- [ ] **Step 5: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 6: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/features/tasks/components/TaskFilters.tsx frontend/src/features/tasks/TaskListPage.test.tsx
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: explain an impossible due-date range instead of a silent empty list (D78)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 12: F12 — due dates shown as dates (spec §6.3, D76)

**Files:**
- Create: `frontend/src/lib/dates.ts`
- Create: `frontend/src/lib/dates.test.ts`
- Modify: `frontend/src/features/tasks/components/TaskTable.tsx`, `TaskCard.tsx`, `frontend/src/features/tasks/TaskDetailPage.tsx`
- Test: `frontend/src/features/tasks/TaskForm.test.tsx`

- [ ] **Step 1: Write the failing unit test**

`frontend/src/lib/dates.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDueDate } from "./dates";

/** 1 Jan 2026 in the runtime's locale, built without reference to any zone offset. */
const JAN_1 = new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).format(Date.UTC(2026, 0, 1));

// Each input crosses midnight in its zone, so formatting in LOCAL time — the bug —
// gives a different day and fails (spec §7.2, F12). The zone is stubbed in this
// file only; no suite-wide TZ.
describe.each([
  ["Asia/Tokyo", "2026-01-01T20:00:00Z", 2], // local: 2 Jan, 05:00
  ["America/Bogota", "2026-01-01T02:00:00Z", 31], // local: 31 Dec, 21:00
])("formatDueDate under %s", (zone, iso, localDay) => {
  beforeEach(() => {
    vi.stubEnv("TZ", zone);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs in that zone (precondition)", () => {
    expect(new Date(iso).getDate()).toBe(localDay);
  });

  it("shows the UTC day, with no time", () => {
    expect(formatDueDate(iso)).toBe(JAN_1);
    expect(formatDueDate(iso)).not.toMatch(/:/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run --prefix frontend test -- src/lib/dates
```

Expected: FAIL to import `./dates`.

If, after Step 4, a **precondition** test fails, `vi.stubEnv("TZ")` is not taking effect in this Node version. In that case, replace the `beforeEach`/`afterEach` pair with `process.env.TZ = zone;` in `beforeEach` and `delete process.env.TZ;` in `afterEach`. Node 22 re-reads `process.env.TZ` on assignment. Re-run the test.

- [ ] **Step 3: Write the failing detail-page test**

In `TaskForm.test.tsx`, add `import { formatDueDate } from "../../lib/dates";`, then inside `describe("TaskDetailPage", …)` add the test below.

Until Step 4 creates `dates.ts`, that import stops the **whole** file from loading. That is expected; Step 5 re-runs it.

```tsx
  it("shows a due date as a date, without an invented time (D76)", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ due_date: "2026-01-01T12:00:00Z" });
    await renderApp(`/tasks/${TASK_ID}`);
    const term = await screen.findByText("Due date");
    const value = term.nextElementSibling as HTMLElement;
    expect(value).toHaveTextContent(formatDueDate("2026-01-01T12:00:00Z"));
    expect(value.textContent).not.toMatch(/:/);
  });
```

- [ ] **Step 4: Implement**

`frontend/src/lib/dates.ts`:

```ts
/**
 * A due date as the UTC calendar day — exactly the day TaskForm edits
 * (`due_date.slice(0, 10)`) and stores as noon UTC — with no time (D76). Local
 * formatting showed an invented time on the detail page, and shifts the day for
 * viewers far enough from UTC.
 *
 * Only for due dates: created_at and completed_at are real moments and stay in
 * local time.
 */
export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { timeZone: "UTC" });
}
```

Use it in three places:

- **`TaskTable.tsx`** and **`TaskCard.tsx`**: add the import (`import { formatDueDate } from "../../../lib/dates";`), and replace `new Date(task.due_date).toLocaleDateString()` with `formatDueDate(task.due_date)`. Leave `created_at` alone.
- **`TaskDetailPage.tsx`**: add `import { formatDueDate } from "../../lib/dates";`, and replace `new Date(task.due_date).toLocaleString()` with `formatDueDate(task.due_date)`. Leave `completed_at` alone.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/lib/dates src/features/tasks/TaskForm
```

Expected: all pass, including both precondition tests.

- [ ] **Step 6: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 7: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/lib/dates.ts frontend/src/lib/dates.test.ts frontend/src/features/tasks
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: show due dates as the UTC day the form edits, with no time (D76)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 13: F13 — role labels everywhere (spec §6.4)

**Files:**
- Modify: `frontend/src/features/auth/types.ts`
- Modify: `frontend/src/features/users/components/UserForm.tsx`, `UserTable.tsx`, `UserCard.tsx`, `frontend/src/features/users/UserListPage.tsx`
- Test: `frontend/src/features/users/UserListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

In `UserListPage.test.tsx`, inside `describe("UserListPage", …)`:

```tsx
  it("shows roles by their label, never the stored value (F13)", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("cell", { name: "Operator" })).toBeInTheDocument();
    expect(within(table).queryByText("OPERATOR")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("Operator")).toBeInTheDocument();
    const option = within(screen.getByLabelText(/^role$/i)).getByRole("option", {
      name: "Operator",
    });
    expect(option).toHaveValue("OPERATOR");
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run --prefix frontend test -- src/features/users/UserListPage
```

Expected: FAIL (cell text `OPERATOR`).

- [ ] **Step 3: Implement**

1. **`features/auth/types.ts`**: add after `ROLES`:

```ts
/** How each role is shown. One map, beside ROLES (D56). */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};
```

2. **`UserForm.tsx`**: delete the local `ROLE_LABEL`, and change the import to `import { ROLE_LABEL, ROLES, type Role } from "../../auth/types";`.
3. **`UserTable.tsx`**: import `ROLE_LABEL` from `../../auth/types`, and change `{user.role}` to `{ROLE_LABEL[user.role]}`.
4. **`UserCard.tsx`**: the same import, and change `<dd>{user.role}</dd>` to `<dd>{ROLE_LABEL[user.role]}</dd>`.
5. **`UserListPage.tsx`**: change `import { ROLES, type Role } from "../auth/types";` to `import { ROLE_LABEL, ROLES, type Role } from "../auth/types";`. In the role filter, change the option text `{role}` to `{ROLE_LABEL[role]}`. The option `value` stays `{role}`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run --prefix frontend test -- src/features/users
```

Expected: all pass. The existing `selectOptions(…, "OPERATOR")` calls match by value and keep working.

- [ ] **Step 5: Full suite, typecheck, lint**

```bash
npm run --prefix frontend test
```

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

Expected: all pass, 5 warnings.

- [ ] **Step 6: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add frontend/src/features/auth/types.ts frontend/src/features/users
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "fix: show role labels, not stored values, on the users screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 14: Documentation (spec §8)

**Files:**
- Modify: `README.md`, in three places: after the "### \"No assignee\" and \"not yours to choose\" are different (D65)" section and before "## Deliberate overrides of AGENTS.md"; the "### Accepted risks" table; and the end of "## GenAI prompt and validation record".

- [ ] **Step 1: Add the decisions section**

Insert before `## Deliberate overrides of AGENTS.md`:

```markdown
### Fixes from the QA report (D66–D78)

A browser QA pass (`docs/qa/2026-10-07-frontend-qa-report.md`) found fourteen issues; the
design is `docs/superpowers/specs/2026-10-07-qa-fixes-iteration-5-design.md`. Each fix has a
test that failed first.

- **An Admin cannot act on their own account (D66).**
  - Deleting yourself is refused by an object permission, `IsNotSelf`: **403
    `cannot_delete_self`**, the same layer and shape as D27's `delete_requires_creator`.
  - Changing your own role, or deactivating yourself, is refused by the service: **400
    `cannot_change_own_access`**, a field-level refusal like `assignee_immutable`. The service
    compares against the current values rather than testing for presence, because the edit
    page always sends both fields.
  - The UI hides Deactivate on your own row and shows your role read-only.
  - Two Admins can still remove each other; see Accepted risks.
- **The task table shows its sort (D67, D68).** One sort model, `features/tasks/sorting.ts`,
  serves the headers, the mobile select and URL validation. The default, newest first, is
  marked like any other order. Headers carry `aria-sort` and a ▲/▼; buttons name the action
  they will take.
- **Phones and tablets can sort, and get cards below `lg` (D69).** At `md` the table's six
  columns did not fit, so badges and actions wrapped. This departs from design spec §11.6's
  "below `md`" for the task table only; the users table keeps `md`.
- **Back to tasks returns to the same list (D70).** List links leave the list's search in the
  router's history state; detail, edit and create forward it, validated like a URL. A deep link
  falls back to the plain list.
- **Not-found pages explain and lead back (D71, D72).** A shared `NotFoundPanel`; the router
  uses `notFoundMode: "root"` with a `defaultNotFoundComponent` inside the app frame. A
  task 404 never says whether the task was deleted or is someone else's.
- **Unknown statuses and orderings are dropped from the URL (D73).**
- **No route loads while auth is still loading (D74).** `router.invalidate()` loads, and a
  load before the session was known mounted the page and fetched its data before the
  redirect. The test harness had copied the effect by hand; both now share
  `useRouterAuthSync`.
- **Focus moves to the first error after a failed submit (D75).**
- **Due dates show as the UTC day the form edits, with no time (D76).** A seeded due date
  carrying a real time shows its UTC day.
- **The current menu item is marked, and header targets are 44 px (D77).**
- **An impossible date range is explained, not hidden (D78).**
```

- [ ] **Step 2: Add the accepted-risk row**

Add this row to the end of the "### Accepted risks" table:

```markdown
| **Two Admins can remove each other** | D66 stops an Admin acting on their own account, but a "last active Admin" rule was declined: one Admin can deactivate another, who could have done the same. With no restore endpoint (D20), recovering from zero Admins needs shell access (`createsuperuser`). | A service check that refuses to deactivate, delete or demote the last active Admin, under a row lock so two concurrent requests cannot both pass it. |
```

- [ ] **Step 3: Extend the GenAI record**

Append to the end of "## GenAI prompt and validation record":

```markdown
**QA fixes (iteration 5).** A Playwright pass produced the QA report; brainstorming turned it
into a spec, and a spec review caught four claims that would have failed at implementation:

- a not-found component wrapped in the app frame would have rendered a **second** header for
  `/tasks/a/b`, because TanStack's default "fuzzy" not-found mode renders it inside the shell;
- the bootstrap regression test would have exercised the test harness's **hand copy** of the
  effect, not the app's;
- the URL whitelist commit needed a module the next commit created;
- the timezone test's example input did not cross midnight, so the bug it targeted would have
  passed it.

Root causes were confirmed in the installed router source (`invalidate()` ends in `load()`)
rather than assumed.
```

- [ ] **Step 4: Check the README renders sensibly**

```bash
grep -n "D66\|D78\|Two Admins can remove each other\|QA fixes (iteration 5)" README.md
```

Expected: one hit per inserted section, and D66 also inside the new section.

- [ ] **Step 5: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add README.md
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "docs: record the QA fixes (D66-D78) and the accepted last-Admin risk" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 15: Verify, then re-test in the browser (spec §7.3–§7.4)

**Files:**
- Modify: `docs/qa/2026-10-07-frontend-qa-report.md` (append a section)
- Create: `docs/qa/screenshots/iter5-*.png`

- [ ] **Step 1: All gates, from a clean state**

```bash
bash scripts/run-backend-tests.sh
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

```bash
npm run --prefix frontend typecheck
```

```bash
npm run --prefix frontend lint
```

```bash
npm run --prefix frontend test
```

Expected:

- backend all pass at `100.00%`;
- ruff, format and mypy clean;
- typecheck clean;
- lint at **5** warnings;
- frontend all pass.

Record the test counts; the report needs them.

- [ ] **Step 2: Make sure the stack serves this branch**

```bash
docker compose ps
```

The `frontend` service polls for changes (D59), but restart it to be certain it serves the current files:

```bash
docker compose restart frontend
```

The backend runs `runserver` with a bind mount, so it reloads on its own. If not, `docker compose restart backend`.

- [ ] **Step 3: Replay each finding in Playwright MCP**

Against `http://localhost:5173`, with the demo credentials from the README (`DemoPass!2026`). Mind the login throttle, 5 attempts per minute.

| Finding | Check | Pass when |
|---|---|---|
| F1 | Admin: `/users?search=admin%40demo.local`; open own edit form | no Deactivate on own row; Role read-only; no Active checkbox |
| F2 | `/tasks/new`, submit empty | `document.activeElement.id === "title"` |
| F3 / F8 | Supervisor `/tasks` at 360, 768, 1024 | cards plus "Sort by" at 360 and 768; table at 1024; no horizontal overflow |
| F4 | `/tasks/<deleted id>`, `/does-not-exist`, `/tasks/a/b` | "Task not found" / "Page not found" with a working link; exactly one `nav[aria-label=Main]`; no console warning |
| F5 | `/tasks?status=["PENDING"]&page=3&ordering=-due_date` → open a task → Back to tasks | URL restored exactly |
| F6 | `/tasks`, then click Due date | `th[aria-sort]` values change; ▲/▼ visible |
| F7 | `/dashboard`, `/tasks` | the active link has a visible bottom border |
| F9 | Due after later than Due before | inline message under the dates |
| F10 | `/tasks?status=["BOGUS"]` | normal unfiltered list, no alert |
| F11 | log out; record network for an anonymous `/dashboard` | only `POST /auth/refresh/` before `/login` |
| F12 | a task with a due date | detail shows a date with no time |
| F13 | Admin `/users` | the Role column shows "Operator" |
| F14 | measure the nav links and Sign out | height ≥ 44 px |

Save screenshots to `docs/qa/screenshots/` as:

- `iter5-sort-header-1280.png` (F6);
- `iter5-tasks-cards-768.png` (F3/F8);
- `iter5-nav-active-1280.png` (F7);
- `iter5-not-found-1280.png` (F4).

Clean up any QA data you create (soft-delete test tasks), and list it in the report.

- [ ] **Step 4: Append the re-test to the QA report**

Append to `docs/qa/2026-10-07-frontend-qa-report.md` a section `## 7. Re-test (iteration 5)` with:

- the commit hash;
- a table `| ID | Fixed | Evidence |` with one row per F1–F14, giving the check from Step 3 and its observed result;
- the Step 1 test counts and coverage;
- the new screenshots, linked by file name;
- any data side effects.

Mark a finding **fixed** only if Step 3 observed it fixed. Report anything else as-is.

- [ ] **Step 5: Commit**

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem add docs/qa
```

```bash
git -C /d/VirtualWrapper/code/TaskManagementSystem commit -m "docs: re-test the QA findings after iteration 5" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand back**

Do not merge or push. Report back with:

- the branch name, `fix/iteration-5`;
- its commits;
- the final test counts;
- any finding not observed fixed;
- whether Task 10's dialog probe required the dialog change.
