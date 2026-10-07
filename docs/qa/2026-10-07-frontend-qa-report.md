# Frontend QA Report — 2026-10-07

Browser-driven validation of the React SPA against the design specs in
`docs/superpowers/specs/`, plus a full run of the backend and frontend test suites with
coverage.

| | |
|---|---|
| **Commit** | `60ef0e1` (main, clean tree) |
| **Environment** | Docker Compose stack (backend, worker, beat, db, redis, mailhog, frontend on `:5173`) |
| **Browser** | Chromium via Playwright MCP |
| **Viewports** | 360 (phone), 768 (tablet / `md`), 1024 (`lg`), 1280 (desktop) |
| **Roles exercised** | Admin, Supervisor, Operator, anonymous |
| **Dataset** | ~20 000 tasks, 505 users (a large `seed_demo_data` top-up was already present) |
| **Focus** | Responsive behaviour, form validation, navigability (per request) |

## 1. Summary

| Area | Checks | Pass | Findings |
|---|---|---|---|
| Automated tests — backend | 375 | 375 | — (100 % coverage of `apps/`) |
| Automated tests — frontend | 218 | 218 | — (93.25 % statements, 85.99 % branches) |
| Typecheck / lint (frontend) | 2 | 2 | 0 errors, 5 lint warnings |
| Navigability & routing | 39 | 33 | F3, F4, F5, F6, F10, F11 |
| Form validation | 34 | 31 | F2, F9, F12 |
| Responsive behaviour | 40 | 37 | F3, F7, F8 |
| Role gating & authorization UX | 18 | 17 | F1 |

**No blocker was found.** Every spec'd feature behaves as designed. Every dashboard tile
drills through to a list showing exactly its own number. URL-driven list state, pagination and
the dialogs work as specified. No page overflows horizontally at any tested width.

The findings are polish and robustness gaps. The four Medium ones are worth acting on first:

- **F1**: an Admin can deactivate or demote their own account, with nothing stopping the last
  Admin from doing so.
- **F2**: on every form, a failed submit drops keyboard focus to `<body>`.
- **F3**: phones have no way to sort the task list.
- **F6**: the task table never shows which column is sorted, or in which direction.

## 2. Findings

Severity: **Medium** = real user impact, should be fixed. **Low** = polish / edge case.
**Info** = observation, no action required.

| ID | Sev. | Area | Finding |
|---|---|---|---|
| F1 | Medium | Authorization UX | Admin can deactivate / demote / delete **their own** account (and the last Admin) |
| F2 | Medium | Forms · a11y | Focus is lost to `<body>` after any submit that fails validation |
| F3 | Medium | Responsive | No way to sort the task list below `md` (card layout has no sort control) |
| F4 | Low | Navigability | Not-found states show raw API strings / a bare "Not Found" with no way back |
| F5 | Low | Navigability | "Back to tasks" link discards the list's filters, page and sort |
| F6 | Medium | Navigability · a11y | Task table never shows which column is sorted, or in which direction |
| F7 | Low | Navigability | Active nav item has `aria-current` but no visual distinction |
| F8 | Low | Responsive | Table is cramped at 768–~900 px: status pill wraps, actions stack |
| F9 | Low | Forms | Inverted due-date range (after > before) silently returns an empty list |
| F10 | Low | Navigability | Unknown `status` in the URL is not stripped and yields a generic "Invalid input." |
| F11 | Low | Routing | Anonymous deep-link to a protected page fires that page's API call before redirecting |
| F12 | Low | Display | Date-only due dates are shown with an invented time on the detail page |
| F13 | Info | Display | Users table/filter show raw role enums (`OPERATOR`) while the form shows "Operator" |
| F14 | Info | a11y | Header nav links / Sign out are 20 px tall |

### F1 — Admin can lock themselves out (Medium)

- **Observed:** on `/users`, the Admin's own row (`admin@demo.local`) offers **Deactivate**, and
  the edit form lets them clear "Active" or change their own role.
- **Code:** `UserService.update` and `UserService.delete`
  (`backend/apps/users/services.py:40-67`) have no `user == actor` or "last active Admin" guard.
- **Impact:** a single click can leave the system with no Admin. Nothing in the API can restore
  it (there is no restore endpoint), so recovery needs shell access.
- **Not exercised live**, to avoid locking out the demo account. Confirmed from the code path and
  the rendered controls.
