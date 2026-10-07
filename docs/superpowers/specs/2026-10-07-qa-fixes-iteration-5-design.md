# Iteration 5: QA Report Fixes — Design Specification

**Date:** 2026-10-07
**Builds on:** [2026-10-06-list-navigation-design.md](2026-10-06-list-navigation-design.md), and on
iteration 4 (D59–D65, recorded in `README.md`)
**Source:** [`docs/qa/2026-10-07-frontend-qa-report.md`](../../qa/2026-10-07-frontend-qa-report.md)
**Branch:** `fix/iteration-5`, off `main` at `36ec3bc`
**Status:** approved in brainstorming. Pending written-spec review.

---

## 1. Scope

This iteration fixes all fourteen findings of the 2026-10-07 browser QA pass, including the two
Info items. I traced each one to its cause in the code before designing a fix.

| # | Sev. | Finding | Root cause |
|---|---|---|---|
| F1 | Medium | An Admin can deactivate, delete or demote their own account | `UserService.update` / `delete` (`apps/users/services.py:40-67`) and `UserViewSet` have no self check; `UserTable`, `UserCard` and `UserForm` offer every control on the actor's own row |
| F2 | Medium | Focus drops to `<body>` after a failed submit | The submit `Button` is `disabled` while in flight; disabling the focused element blurs it, and nothing moves focus once errors render |
| F3 | Medium | No sorting below `md` | The only sort controls are `TaskTable`'s `<thead>` buttons; `TaskCard` has none |
| F4 | Low | Not-found states are dead ends | `TaskDetailPage`, `TaskEditPage` and `UserEditPage` render the raw `ApiError` message with no link; the router has no `notFoundComponent`, so TanStack's bare `<p>Not Found</p>` renders outside the shell and logs a warning |
| F5 | Low | "Back to tasks" discards list state | `TaskDetailPage` links to a fixed `to="/tasks"`, and the post-delete `navigate` does the same |
| F6 | Medium | Sort column and direction are never shown | `TaskTable` receives `ordering` (`TaskTable.tsx:31`) but only feeds it to `nextOrdering`; the header render never reads it, and no `<th>` carries `aria-sort` |
| F7 | Low | Active nav item not visually marked | `AppShell`'s `Link`s pass a fixed `className` and no `activeProps`; TanStack adds `aria-current` and an `active` class that nothing styles |
| F8 | Low | Task table cramped at 768–1023 px | Six columns plus two action buttons need about 850 px; `md` gives about 750 |
| F9 | Low | An inverted date range silently shows an empty list | `TaskFilters` commits each bound independently and never compares them |
| F10 | Low | `?status=["BOGUS"]` reaches the API and shows "Invalid input." | `validateTaskListSearch` uses `asArray` (`search-params.ts:29`), which accepts any string |
| F11 | Low | An anonymous deep link mounts the page and fires its query before redirecting | **Confirmed:** `RoutedApp`'s effect calls `router.invalidate()` while `auth.isLoading` is still true. `invalidate` ends in `this.load()` (`@tanstack/router-core` `router.js:554`), `guard()` returns early while loading, and the page's matches are committed. When `RouterProvider` mounts, it renders them, and the page fetches before the second invalidate redirects |
| F12 | Low | Date-only due dates show an invented time | The form stores `${day}T12:00:00Z`; `TaskDetailPage` renders it with `toLocaleString()`. Lists use local `toLocaleDateString()`, which can shift the day for viewers far from UTC |
| F13 | Info | Users screens show `OPERATOR`, the form shows "Operator" | `ROLE_LABEL` is private to `UserForm`; `UserTable`, `UserCard` and the role filter print the raw value |
| F14 | Info | Header nav targets are 20 px tall | Text-only links and button with no padding |

### 1.1 Choices made by the project owner

- **Scope:** all of F1–F14. Out of scope: the report's incidental notes (test JWT key length,
  jsdom `scrollTo` noise, status sort order, null due dates sorting first).
- **F1 policy: self-actions only.** An Admin may not deactivate, delete or demote their own
  account. A "last active Admin" rule was considered and declined, so two Admins can still remove
  each other (§9).