- **Suggested fix:** reject self-deactivation, self-deletion and self-demotion in the service, and
  refuse to remove the last active Admin. Hide those controls on the actor's own row as UX
  mirroring (as D27 does for task delete).

### F2 — Focus lost after a failed submit (Medium)

- **Observed:** after submitting `/tasks/new` empty, `document.activeElement` is `<body>`. The
  same submit-button pattern is used on Login, TaskForm and UserForm.
- **Cause:** the submit button is `disabled` while the request is in flight. Disabling the
  focused element blurs it, and nothing moves focus back once errors render.
- **Impact:** keyboard and screen-reader users lose their place. The field errors themselves are
  correctly wired (`aria-invalid` + `aria-describedby`), but nothing takes the user to them.
- **Suggested fix:** after a validation failure, focus the first `[aria-invalid=true]` field (or
  the `FormError` alert when no field error exists).

### F3 — No sorting on phones (Medium)

- **Observed:** at 360 px the task list renders `TaskCard`s; the three "Sort by …" buttons live
  only in `TaskTable`'s `<thead>`, which is `hidden` below `md`.
- **Impact:** a phone user cannot sort at all, except by hand-editing `?ordering=`. Spec §11.5
  lists sortable columns as a list feature and §11.6 requires every screen to work at mobile
  width.
- **Suggested fix:** a "Sort by" `<select>` shown below `md` that writes the same `ordering`
  search param.

### F4 — Dead-end not-found states (Low)

| URL | Renders |
|---|---|
| `/tasks/<deleted id>` or another Operator's task | `No Task matches the given query.` (raw DRF detail) |
| `/tasks/not-a-uuid` | `Not Found` |
| `/tasks/not-a-uuid/edit` | `Could not load that task.` |
| `/does-not-exist` | TanStack's default `<p>Not Found</p>`, **outside the app shell** (no header or nav), plus a console warning that no `notFoundComponent` is configured |

None of these offer a link back to a list or the landing page. The 404 status itself is
correct. An Operator gets 404, not 403, for another user's task, as required by §7.2 rule 5.

**Suggested fix:** a shared "not found" panel with a link to the role's landing page, used by
the detail and edit pages and set as the router's `defaultNotFoundComponent`.

### F5 — "Back to tasks" discards list state (Low)

From `/tasks?status=["PENDING"]&page=3&ordering=-due_date`, opening a task and clicking
**Back to tasks** lands on bare `/tasks`. **Browser Back** correctly restores the full URL, as the
list-navigation spec §4.5 promises. The in-app link is a fixed `to="/tasks"`, so the two
"back" affordances behave differently.

### F6 — No indication of sort column or direction (Medium)

*Also reported independently by the project owner during review.*

- **Observed:** the sort itself works. Clicking a header writes `?ordering=` and the rows reorder.
  But the header never changes. I loaded `/tasks` with five orderings: none, `due_date`,
  `-due_date`, `status` and `-created_at`. In every case the `<thead>` was **identical**:
  - same text (no arrow or icon);
  - same computed style on all three sort buttons (`font-weight 500`, `rgb(51,65,85)`, no
    underline);
  - `aria-sort` absent on every `<th>`.

  Compare `screenshots/sup-tasks-sort-none-1280.png` with
  `screenshots/sup-tasks-sort--due_date-1280.png`.
- **Cause:** `TaskTable` receives `ordering` (`TaskTable.tsx:31`) but uses it only to compute the
  next value in `nextOrdering`. Nothing in the header render (`TaskTable.tsx:44-54`) reads it.
- **Why it matters more than it first looks:**
  1. **The default order is invisible.** With no `ordering` param, the API sorts by
     `-created_at, -id` (spec §8.3, `apps/tasks/views.py:39`). The first click on **Created** sets
     `created_at` (ascending). The list flips to oldest-first and nothing explains why.
  2. **A toggle with no visible state is a guess.** Every click flips the direction, so a user who
     loses track can only infer it from the data.
  3. **Some orders look wrong when unlabelled.** Descending due date puts tasks with no due date
     first (Postgres `DESC NULLS FIRST`), so page 1 is a column of "—". Status sorts by the
     stored enum value, not by workflow order: ascending is Cancelled → Completed →
     In progress → Pending. Without a direction cue, both read as "sort is broken".
  4. **Screen readers get nothing.** There is no `aria-sort` and the button names stay
     "Sort by due date" in both directions.
- **Scope:** the Task table only. The Users table has no sorting. Below `md` there is no sort UI at
  all (F3).
- **Suggested fix:**
  - Have `TaskTable` derive `{field, direction}` from `ordering`, then:
    - set `aria-sort="ascending" | "descending"` on the active `<th>`, and `none` on the other
      sortable ones;
    - render a ▲/▼ glyph (`aria-hidden`) next to the active label, and give it a stronger style;
    - name the button for the action it will take, e.g. "Due date, sorted ascending. Sort
      descending".
  - Treat the no-param state as `-created_at` so the default is marked too.
  - A test in `TaskListPage.test.tsx` asserting `aria-sort` after a click would also cover today's
    uncovered header branch (`TaskTable.tsx` is at 66.7 % statement coverage).

### F7 — Active nav item not visually marked (Low)

TanStack `Link` sets `aria-current="page"` and an `active` class on the current nav item. The
computed styles of "Dashboard" and "Tasks" are identical, though (`rgb(51,65,85)`, weight 500, no
underline), so sighted users get no "you are here" cue.

### F8 — Cramped table at the `md` boundary (Low)

At 768 px (see `screenshots/sup-tasks-list-768.png`) the table fits without overflow, but:

- The "In progress" `StatusBadge` wraps onto two lines inside its rounded pill.
- **Complete** and **Delete** stack vertically, doubling row height.
- Assignee names wrap.

Adding `whitespace-nowrap` to the badge and the actions cell would fix it, as would moving the
table/card switch to `lg`.

### F9 — Inverted date range gives no feedback (Low)

Due after `2026-10-01` with Due before `2026-09-01` sends the request and shows "No tasks match
these filters." There is no hint that the range itself is impossible. A small inline message, or
`min`/`max` on the two date inputs, would avoid the confusion.

### F10 — Unknown status value in the URL (Low)

`?status=["BOGUS"]` is passed through by `asArray` (`src/app/search-params.ts:29`), the backend
400s, and the page shows a generic **"Invalid input."** alert with no table, no pager and no
checked box to explain why. The other hand-edited values (`page=-3`, `page_size=37`,
`overdue=maybe`, `role=BOGUS`, `is_active=maybe`, `page=0`) are all stripped cleanly, per D48.
Filtering `status` against the `TaskStatus` values would make it consistent. Recovery today is
"Clear filters", which works.

### F11 — Protected page mounts briefly for anonymous deep-links (Low)

Opening `/dashboard` anonymously produces `refresh → 401`, then `GET /tasks/stats/ → 401`, then a
second `refresh → 401`, before redirecting to `/login`. `/tasks`, `/tasks/:id` and `/users` behave
the same way. `/` produces only the single expected refresh failure (refinement-iteration-2 §4.3).
The end state is correct. The cost is two extra failing requests and a page component that
mounts and fetches before the guard runs.

**Likely cause (hypothesis, not confirmed):** the router is created once in
`RoutedApp` (`src/app/providers.tsx:36`) with the bootstrap-time context (`isLoading: true`).
`guard()` returns early when `isLoading`, so the initial load can run the guard against that
stale context. The redirect then comes from the `router.invalidate()` effect.

### F12 — Invented time on date-only due dates (Low)

The form stores a picked date as `${date}T12:00:00Z` (`TaskForm.tsx`). The detail page renders it
with `toLocaleString()`, so a user who picked "2020-01-01" sees **"1/1/2020, 7:00:00 AM"** (on a
UTC-5 machine). Lists use `toLocaleDateString()` and look right.

Inferred but not tested: viewers at UTC+12 or further east would see the list date move to the
next day, because noon UTC is past midnight there. Rendering the date part of the ISO string
(or formatting with `timeZone: "UTC"`) would fix both.

### F13 / F14 — Info

- **F13:** the users table, user cards and the Role filter show `ADMIN` / `SUPERVISOR` /
  `OPERATOR`, while `UserForm` uses the `ROLE_LABEL` map ("Admin", …).
- **F14:** header links and Sign out measure about 35–53 × 20 px. That passes WCAG 2.5.8 through
  its spacing exception (the header is 49 px tall with gaps), but it is below the 44 px
  touch-target guideline.

## 3. Validations performed

### 3.1 Authentication & session