- **F5: location state.** The list's search travels in the router's history state.
- **F8: cards below `lg`.** The task list switches to cards below 1024 px instead of 768 px.
- **Delivery:** one branch and one commit per finding, each with a test that fails first.

---

## 2. Decision log

Continues from D65.

| # | Decision | Rationale |
|---|---|---|
| D66 | **An Admin cannot act on their own account.** Self-delete is refused by a new `IsNotSelf` object permission (**403** `cannot_delete_self`). A PATCH that would *change* the actor's own `role` or set their own `is_active` to false is refused by `UserService.update` (**400** `cannot_change_own_access`). The UI hides Deactivate on the actor's own row and renders Role and Active read-only on their own edit form. | Recovering a locked-out system needs shell access, because there is no restore endpoint (D20). The two status codes follow §7.3's layering: "may you do this to this row?" is the object-permission layer (403, like D27's `delete_requires_creator`), while "this field is not yours to set" is field validation (400, like `assignee_immutable`). The service compares against the current values, not field presence, because `UserEditPage` always sends `role` and `is_active`. |
| D67 | **One sort model, `features/tasks/sorting.ts`, owns the orderings, the default and the toggle.** `DEFAULT_ORDERING = "-created_at"` mirrors the API default (spec §8.3), so "no parameter" is shown as what it is. | The table, the mobile select and URL validation must agree on one list. A second copy is how they would drift. |
| D68 | **The table shows its sort state:** `aria-sort` on every sortable `<th>`, a ▲/▼ glyph and stronger style on the active one, a faint ↕ on the others. Button names describe the action they will take. | F6. An invisible toggle is a guess, and a screen reader got nothing. |
| D69 | **Below `lg` the task list renders cards plus a "Sort by" `<select>`;** the table starts at `lg`. The Users list keeps `md`. | F3 and F8. This **overrides spec §11.6** ("the task table collapses to stacked cards below `md`") for this one table: at `md` the six columns do not fit (chosen by the project owner). The Users table has five short columns and fits. |
| D70 | **Links from the task list carry its search in history state (`tasksSearch`).** Detail, edit and create forward it, and every "back to the list" path uses it, after running it through `validateTaskListSearch`. Without state, `/tasks` is the fallback. | F5. It is explicit (no hidden global), survives a reload of the same tab, and degrades cleanly for deep links. A React-context memory and `history.back()` were rejected (§5.1). |
| D71 | **A shared `NotFoundPanel` handles every not-found state;** the router's `defaultNotFoundComponent` renders it inside a `ShellLayout` extracted from `AppShell`. | F4. A not-found page should keep the user inside the app and offer the way back. The router option is the framework's mechanism (AGENTS.md principle 12) and removes TanStack's console warning. |
| D72 | **The 404 message never says *why*:** "It may have been deleted, or it isn't assigned to you." | §7.2 rule 5: a 404 must not confirm that a row exists. |
| D73 | **`validateTaskListSearch` keeps only known statuses and orderings.** `TASK_STATUSES` is exported once from `features/tasks/types.ts`. | F10. This completes D48 for the two parameters it missed, and repeats D56's single-export move for `ROLES`. |
| D74 | **`RoutedApp` does not invalidate the router while auth is loading.** | F11. `invalidate()` *loads*, and loading against a still-loading context commits matches the guard never judged. The first real load is `RouterProvider`'s own, with the settled context. |
| D75 | **After a failed submit, focus moves to the first `aria-invalid` field, or else to the form's alert** (`useFocusFirstError`). | F2. The errors were announced but unreachable without hunting. A failure counter makes a repeat failure with the same errors refocus. |
| D76 | **Due dates render as the UTC calendar date with no time** (`formatDueDate`). `created_at` and `completed_at` stay in local time. | F12. The form edits exactly the UTC day (`due_date.slice(0, 10)`) and stores noon UTC, so every viewer sees the day the form would let them edit. The trade-off: a seeded due date carrying a real time shows its UTC day. |
| D77 | **The active nav link is marked with a 2 px bottom border, and header targets are at least 44 px tall.** | F7 and F14. `activeProps` is TanStack's own mechanism. Moving the header's vertical padding into the targets keeps its height about the same. |
| D78 | **An inverted date range is explained, not prevented:** an inline message and `aria-invalid` on Due before, plus `min`/`max` on the pickers. The URL still holds what was entered. | F9. The URL stays the single source of truth (D45); the message explains the empty result instead of hiding it. |