| # | Check | Result |
|---|---|---|
| A1 | Anonymous `/`, `/dashboard`, `/tasks`, `/tasks/new`, `/tasks/:id`, `/users`, `/users/new` → redirect to `/login` | ✅ all 7 |
| A2 | Login: empty submit → field errors on email & password, `aria-invalid`, form alert | ✅ |
| A3 | Login: malformed email / wrong password → server message "No active account found…" (no enumeration) | ✅ |
| A4 | Login: throttle → "Too many attempts. Wait a minute and try again." (429 branch, spec §11.5) | ✅ |
| A5 | Keyboard: Tab from Email reaches Password; Enter submits | ✅ |
| A6 | Role landing: Admin → `/users`, Supervisor → `/dashboard`, Operator → `/dashboard` | ✅ |
| A7 | Authenticated visit to `/login` → redirected to landing | ✅ |
| A8 | Session survives full reload (refresh-cookie bootstrap) | ✅ |
| A9 | Sign out → `/login`; a protected route afterwards redirects | ✅ |
| A10 | Page titles per route (`Sign in · …`, `Dashboard · …`, `Tasks · …`, `New task · …`, `Task details · …`, `Edit task · …`, `Users · …`, `New user · …`, `Edit user · …`) | ✅ all 9 |
| A11 | Anonymous deep-link causes no extra requests | ⚠️ F11 |

Throttle note: with the configured `login: 5/min`, the 429 appeared on the **5th** attempt in
the window rather than the 6th. One attempt from before the run probably counted. I did not
investigate further.

### 3.2 Role gating (UX mirror of §7)

| # | Check | Result |
|---|---|---|
| R1 | Supervisor nav: Dashboard, Tasks. No Users | ✅ |
| R2 | Supervisor → `/users`, `/users/new` redirected to `/dashboard` | ✅ |
| R3 | Operator nav: Dashboard, Tasks. Operator → `/users*` redirected | ✅ |
| R4 | Admin nav: Users only. Admin → `/dashboard`, `/tasks`, `/tasks/new` redirected to `/users` | ✅ |
| R5 | Operator task list has no Assignee column | ✅ |
| R6 | Operator sees Delete only on tasks they created (3 of 20 rows on page 1) — D27 mirror | ✅ |
| R7 | Operator create/edit form has no Assignee field. A new task is self-assigned | ✅ |
| R8 | Operator opening another user's task → 404 message (no existence leak) | ✅ (message: F4) |
| R9 | Operator dashboard shows own figures (727 vs 20 001 global) | ✅ |
| R10 | Admin offered self-deactivation | ❌ F1 |

### 3.3 Dashboard

| # | Check | Result |
|---|---|---|
| D1 | Header "Dashboard" + **New task** → `/tasks/new` | ✅ |
| D2 | Seven cards are named groups. CTA accessible names are "View tasks — <label>" | ✅ |
| D3 | **Each card's number equals the drilled-through list's count** | ✅ 7/7 (All 20001, Pending 4999, In progress 4993, Completed 5009, Cancelled 5000, Overdue 3632, Due in 7 days 3179) |
| D4 | Drill-through pre-checks the matching filters (incl. due-soon → Pending + In progress + date range) | ✅ |
| D5 | Status distribution bar with labelled segments and legend | ✅ |

### 3.4 Task list — navigation & URL state

| # | Check | Result |
|---|---|---|
| L1 | Numbered pager `1 2 3 … 1001` with First/Prev/Next/Last | ✅ |
| L2 | Clicking "Page 2" → `?page=2`, range "21–40 of 20001", **focus stays on Page 2** (D53/D55) | ✅ |
| L3 | Last page: Next and Last disabled; window `1 … 998 999 1000 1001` | ✅ |
| L4 | Page moves push history: Back/Back/Forward walks 1000 → 1001 → 2 → 1001 | ✅ |
| L5 | Rows per page 50 → `?page_size=50`, page reset, 50 rows | ✅ |
| L6 | Sort toggles `ordering=due_date` ↔ `-due_date`, data reorders | ✅ |
| L6b | Header shows the active sort column and direction (visual + `aria-sort`), including the default `-created_at` | ❌ F6 |
| L7 | Status checkbox → `status=[…]`, page reset, page size kept | ✅ |
| L8 | Overdue only → `overdue=true` | ✅ |
| L9 | Due after/before drafts: not in URL at 150 ms, committed after the 300 ms quiet period (D50) | ✅ |
| L10 | Filter edits replace history: Back leaves the list rather than undoing each checkbox (D47) | ✅ |
| L11 | Clear filters drops filters & ordering, **keeps** `page_size` (D51) | ✅ |
| L12 | Empty state "No tasks match these filters." | ✅ |
| L13 | Out-of-range `?page=99999` → silently replaced with page 1 (D54) | ✅ |
| L14 | Junk `page=-3&page_size=37&overdue=maybe` → canonical `/tasks` (D48) | ✅ |
| L15 | Junk `status=["BOGUS"]` | ⚠️ F10 |
| L16 | Browser Back from a task detail restores filters + page + sort | ✅ |
| L17 | In-app "Back to tasks" link restores the same | ⚠️ F5 |
| L18 | Inline **Complete** on a pending row: row leaves the Pending list, count 4999 → 4998 | ✅ |
| L19 | Complete offered only on Pending / In progress rows | ✅ |
| L20 | Inverted date range feedback | ⚠️ F9 |

### 3.5 Task create / edit / detail / delete

| # | Check | Result |
|---|---|---|
| T1 | Create form fields: Title, Description, Due date, Assignee (Supervisor). **No Status** on create | ✅ |
| T2 | Empty title → "This field may not be blank.", `aria-invalid` on `#title` | ✅ |
| T3 | Whitespace-only title → same error | ✅ |
| T4 | Title capped at 200 characters (`maxLength`) | ✅ |
| T5 | Assignee combobox: opens with 21 options, `aria-expanded`, type-ahead search ("olga" → 1), Admins never offered, ArrowDown sets `aria-activedescendant`, Escape closes, Enter selects | ✅ |
| T6 | Combobox "no match" status text | ✅ |
| T7 | Create → redirected to the new task's detail page | ✅ |
| T8 | Past due date accepted and immediately flagged **Overdue** | ✅ (no rule forbids it) |
| T9 | Edit: status options = current + `allowed_transitions` (Pending, In progress, Cancelled). **Never Completed** (D39) | ✅ |
| T10 | Edit: changing the select does not shrink its options (D40 snapshot) | ✅ |
| T11 | Edit: blank title → field error | ✅ |
| T12 | Edit: unassign via "Unassigned" option persists | ✅ |
| T13 | Edit: Cancel → back to detail | ✅ |
| T14 | **Mark complete** → status Completed, completed-at timestamp shown | ✅ |
| T15 | Terminal task edit: read-only status badge + "Completed and cancelled tasks keep their status." | ✅ |
| T16 | Delete dialog: `role=dialog`, `aria-modal`, heading names the task, states no-restore | ✅ |
| T17 | Delete dialog: initial focus on Cancel, Tab and Shift+Tab trapped, Escape closes and **returns focus to the trigger** | ✅ |
| T18 | Delete dialog: Cancel keeps the task. Confirm deletes and navigates to `/tasks` | ✅ |
| T19 | Focus after failed submit | ❌ F2 |
| T20 | Date display on detail | ⚠️ F12 |

### 3.6 Users (Admin)

| # | Check | Result |
|---|---|---|
| U1 | List controls: Search, Role, Inactive only, Rows per page. Columns Name/Email/Role/Active/Actions | ✅ |
| U2 | Role filter → `?role=SUPERVISOR` (126) | ✅ |
| U3 | Inactive only → `is_active=false`, empty state | ✅ |
| U4 | Search is debounced: URL unchanged mid-typing, then `?search=olga` (1 result) | ✅ |
| U5 | No-match search → "No users match these filters." | ✅ |
| U6 | Junk `role=BOGUS&is_active=maybe&page=0` stripped. `page=9999` recovers to page 1 | ✅ |
| U7 | Create: empty submit → 4 field errors (email, first, last, password) | ✅ |
| U8 | Create: invalid email → "Enter a valid email address." | ✅ |
| U9 | Create: `123` → "too short … at least 8 characters". `password` → "too common" | ✅ |
| U10 | Create: duplicate email, **case-insensitive** (`OPERATOR@demo.local`) → field error on Email | ✅ |
| U11 | Create: whitespace-only first name rejected | ✅ |
| U12 | Create success → `/users` | ✅ |
| U13 | Edit: email read-only. Password labelled "leave blank to keep". "Active" checkbox present | ✅ |
| U14 | Edit save → `/users` | ✅ |
| U15 | Deactivate dialog: names the user, explains audit retention and no restore. Focus on Cancel | ✅ |
| U16 | Deactivate confirm → user removed from list | ✅ |