F13 needs no decision of its own: `ROLE_LABEL` moves beside `ROLES`, following D56.

---

## 3. Backend — self-actions (F1, D66)

### 3.1 Self-delete: an object permission

`apps/core/permissions/classes.py` gains:

```python
class IsNotSelf(BasePermission):
    """An Admin may not delete their own account (D66). Object-level, like IsTaskCreator:
    the row is visible, the action on it is refused."""

    def has_object_permission(self, request, view, obj) -> bool:
        if obj.pk == request.user.pk:
            # Raised, not returned: returning False would emit DRF's generic code (§8.7).
            raise PermissionDenied(
                detail="You cannot delete your own account.", code="cannot_delete_self"
            )
        return True
```

`UserViewSet` gains a `get_permissions` that returns `[RolePermission(), IsNotSelf()]` for
`destroy` and the default otherwise. This is the same shape as `TaskViewSet.get_permissions` for
`IsTaskCreator`.

### 3.2 Self-demotion and self-deactivation: a service rule

`apps/users/services.py` gains an `ApplicationError`:

```python
class CannotChangeOwnAccess(ApplicationError):
    default_detail = "You cannot change your own role or deactivate your own account."
    default_code = "cannot_change_own_access"
    status_code = 400
```

At the top of `UserService.update`, before any field is applied:

```python
if user.pk == actor.pk:
    fields = data.model_fields_set
    if ("role" in fields and data.role != user.role) or (
        "is_active" in fields and data.is_active is False
    ):
        raise CannotChangeOwnAccess
```

It checks for a **change**, not for presence. `UserEditPage` always sends `role` and
`is_active`, so an Admin saving their own name with `role=ADMIN, is_active=true` must still
succeed. Names and password stay editable.

### 3.3 Error contract

The §8.7 tables gain two rows. They are recorded in the README's error-code list, not in the
original spec, as in iterations 3 and 4:

| Code | Status | Layer | Raised when |
|---|---|---|---|
| `cannot_delete_self` | 403 | object permission | an Admin deletes their own account |
| `cannot_change_own_access` | 400 | service validation | an Admin changes their own role or sets their own `is_active` to false |

### 3.4 UI mirror (presentation only)

- `UserTable` and `UserCard` take a `currentUserId` prop from `UserListPage`
  (`useAuth().user?.id`) and omit **Deactivate** on that row. **Edit** stays.
- `UserForm` in edit mode for the actor's own account (`user.id === currentUser.id`) renders Role
  as text and omits the Active checkbox. One line explains it: "You can't change your own role or
  deactivate your own account." This is the same pattern as TaskForm's terminal-status line. It
  still submits `role` and `is_active` unchanged, which the service accepts (§3.2).
- `UserForm` maps `cannot_change_own_access` to the form-level alert, as it does for any non-field
  code.

---

## 4. Sorting and the list layout (F6, F3, F8; D67–D69)

### 4.1 `src/features/tasks/sorting.ts`

```ts
export const SORT_FIELDS = [
  { field: "due_date", label: "Due date" },
  { field: "status", label: "Status" },
  { field: "created_at", label: "Created" },
] as const;
export type SortField = (typeof SORT_FIELDS)[number]["field"];
export type SortDirection = "ascending" | "descending";

export const DEFAULT_ORDERING = "-created_at"; // the API's default, spec §8.3

/** undefined → the default, so the default is displayed like any other order. */
export function parseOrdering(ordering: string | undefined): { field: SortField; direction: SortDirection };
/** A click on `field`: flips it if it is the active field, else starts ascending. */
export function nextOrdering(current: string | undefined, field: SortField): string;
/** The six values the UI writes; anything else is dropped by validateSearch (D73). */
export function isOrdering(value: unknown): value is string;

/** The mobile select's options, in display order. */
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date, earliest first" },
  { value: "-due_date", label: "Due date, latest first" },
  { value: "status", label: "Status, A–Z" },
  { value: "-status", label: "Status, Z–A" },
];
```

`nextOrdering` moves here from `TaskTable.tsx`. Because it now reads the **resolved** order, the
first click on **Created** with no parameter gives `created_at`: ascending, because the list is
already newest-first. The header shows the flip, so it no longer looks random.

### 4.2 `TaskTable` headers (F6, D68)

For each entry in `SORT_FIELDS`, `const active = parsed.field === field`:

- `<th aria-sort={active ? parsed.direction : "none"}>`.
- Label plus an `aria-hidden` glyph: ▲ (ascending) / ▼ (descending) when active, a
  `text-slate-300` ↕ otherwise.
- The active label is `text-slate-900 font-semibold`; inactive labels keep today's style.
- The button's `aria-label` describes the next action:
  - active: `"Due date, sorted ascending. Sort descending"`;
  - inactive: `"Status. Sort ascending"`.

  Existing tests that query `/sort by due date/i` change to these names. That is a budgeted
  change.

### 4.3 `TaskSortSelect` (F3)

`src/features/tasks/components/TaskSortSelect.tsx` is a `<label>` "Sort by" plus a `<select>`
tied by `useId`. Its value is `filters.ordering ?? DEFAULT_ORDERING`, its options are
`SORT_OPTIONS`, and `onChange(ordering)` writes `ordering` through `TaskListPage`'s existing
`editSearch`: replace, `resetScroll: false`, page reset.

Picking "Newest first" writes `undefined`, not `"-created_at"`, so the URL stays canonical
(D48).

### 4.4 Breakpoint (F8, D69)

`TaskListPage`:

- The table wrapper changes from `hidden overflow-x-auto md:block` to
  `hidden overflow-x-auto lg:block`.
- The card stack changes from `md:hidden` to `lg:hidden`, and renders `TaskSortSelect` above the
  cards.

`TaskCard`'s and `TaskTable`'s comments citing "below `md`" are updated to `lg` and D69.
`UserListPage` is unchanged.

---

## 5. Navigation and routing (F5, F4, F7, F10, F11; D70–D74, D77)

### 5.1 List state in history state (F5, D70)

**Rejected alternatives.** A React context remembering the last list search adds app-wide hidden
state and is lost on reload. `router.history.back()` cannot tell where "back" leads after an
edit/save round-trip or a deep link.

**Typing.** `src/app/history-state.ts` declares:

```ts
declare module "@tanstack/react-router" {
  interface HistoryState {
    tasksSearch?: TaskListSearch;
  }
}
```

**Writers.** Every link that leaves the list carries `state={{ tasksSearch: search }}`:

- the title link in `TaskTable` and `TaskCard`, which gain a `listSearch: TaskListSearch` prop
  from `TaskListPage`;
- the list header's **New task** `ButtonLink`.

**Reader.** `src/features/tasks/hooks/useTasksBackSearch.ts`:

```ts
/** The list search to return to: the state a list link left, validated like a URL (D73).
 *  {} when there is none, which means plain /tasks. */
export function useTasksBackSearch(): TaskListSearch;
```

It reads `useLocation().state.tasksSearch` and returns
`validateTaskListSearch(state ?? {})`. History state is as hand-editable as a URL.

**Consumers and forwarding.**

| Where | Change |
|---|---|
| `TaskDetailPage` | **Back to tasks** uses `search={back}`. Post-delete `navigate({ to: "/tasks", search: back })`. The **Edit** link forwards `state={{ tasksSearch: back }}` |
| `TaskEditPage` | Save and Cancel navigate to the detail page with `state: { tasksSearch: back }` |
| `TaskCreatePage` | The redirect to the new task forwards `state: { tasksSearch: back }`. Cancel goes to `/tasks` with `search: back` |
| `NotFoundPanel` on task pages | its link uses `back` (§5.2) |