### 3.7 Responsive

Each page was loaded at 360, 768, 1024 and 1280 px and measured for horizontal overflow
(`scrollWidth > clientWidth`, plus any visible element past the viewport edge). I also checked
the layout switches the spec prescribes.

| Page | 360 | 768 | 1024 | 1280 | Layout checks |
|---|---|---|---|---|---|
| Login | ✅ | ✅ | — | ✅ | Centred card, `max-w-sm` |
| Dashboard | ✅ | ✅ | ✅ | ✅ | Tiles 2+2+2+1 below `lg`, 3+3+1 at `lg` (iteration-3 §5.3) ✅ |
| Task list | ✅ | ✅ | ✅ | ✅ | Cards below `md`, table at `md`+ ✅. Pager "Page 1 of 1001" below `sm`, numbers at `sm`+ ✅. Sort missing on mobile ❌ F3. Cramped at 768 ⚠️ F8 |
| Task new / edit | ✅ | ✅ | ✅ | ✅ | Full-width fields. Combobox listbox stays in viewport at 360 (33–313 px of 346), scrollable ✅ |
| Task detail | ✅ | ✅ | ✅ | ✅ | — |
| Delete dialog | ✅ | — | — | ✅ | Centred, fully visible at 360 × 780 ✅ |
| Users list | ✅ | ✅ | ✅ | ✅ | `UserCard`s below `md`, table at `md`+ (iteration-2 §5.2) ✅ |
| User new / edit | ✅ | ✅ | ✅ | ✅ | — |

Header: wraps to two rows below `sm` (77 px vs 49 px), with no overflow. Sign out drops to its own
line at 360 px, which works but looks awkward.

### 3.8 Console hygiene (§11.7 "no console errors or warnings")

Across the whole session the app logged **no JavaScript errors and no React warnings**. Every
console "error" was Chromium's network log of an expected 4xx (login 400/401/429, refresh 401,
validation 400). The only warnings were TanStack Router's missing-`notFoundComponent` notice on
`/does-not-exist` (F4).

## 4. Automated test suites

### 4.1 Backend — pytest

Run inside the Compose `backend` container with test settings (the same command
`scripts/run-backend-tests.sh` uses, without `-x`):

```
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q
```

**375 passed, 0 failed, 13 warnings in 27.4 s. Coverage 100.00 % (1071 / 1071 statements)**,
which clears the 80 % `--cov-fail-under` gate.

| App | Tests | Coverage |
|---|---|---|
| `core` (error contract, layering, permission matrix — 57 API matrix cases, UUIDv7, schema) | 100 | 100 % |
| `notifications` (dedupe, on-commit dispatch, recipients, overdue sweep, Celery tasks) | 53 | 100 % |
| `tasks` (API, complete, delete rules, stats, concurrency, DTOs, filters, query counts, services) | 118 | 100 % |
| `users` (auth, me, assignable, users API, seed command, security settings, services) | 104 | 100 % |
| **Total** | **375** | **100 %** |

Warnings: `InsecureKeyLengthWarning` from PyJWT. The test-settings signing key is 29 bytes, below
the 32 recommended for HS256. This only affects the test settings, but lengthening the test key
would silence it.

### 4.2 Frontend — Vitest + React Testing Library + MSW

```
npx vitest run --coverage --coverage.provider=v8 --coverage.include="src/**"
```

**218 passed, 0 failed, 17 files, 24.2 s.**

| Test file | Tests |
|---|---|
| `features/tasks/TaskForm.test.tsx` | 35 |
| `features/tasks/TaskListPage.test.tsx` | 31 |
| `app/search-params.test.ts` | 23 |
| `lib/pagination.test.ts` | 20 |
| `features/users/UserListPage.test.tsx` | 15 |
| `lib/api-client.test.ts` | 14 |
| `features/dashboard/StatsPage.test.tsx` | 13 |
| `app/page-titles.test.tsx` | 11 |
| `app/layout/AppShell.test.tsx` | 10 |
| `components/Pagination.test.tsx` | 9 |
| `features/auth/auth-routing.test.tsx` | 8 |
| `features/tasks/hooks/useTasks.test.tsx` | 8 |
| `lib/useSearchParamDraft.test.ts` | 7 |
| `features/auth/LoginPage.test.tsx` | 6 |
| `features/users/UserForm.test.tsx` | 5 |
| `components/Button.test.tsx` | 2 |
| `components/ButtonLink.test.tsx` | 1 |