Dashboard links and the nav "Tasks" link carry no state, so they keep opening `/tasks` as
today.

### 5.2 Not-found states (F4, D71, D72)

**`src/components/NotFoundPanel.tsx`**

```ts
interface NotFoundPanelProps {
  title: string;               // "Task not found"
  message: string;             // one sentence
  linkTo: string;              // "/tasks", "/users", "/", "/login"
  linkLabel: string;
  linkSearch?: Record<string, unknown>;
}
```

It renders a white card with an `h1`, the message, and a secondary `ButtonLink`.

**Detail and edit pages.**

- When `error instanceof ApiError && error.status === 404`: render
  `NotFoundPanel("Task not found", "It may have been deleted, or it isn't assigned to you.", "/tasks", "Back to tasks", back)`.
- Any other error keeps today's alert and gains the same back link beneath it.
- `/tasks/not-a-uuid` reaches the API's `lookup_value_regex` 404 and takes the same path.
- `UserEditPage` mirrors this: "User not found", "They may have been deleted.", `/users`,
  "Back to users".

**Unknown URLs.**

- `AppShell`'s header and `<main>` wrapper are extracted into
  `src/app/layout/ShellLayout.tsx` (`{ children }`); `AppShell` becomes
  `<ShellLayout><Outlet /></ShellLayout>`.
- `createAppRouter` passes a `defaultNotFoundComponent` that reads `useAuth()`:
  - **signed in:** `<ShellLayout>` around `NotFoundPanel("Page not found", "There's nothing at this address.", "/", "Go to your home page")`. `/` already redirects to the role's landing page, so one link serves every role.
  - **signed out:** the bare panel linking to `/login`, "Sign in".
- The root route's title fallback ("Task Management System") applies; no new page title is added.

### 5.3 Active nav item (F7, D77)

Each nav `Link` in `ShellLayout` gets:

- `className`: `inline-flex min-h-11 items-center border-b-2 border-transparent text-sm font-medium text-slate-700`;
- `activeProps={{ className: "border-status-progress text-slate-900" }}`.

`activeOptions` keeps the default (prefix match), so "Tasks" stays marked on `/tasks/:id` and
`/tasks/new`. This section and §6.5 (F14) are one change to the same element.

### 5.4 URL whitelist (F10, D73)

- `features/tasks/types.ts` exports `TASK_STATUSES: TaskStatus[]` in display order.
  `TaskFilters`' private `STATUSES` is deleted in favour of it.
- `search-params.ts`:
  - **`asStatuses`:** applies `asArray`, keeps the values in `TASK_STATUSES`, and returns
    `undefined` when none survive.
  - **`ordering`:** `isOrdering(search.ordering) ? search.ordering : undefined`.
- `search-params.ts` would then import from `features/tasks`, as it already does from
  `features/auth` for `ROLES`.

### 5.5 Router bootstrap (F11, D74)

In `src/app/providers.tsx`:

```ts
useEffect(() => {
  // invalidate() LOADS (router-core), and while auth is loading guard() returns early —
  // so a load now would commit the page's matches unjudged, and the page would mount
  // and fetch before the redirect. RouterProvider's first load uses the settled context.
  if (auth.isLoading) return;
  void router.invalidate();
}, [router, auth.user, auth.isLoading]);
```

`isLoading` goes from true to false exactly once, so every later sign-in, sign-out or session
expiry still invalidates as today.

---

## 6. Forms and display (F2, F9, F12, F13, F14; D75–D78)

### 6.1 Focus after a failed submit (F2, D75)

`src/components/useFocusFirstError.ts`:

```ts
/** Attach `ref` to the <form>; call `signalFailure()` in the submit's catch. After the
 *  errors render, focus goes to the first [aria-invalid="true"] in the form, else to its
 *  [role="alert"]. A counter, so a repeat failure with identical errors refocuses. */
export function useFocusFirstError<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  signalFailure: () => void;
};
```

- Applied in `LoginPage`, `TaskForm` and `UserForm`. `AssigneeCombobox` already sets
  `aria-invalid`, so it is covered.
- `FormError` gains `tabIndex={-1}`, so it can take focus without becoming a Tab stop.
- **The dialogs.** `DeleteTaskDialog` and `DeleteUserDialog` also disable their buttons while in
  flight. During implementation, first check whether a *failed* confirm leaves focus outside the
  dialog:
  - **if it does:** after the error renders, focus moves to the dialog's error, which keeps
    `useModalDialog`'s trap meaningful, and a test is added;
  - **if it does not:** record that and change nothing.

### 6.2 Inverted date range (F9, D78)

In `TaskFilters`:

- `const inverted = after.draft !== "" && before.draft !== "" && after.draft > before.draft`
  (ISO days compare as strings).
- **When inverted:**
  - Due before gets `aria-invalid` and `aria-describedby` pointing at a `<p id=…>` below the date
    row: "“Due after” is later than “Due before”, so no task can match.";
  - the message uses the overdue text token, like field errors.
- `max={before.draft || undefined}` on Due after and `min={after.draft || undefined}` on Due
  before.
- Drafts still commit and the request still runs. The list shows its normal empty state under
  the message.

### 6.3 Due dates as dates (F12, D76)

`src/lib/dates.ts`:

```ts
/** A due date as the UTC calendar day — the day TaskForm edits — with no time (D76). */
export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { timeZone: "UTC" });
}
```

It is used by `TaskTable`, `TaskCard` and the detail page's Due date, which today uses
`toLocaleString()`. `created_at` (table) and `completed_at` (detail) are unchanged: they are real
moments, not days.

### 6.4 Role labels (F13)

`ROLE_LABEL: Record<Role, string>` moves from `UserForm` to `features/auth/types.ts`, beside
`ROLES`. `UserTable`, `UserCard`, the `UserListPage` role filter options and `UserForm` all use it.
The role filter's option *values* are unchanged.

### 6.5 Header touch targets (F14, D77)

- `ShellLayout`'s inner header row drops `py-3`.
- The nav links (§5.3) and **Sign out** get `inline-flex min-h-11 items-center` (44 px).
- The app-name span and email keep their text size and centre vertically through the row's
  `items-center`.
- Below `sm` the row still wraps, as today.

---

## 7. Testing

Each fix starts with a test that fails against `main` (the convention since iteration 3).

### 7.1 Backend (pytest)

| Test | Asserts |
|---|---|
| `test_services.py` | Self role change gives `CannotChangeOwnAccess`. Self `is_active=False` gives the same. Self update of names and password, with `role` and `is_active` unchanged, succeeds. Another Admin's role and `is_active` can still be changed |
| `test_api_users.py` | `DELETE /users/{self}/` gives 403 `cannot_delete_self` and the row is still live. `DELETE` of another user gives 204. `PATCH /users/{self}/` `{"role": "OPERATOR"}` gives 400 `cannot_change_own_access`. `PATCH /users/{self}/` `{"first_name": …, "role": "ADMIN", "is_active": true}` gives 200 |
| permission classes | `IsNotSelf` raises with the code; returns True for another row |

Coverage of `apps/` stays at 100 %.

### 7.2 Frontend (Vitest + RTL + MSW)