**Coverage (v8)**

| Scope | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| **All files** | **93.25 %** | **85.99 %** | **92.35 %** | **95.07 %** |
| `src/app` | 98.64 | 96.49 | 100 | 100 |
| `src/components` | 97.18 | 88.67 | 100 | 100 |
| `src/lib` | 100 | 93.18 | 100 | 100 |
| `features/auth` | 94.33 | 58.33 | 93.33 | 95.91 |
| `features/dashboard` | 100 | 87.5 | 100 | 100 |
| `features/tasks` (pages) | 89.32 | 77.63 | 86.48 | 91.30 |
| `features/tasks/components` | 84.51 | 82.55 | 81.63 | 87.68 |
| `features/users` (pages) | 86.44 | 85.41 | 76.92 | 90.56 |
| `features/users/components` | 90.00 | 93.75 | 86.66 | 90.00 |

Lowest-covered files, which are also where several findings sit:

- `TaskTable.tsx`: 66.7 % statements. The sort header path is uncovered, which is also where F6
  sits.
- `UserCard.tsx`: 50 %.
- `StatusBadge.tsx`: 75 %.
- `AuthContext.tsx`: 33 % branches. This is the bootstrap path; see F11.

There is no numeric frontend coverage gate (spec §12.4).

Test noise: jsdom prints `Not implemented: Window's scrollTo() method` for each router
navigation that resets scroll. It is harmless, and a `window.scrollTo = () => {}` stub in
`src/test/setup.ts` would remove it.

### 4.3 Static checks (frontend)

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc -b --noEmit`) | ✅ clean |
| `npm run lint` (oxlint) | ✅ exit 0, **5 warnings**: 4 × `react(only-export-components)` (`StatusBadge.tsx`, `providers.tsx`, `AuthContext.tsx`, `test/render-app.tsx`), 1 × `react(immutability)` in `test/render-app.tsx` |

## 5. Side effects on the local database

The QA run wrote to the local Compose database (`taskmanagementsystem-db-1`):

| Record | Action | State now |
|---|---|---|
| Task "QA check — edited" | Created, edited, completed, deleted (Supervisor) | soft-deleted |
| Task "QA operator self-assigned task" | Created, deleted (Operator) | soft-deleted |
| User `qa.tester.20261007@demo.local` | Created, edited, deactivated (Admin) | soft-deleted |
| Task "Mt 1 task" (**pre-existing**, assigned to Omar Operator) | Marked **Completed** by the inline-complete check | Completed — terminal, cannot be reverted through the API |

## 6. Screenshots

Stored in [`screenshots/`](screenshots/). Naming is `<role>-<page>-<width>.png`.

| | 360 | 768 | 1280 |
|---|---|---|---|
| Login | `login-360.png` | `login-768.png` | `login-1280.png` |
| Dashboard | `sup-dashboard-360.png` | `sup-dashboard-768.png` | `sup-dashboard-1280.png` |
| Task list | `sup-tasks-list-360.png` | `sup-tasks-list-768.png` (F8) | `sup-tasks-list-1280.png` |
| Task new | `sup-task-new-360.png`, `sup-task-new-combobox-360.png` | `sup-task-new-768.png` | `sup-task-new-1280.png` |
| Task detail | `sup-task-detail-360.png` | `sup-task-detail-768.png` | `sup-task-detail-1280.png` |
| Task edit | `sup-task-edit-360.png` | `sup-task-edit-768.png` | `sup-task-edit-1280.png` |
| Task table sort (F6) | | | `sup-tasks-sort-none-1280.png` vs `sup-tasks-sort--due_date-1280.png` — identical headers |
| Delete dialog | `sup-delete-dialog-360.png` | | |
| Users list | `admin-users-list-360.png` | `admin-users-list-768.png` | `admin-users-list-1280.png` |
| User new | `admin-user-new-360.png` | | `admin-user-new-1280.png` |
| User edit | `admin-user-edit-360.png` | | `admin-user-edit-1280.png` |