| Finding | Test |
|---|---|
| F1 | `UserListPage`: no Deactivate for the signed-in Admin's own row (table and card), present for others. `UserForm`: own account renders Role read-only and no Active checkbox; a `cannot_change_own_access` response shows the alert |
| F6 | `sorting.test.ts`: parse (incl. default), toggle, whitelist, options. `TaskListPage`: with no `ordering`, Created has `aria-sort="descending"`; after clicking Due date, it has `aria-sort="ascending"` and the next-action name. Others have `none` |
| F3 / F8 | The sort select shows "Newest first" by default; choosing "Due date, latest first" writes `ordering=-due_date` and resets the page. Wrapper classes are `lg:block` and `lg:hidden` (jsdom applies no CSS; layout is verified in §7.3) |
| F10 | `search-params.test.ts`: `["BOGUS"]` becomes `undefined`; `["PENDING","BOGUS"]` becomes `["PENDING"]`; an unknown `ordering` is dropped and a known one kept |
| F11 | `auth-routing.test.tsx`: an anonymous visit to `/dashboard` makes exactly one request (the refresh) and none to `/tasks/stats/`, then lands on `/login`. Must fail before §5.5 |
| F5 | From `/tasks?status=…&page=3`, open a task, click **Back to tasks**, and the URL search is restored. The same through Edit → Save and through Delete. Opening the detail page directly gives a link to plain `/tasks` |
| F4 | A detail 404 renders "Task not found" and a working back link; an edit 404 does the same; a user-edit 404 renders "User not found". An unknown path renders inside the shell with the home link. The setup's console guard proves the TanStack warning is gone |
| F7 / F14 | `AppShell.test.tsx`: the current route's link has `aria-current="page"` and the active border class; the others do not. Nav links and Sign out carry `min-h-11` |
| F2 | For `LoginPage`, `TaskForm` and `UserForm`: after a 400 with field errors, `document.activeElement` is the first invalid input; after an error with no field errors, it is the alert; a second identical failure refocuses |
| F9 | Inverted drafts render the message and `aria-invalid` on Due before; `min` and `max` mirror the other draft; a valid range shows no message |
| F12 | `dates.test.ts` with `TZ=America/Bogota` (Vitest `test.env`): `formatDueDate("2026-01-01T23:30:00Z")` gives the 1 Jan 2026 date string with no time. The detail page renders the due date without a time component |
| F13 | Table, card and filter show "Operator", not `OPERATOR` |

Budgeted changes to existing tests:

- sort-button names in `TaskListPage.test.tsx`;
- any assertion on raw role text in `UserListPage.test.tsx`;
- the `AppShell` tests where the header markup moves into `ShellLayout`.

### 7.3 Browser re-test (Playwright)

Against the running Compose stack, replay each finding's original check from the QA report,
plus F1's controls, as Admin, Supervisor, Operator and anonymous:

- **Layout widths:** 360, 768, 1024 and 1280 px for F3, F8, F7 and F14.
- **Request log:** the F11 deep link's network requests.

Append a "Re-test (iteration 5)" section to the QA report, marking each finding as fixed with
evidence and fresh screenshots for F6, F3/F8, F7 and F4.

### 7.4 Gates

- Backend: `bash scripts/run-backend-tests.sh` (coverage gate), `ruff check`,
  `ruff format --check`, `mypy`.
- Frontend: `npm run typecheck`, `npm run lint` (no new warnings), `npm run test`.

---

## 8. Delivery and documentation

**Branch** `fix/iteration-5` from `main`. One commit per finding, in this order, each leaving
every suite green:

1. F1 backend.
2. F1 UI.
3. F11.
4. F10.
5. F6.
6. F3 + F8.
7. F5.
8. F4.
9. F7 + F14.
10. F2.
11. F9.
12. F12.
13. F13.
14. Docs.
15. QA re-test report.

**Documentation:**

- `README.md` gains "Fixes from the QA report (D66–D78)", summarising each decision as the
  D59–D63 section does. It also gains the two error codes, the D69 override in the "Deliberate
  overrides" table, and the GenAI prompt record (root AGENTS.md §7).
- The original design spec is not edited.

---

## 9. Out of scope

- **A "last active Admin" rule.** Declined by the project owner. Two Admins can still deactivate
  each other, and the last one can be removed by another Admin who is then removed in turn.
  Recorded as an accepted risk in the README.
- **Status sort order.** Status sorts alphabetically by stored value (Cancelled, Completed,
  In progress, Pending), not by workflow order. A `Case`/`When` annotation could fix it.
- **Null due dates in a descending sort.** They sort first (Postgres `DESC NULLS FIRST`); a
  `nulls_last` expression in `TiebrokenOrderingFilter` could fix it.
- **Report side notes.** The 29-byte test JWT key warning, and jsdom's `scrollTo` noise.
- **Existing lint warnings.** The five `oxlint` warnings already present.
- **A task-specific page title.** "Review the brief · …" stays out of scope, as in the
  list-navigation spec §6.
- **Delete-dialog focus**, unless §6.1's check reproduces a problem.
