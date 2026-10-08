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

## 7. Re-test (iteration 5)

| | |
|---|---|
| **Commit** | `92d9391` (`fix/iteration-5`, clean tree) |
| **Environment** | Same Compose stack. `frontend` restarted before the run |
| **Browser** | Chromium via Playwright MCP, 1280 px unless stated |
| **Roles exercised** | Supervisor, Admin, anonymous |

### 7.1 Findings

| ID | Fixed | Evidence |
|---|---|---|
| F1 | ✅ | Admin `/users?search=admin%40demo.local`: own row offers only **Edit**. A peer row (`operator@demo.local`) still offers Edit and Deactivate. Same at 360 px (card). Own edit form: no Role select (Role shown as "Admin" with "You can't change your own role or deactivate your own account."), no Active checkbox. The API guards (403 `cannot_delete_self`, 400 `cannot_change_own_access`) were not exercised live: a failing guard would lock out the demo Admin. The backend suite covers them |
| F2 | ✅ | `/tasks/new`, submit empty → `document.activeElement.id === "title"` (`aria-invalid`, `aria-describedby="title-error"`). Delete dialog: with the DELETE answered 403 by a Playwright route (it never reached the server), the dialog stays open and focus is on its alert, inside the dialog |
| F3 / F8 | ✅ | Supervisor `/tasks`. **360**: cards plus "Sort by" (6 options, "Newest first" selected). Choosing "Due date, earliest first" writes `?ordering=due_date`. **768**: cards plus "Sort by", table hidden. **1024**: table, select hidden. 20 rows, no wrapped status pill, no stacked Complete/Delete. `scrollWidth === clientWidth` at all three (346 / 753 / 1010), no element past the right edge |
| F4 | ✅ | Deleted task `/tasks/01a116d3-…` (detail and `/edit`) and `/tasks/not-a-uuid` → "Task not found. It may have been deleted, or it isn't assigned to you." plus **Back to tasks** (→ `/tasks`, works). `/does-not-exist` and `/tasks/a/b` → "Page not found" plus **Go to your home page** (→ `/dashboard`, works). Every case: one `header`, exactly one `nav[aria-label=Main]`, no console warning (only Chromium's network line for the API 404). On `/tasks/a/b` and `/does-not-exist` nothing has `aria-current` |
| F5 | ✅ | From `/tasks?status=["PENDING"]&page=3&ordering=-due_date` (41–60 of 4998) → "Demo task 19117" → **Back to tasks** → `/tasks?status=["PENDING"]&ordering=-due_date&page=3`. Same parameters and values, 41–60 of 4998, Pending checked. Only the key order differs (the router's serialisation) |
| F6 | ✅ | Default `/tasks`: Created `aria-sort="descending"` with ▼ and weight 600. Due date and Status `none` with a faint ↕. Click Due date → `?ordering=due_date`, Due date `ascending` ▲, Created `none`. Click again → `-due_date`, `descending` ▼. Button names stay the plain label ("Due date"), per amended D68 |
| F7 | ✅ | `/dashboard`: Dashboard has `aria-current="page"` and a blue (`rgb(37,99,235)`) bottom border, Tasks a transparent one. `/tasks`: the reverse |
| F9 | ✅ | Due after `2026-10-01`, Due before `2026-09-01` → under the dates: "“Due after” is later than “Due before”, so no task can match." Due before has `aria-invalid="true"` and `aria-describedby` → the message. `max`/`min` set to the other date. URL keeps both dates, empty state shown |
| F10 | ✅ | `/tasks?status=["BOGUS"]` → URL becomes `/tasks`, 1–20 of 20001, no alert, no box checked |
| F11 | ✅ | Signed out, then loaded `/dashboard`: the only API request was `POST /api/v1/auth/refresh/` → 401, then `/login`. No `/tasks/stats/`, no second refresh |
| F12 | ✅ | "Demo task 30": detail shows Due date `9/28/2026` with no time. The list row shows `9/28/2026` and the edit form's date input holds `2026-09-28` |
| F13 | ✅ | Admin `/users`: the Role column shows "Admin" / "Supervisor" / "Operator". Role filter options are "All roles, Admin, Supervisor, Operator" |
| F14 | ✅ | Dashboard, Tasks and Sign out: computed `min-height: 44px`, `offsetHeight` 44. `getBoundingClientRect().height` reads 43.99, a sub-pixel artefact of this Chromium's `devicePixelRatio` (0.99999997). The same artefact shows the 2 px active border as 1.75 px. Header is 44.9 px tall (was 49) |

### 7.2 Gates

| Gate | Result |
|---|---|
| Backend pytest (Compose, test settings) | **384 passed**, 0 failed, 13 warnings (the PyJWT key-length warning from §4.1). Coverage **100.00 %** (1086 / 1086) |
| `ruff check` | ✅ clean |
| `ruff format --check` | ✅ 121 files already formatted |
| `mypy` | ✅ no issues in 109 source files |
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ exit 0, **5 warnings**, the same five as §4.3 |
| `npm run test` (Vitest) | **303 passed**, 0 failed, 19 files |

### 7.3 Screenshots

| File | Shows |
|---|---|
| `iter5-sort-header-1280.png` | F6: `?ordering=-due_date`, ▼ on Due date, ↕ on the others |
| `iter5-tasks-cards-768.png` | F3 / F8: cards plus "Sort by" at 768 px |
| `iter5-nav-active-1280.png` | F7: Dashboard marked active |
| `iter5-not-found-1280.png` | F4: "Page not found" inside the app shell |

### 7.4 Side effects and observations

No data was created, edited or deleted. The empty submit on `/tasks/new` was rejected (400). The
dialog-failure DELETE was answered in the browser and never reached the server; "Demo task 30"
still loads afterwards. The deleted-task id came from a read-only `psql` query. One login (Admin)
was used, and no throttle was hit.

Observations, not findings:

- **Back to tasks** carries `aria-current="page"` on a task's detail page and on the "Task not
  found" panel, because TanStack's fuzzy active match treats `/tasks/<id>` as inside `/tasks`.
  The same happens on the ordinary detail page, so it predates this iteration.
- Signing out while on "Page not found" keeps the anonymous version of the panel, with a
  **Sign in** link, instead of redirecting. That is reasonable for an unknown URL.

## 8. Re-test (TanStack refactor)

The refactor moved forms, tables and component state onto TanStack Form, Table and Store, with
no intended change in behaviour. This pass re-ran every check in §3, the §7.1 evidence for
F1–F14, and eight refactor-specific checks (Q1–Q8) in a real browser.

Q1–Q6 are spec §8's. Q7 (the sort header's cycle and history, D84) and Q8 (the Assignee list's
load-more on scroll) were added during the run, because the refactor rewrote both.

| | |
|---|---|
| **Commit** | `77e4aac` (`refactor/tanstack-form-table-store`, clean tree) |
| **Environment** | Compose stack for the API, worker, beat, db, redis and mailhog. The backend code is the main checkout's `wip` branch at `2386386`, an earlier commit of this branch. Its backend is identical to `main`'s backend (`git diff main 2386386 -- backend` is empty), which does not have this branch's D94 fix (`465a8fc`). The SPA was served by native Vite (`npm run dev`) from the refactor worktree, with the Compose `frontend` stopped. Baseline screenshots came from `main` at `3e110ce` (its `frontend/src` is identical to `59ce235`, the spec's baseline), served the same way from a temporary worktree |
| **Browser** | Chromium via Playwright MCP, 1280 px unless stated |
| **Roles exercised** | Admin, Supervisor, Operator, anonymous |
| **Dataset** | 20 001 tasks (Supervisor view), 503 visible users (two fewer than §3: users soft-deleted since, `user100@demo.local` and `user300@demo.local`, see §8.7) |

**Result: no regression from the refactor.** Every §3 check passes, including the eight rows of
§3.1–§3.6 that were ⚠️ or ❌ before iteration 5. All of F1–F14 are still fixed, and Q1–Q8 pass.
The screenshots match the baseline pixel for pixel on 18 of 21 page/width pairs. The other three
differ only by sub-pixel anti-aliasing (§8.6).

The re-test did find one **pre-existing** defect that the refactor carried over unchanged: after
a sign-out, the next user in the same tab is shown the previous user's cached query data (§8.4).
It is not fixed on this branch; it was fixed afterwards as D95 (§8.4).

### 8.1 Matrix

| Area | Checks | Pass | Notes |
|---|---|---|---|
| §3.1 Authentication & session | 11 | 11 | A11 (F11) now passes: each of the 7 anonymous deep-links sends exactly one request, `POST /auth/refresh/` → 401, then `/login`. A10: all 9 titles. A4: the 429 message appeared on the 6th sign-in request within the minute |
| §3.2 Role gating | 10 | 10 | R10 (F1) now passes. R6: Delete on 3 of 20 Operator rows. R9 passes on a fresh sign-in (727 of 20 001). After a same-tab user switch the first render shows the previous user's cached figures (§8.4) |
| §3.3 Dashboard | 5 | 5 | D3 7/7: All 20001, Pending 4998, In progress 4991, Completed 5012, Cancelled 5000, Overdue 3859, Due in 7 days 2950, each equal to its drilled-through list's "of N" |
| §3.4 Task list | 21 | 21 | L1–L20 plus L6b. L6b (F6), L15 (F10), L17 (F5) and L20 (F9) now pass |
| §3.5 Task create / edit / detail / delete | 20 | 20 | T19 (F2) and T20 (F12) now pass |
| §3.6 Users | 16 | 16 | 503 users (two fewer than §3: users soft-deleted since, `user100@demo.local` and `user300@demo.local`, see §8.7). U2: Supervisor filter, 124 |
| §3.7 Responsive | 38 | 38 | 9 pages × 4 widths plus the Delete dialog at 360 and 1280; this adds Login at 1024, which §3.7 skipped (37 cells there). The dialog was measured at 360 and seen at 1280 in T16. No overflow, no element past the right edge |
| §3.8 Console hygiene | 1 | 1 | No JavaScript errors, no React warnings (Q6) |

Evidence for the rows that changed state, or that the refactor touched most:

- **A2 / A3 / A5:** an empty sign-in gives "This field may not be blank." under Email and Password
  (`aria-invalid`, `aria-describedby` → `*-error`), focus on `#email`. A malformed email and a wrong
  password each give "No active account found with the given credentials" as the form alert, with
  focus on that alert. Tab from Email lands on `#password`, and Enter submits.
- **L2 / L4:** Page 2 → `?page=2`, "21–40 of 20001", focus stays on **Page 2**. Last → `?page=1001`,
  "20001–20001 of 20001", Next and Last disabled, window `1 … 999 1000 1001`. Back → `?page=2`,
  Back → `/tasks`, Forward → `?page=2`. (§3.4 L3 recorded `1 … 998 999 1000 1001`;
  `pageWindow` is unchanged since 60ef0e1 and shows current ±2, so the original wording was
  wrong, not the pager.)
- **L7–L11:** starting from `?page_size=50&ordering=due_date&page=2`:
  - Pending → `…&status=["PENDING"]`: page dropped, size and sort kept, "1–50 of 4998".
  - Overdue only → `&overdue=true`, "of 2045".
  - Due after `2026-09-01`: not in the URL at 150 ms, committed by 450 ms as
    `due_date_after=2026-09-01T00:00:00.000Z`.
  - Clear filters → `/tasks?page_size=50`, no box checked, both dates empty.
  - Back → `?page_size=50&ordering=due_date`, i.e. the entry before the last page move. Filter
    edits added no history entries.
- **L13 / L14 / L15:** `?page=99999`, `?page=-3&page_size=37&overdue=maybe` and `?status=["BOGUS"]`
  each end on `/tasks`, "1–20 of 20001", no alert.
- **L18:** a new Pending task "QA tanstack re-test B" was the first row of the Pending list.
  Inline **Complete** took "1–20 of 4999" to "1–20 of 4998", and the row left the list.
- **T5:** Assignee opens with 21 options and `aria-expanded="true"`; "olga" → 1 option. ArrowDown
  sets `aria-activedescendant` to Olga's option, Enter selects, Escape closes. No Admin among the
  81 options loaded. **T6:** "No users match “zzzzqqq”." in a polite live region.
- **T9 / T10:** the options are Pending, In progress, Cancelled, and stay that after choosing In
  progress. **T12:** choosing Unassigned sends `"assignee":null`, and the detail page shows
  Unassigned. **T15:** the completed task's edit form has no `select#status` and shows "Completed
  and cancelled tasks keep their status."
- **T16–T18:** the dialog has `aria-modal="true"` and the heading "Delete “QA tanstack re-test A”?",
  and initial focus is on Cancel. Tab cycles Delete → Cancel → Delete and Shift+Tab reverses,
  never leaving the dialog. Escape closes it and returns focus to the page's Delete. Confirm
  navigates to `/tasks`.
- **U7–U11:**
  - Empty create → 4 field errors, focus on `#email`.
  - `not-an-email` / `123` → "Enter a valid email address." and "This password is too short. It
    must contain at least 8 characters."
  - `password` → "This password is too common."
  - `OPERATOR@demo.local` with a valid password → 400, "A user with this email address already
    exists." under Email. With `password` the password error comes first, so the duplicate only
    shows once the password is valid.
  - A whitespace-only first name → "This field may not be blank."
- **§3.7:** at 360 the task list shows cards plus a 6-option "Sort by", and the pager reads "Page
  1 of 1001". 768 shows the same cards with the numbered pager. 1024 and 1280 show the table, with
  the select hidden.
  - Dashboard tiles: 2+2+2+1 at 360/768 and 3+3+1 at 1024/1280.
  - The users table starts at 768, with cards at 360.
  - The login card spans 16–344 px at 360.
  - The Assignee listbox spans 33–313 px of 346 at 360, as in §3.7.
  - The Delete dialog is fully visible at 360 × 780 (`tanstack-delete-dialog-360.png`).
  - `scrollWidth === clientWidth` everywhere. At 1024 both read 1025 on pages without a vertical
    scrollbar and 1010 on the lists, the `devicePixelRatio` artefact from §7.1 F14.

### 8.2 F1–F14 re-checked

| ID | Still fixed | Evidence |
|---|---|---|
| F1 | ✅ | Admin's own row: "Ada Admin admin@demo.local Admin Yes **Edit**" only. Peer row (`operator@demo.local`): Edit and Deactivate. At 360 the own card offers only "Edit admin@demo.local". Own edit form: no `select#role`, no Active checkbox, "You can't change your own role or deactivate your own account." |
| F2 | ✅ | `/tasks/new` empty submit → `document.activeElement.id === "title"`. Same on the edit forms (`title`, `first_name`) and on Login (`email`). Delete dialog with the DELETE answered 403 by a Playwright route: the dialog stays open, focus on its `role="alert"`, inside the dialog. Exactly 1 DELETE intercepted; "Demo task 30" still loads |
| F3 / F8 | ✅ | 768: "Sort by" with Newest first, Oldest first, Due date earliest/latest first, Status A–Z/Z–A. "Due date, earliest first" → `?ordering=due_date` (page dropped), back to "Newest first" → `/tasks`. 1024: 20 rows, 0 wrapped status pills, 0 stacked Complete/Delete pairs |
| F4 | ✅ | Deleted task (detail and `/edit`) and `/tasks/not-a-uuid` → "Task not found …" plus **Back to tasks**. `/does-not-exist` and `/tasks/a/b` → "Page not found" plus **Go to your home page** (→ `/dashboard`). Every case: 1 `header`, 1 `nav[aria-label=Main]` |
| F5 | ✅ | `/tasks?status=["PENDING"]&page=3&ordering=-due_date` ("41–60 of 4998") → "Demo task 19117" → **Back to tasks** → same three parameters (key order differs), "41–60 of 4998", Pending checked |
| F6 | ✅ | Default: `Created▼` `aria-sort="descending"`, Due date↕ and Status↕ `none`, Title/Assignee/Actions without `aria-sort` (D84). Click cycle: see Q7 |
| F7 | ✅ | `/dashboard`: Dashboard `aria-current="page"`, bottom border `rgb(37, 99, 235)`; Tasks `rgba(0, 0, 0, 0)`. `/tasks`: the reverse |
| F9 | ✅ | After `2026-09-01`, before `2026-08-01` → "“Due after” is later than “Due before”, so no task can match." Due before `aria-invalid="true"`, both inputs `aria-describedby` that message, `max`/`min` set to the other date, URL keeps both, empty state shown |
| F10 | ✅ | `/tasks?status=["BOGUS"]` → `/tasks`, "1–20 of 20001", no alert |
| F11 | ✅ | See A11: one refresh request per anonymous deep-link, no page API call |
| F12 | ✅ | "Demo task 30": list row and detail `9/28/2026` with no time; the edit form's date input holds `2026-09-28`. A task created with due date 2020-01-01 shows `1/1/2020` |
| F13 | ✅ | Role column "Admin" / "Supervisor" / "Operator"; Role filter "All roles, Admin, Supervisor, Operator" |
| F14 | ✅ | Dashboard, Tasks and Sign out: `min-height: 44px`, `offsetHeight` 44; header 44.9 px |

### 8.3 Refactor checks (Q1–Q8)

| ID | Result | Evidence |
|---|---|---|
| Q1 | ✅ | **Sign-in:** a wrong password, then the right one (typed after Tab, submitted with Enter) → `/dashboard`. **Task:** on "Demo task 19993", clearing Title and saving gives a 400 and "This field may not be blank." under Title, with focus on `#title`. Typing "Demo" keeps the error and `aria-invalid` until the next submit, as `main` does (checked on the baseline). Retyping and saving → 200 and the detail page. The two PATCH bodies differ only in `title`. **User:** "Omar Operator", First name, same sequence: 400, then 200 with `{"first_name":"Omar","last_name":"Operator","role":"OPERATOR","is_active":true}`. The task used for the baseline screenshots, "Demo task 19997", could not be saved; see §8.7 |
| Q2 | ✅ | 21 page/width pairs compared with the baseline: 18 are pixel-identical. The other three are sub-pixel anti-aliasing only; see §8.6. Due after `2026-09-15` then Clear filters 76 ms later → after 800 ms the URL is `/tasks` and both dates are empty. `?status=["PENDING","IN_PROGRESS"]`, uncheck Pending and click Clear in the same task → `/tasks`, no box checked. Check Completed and click Clear in the same task → the same. Uncheck/check/Clear as three separate clicks → the same |
| Q3 | ✅ | **Tasks:** Page 2 → `?page=2`, focus on Page 2, Back → `/tasks`. From `?page=2`, Rows per page 50 → `?page_size=50` (no `page`), "1–50 of 20001", 50 rows. Back → `/tasks`, then `/dashboard`: the size change replaced the page-2 entry. **Users** (503): Page 2 → `?page=2`, "21–40 of 503", focus on Page 2, Back → `/users`. Rows per page 50 → `?page_size=50`, 50 rows. Back → `/users` |
| Q4 | ✅ | A row's Delete dialog open on `/tasks`. The modal overlay blocks a pointer click on the header, so the Dashboard link was clicked from script. → `/dashboard` with no dialog; Tasks → `/tasks` with no dialog. Same from a task's detail page, coming back with browser Back. Also: dialog open, browser Back → `/dashboard`, Forward → `/tasks`, no dialog |
| Q5 | ✅ | Tab 1: "Demo task 19993" edit page, untouched. Tab 2 saved the title "Demo task 19993 (QA tab 2)". After the 30 s `staleTime`, tab 1's focus refetch ran (1 GET), and its Title still read "Demo task 19993". Cancel → the detail page shows the new title. **Status changed first:** tab 1 chose In progress, and tab 2 saved another title. After the refetch, tab 1 still had In progress, its own title and the options Pending / In progress / Cancelled. **User:** Omar's First name untouched in tab 1, "Omar (QA tab 2)" saved in tab 2. After the refetch, tab 1 still read "Omar". Every value was restored (§8.7) |
| Q6 | ✅ | Every console `ERROR` across the §3 matrix and Q1–Q8 is Chromium's network line for a deliberate 4xx: login 400/401/429, refresh 401, validation 400, the routed 403, not-found 404, out-of-range page 404. No other errors and no warnings. The only other entries are React's DevTools notice and Chromium's verbose `[DOM]` autocomplete hint on the user forms, which the baseline logs too |
| Q7 | ✅ | At 1280 from `?page=2`: Created `aria-sort="descending"` by default. Due date → `?ordering=due_date` (`ascending` ▲, page dropped). Again → `-due_date` (`descending` ▼). Created → `ordering=created_at` (`ascending`). Created again → `/tasks` (no `ordering`, Created `descending`). Status → `?ordering=status`. Back → `/tasks` (the entry before page 2), then `/dashboard`: none of the five sort changes added a history entry. Below lg the select works (F3 row) |
| Q8 | ✅ | `/tasks/new` as Supervisor, Assignee open, wheel-scrolled 200 px at a time. `scrollTop`/options: 200/21, 400/21, 508/41, 708/41 … 1227/61 … 1947/81, 2147/81. Each load-more appended 20 options (`assignable/?page=2`, `3`, `4`, one request each) and the list never jumped back to the top. Keyboard and type-ahead: see T5 |

### 8.4 Found and fixed

None fixed. The re-test found no regression from the refactor. It found one pre-existing defect,
recorded here and not fixed, because it is present on `main` and fixing it is a behaviour change
outside this branch's scope.

**Found, not fixed — a sign-out leaves the query cache for the next user (Medium).**

- **Observed on the branch:**
  1. As Supervisor, load `/tasks` ("1–20 of 20001").
  2. Sign out and sign in as `operator@demo.local` in the same tab.
  3. Click **Tasks**.
  - **Result:** the Operator sees "1–20 of 20001", with tasks that are not theirs ("Demo task
    20000", assigned to Wilson Jimenez). No task-list request was sent: the cached Supervisor
    page was 1.2 s old, inside the 30 s `staleTime`. A reload shows the Operator's own "1–20 of
    727".
  - **Same mechanism:** the Operator's first dashboard showed the Supervisor's "All tasks 20001"
    until a reload (727). In the other direction, the Supervisor saw the Operator's cached "1–20
    of 727".
- **Pre-existing:** reproduced on `main` (`3e110ce`) with the same steps: the Operator saw "1–20
  of 20001". Neither the old `AuthContext.signOut` nor the new session store's `signOut`/`expire`
  touches the QueryClient. Nothing in `frontend/src` on either branch clears or removes queries
  when the session ends (`queryClient.clear()`, `resetQueries` or `removeQueries`).
- **Impact:** on a shared browser, the next user briefly sees the previous user's lists and
  figures, including task titles outside an Operator's scope. Opening such a task correctly 404s
  (unless the previous user opened the same task within the 30 s `staleTime`, when its cached
  detail would show too — inferred from the query keys, not tested): the API never leaks, only
  the client cache does.
- **Recommended fix:** clear the cache when the session ends. Call `queryClient.clear()` after
  `signOut` and on `expire` (for example, `SessionProvider` passing a callback that the store
  actions call). Clearing it in `signIn` instead, before setting the new user, covers both
  sign-out and expiry in one place. The alternative is to key every query by the user id. Add a test that signs out
  user A and signs in user B, and asserts that B's first `/tasks` render makes a request and
  never shows A's rows.
- **Fixed after this re-test (D95), on 2026-10-08.** A sign-in now empties the query cache
  before it sets the new user. Clearing at sign-out was tried and rejected: the list is still
  mounted until the guards redirect, and it refetched with no token. Two tests in
  `AppShell.test.tsx` cover the fix. One checks that the next user never sees the previous
  user's rows; the other checks that no request leaves after Sign out. Re-checked in the
  browser by switching Operator, then Supervisor, then Operator in one tab, using only in-app
  links. Each user's first dashboard and first list showed that user's own figures (727,
  20001, 727), with no console errors or warnings.

### 8.5 Gates

| Gate | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ exit 0, **4 warnings**: 3 × `react(only-export-components)` (`test/render-app.tsx`, `app/providers.tsx`, `StatusBadge.tsx`), 1 × `react(immutability)` (`test/render-app.tsx`). `AuthContext.tsx` was deleted, which removed the fifth warning in §4.3 |
| `npm run test` (Vitest) | **396 passed**, 0 failed, 25 files, 26.7 s |
| `npm run build` | ✅ `dist/assets/index-DV2HtNDl.js` 500.85 kB, **gzip 149.15 kB**; CSS 12.38 kB (gzip 3.43 kB). Vite prints its chunk-over-500 kB advisory |
| Backend pytest | **438 passed**, 0 failed, 13.3 s, coverage **100.00 %** (1191 / 1191). Run from the worktree's backend, so it includes D94: `uv run --directory <worktree>/backend pytest -q` with `POSTGRES_PORT=5442` against the Compose db (its own test database). The Compose `backend` container runs the main checkout and was not used or restarted |
| Backend static checks | Not re-run here (`ruff check`, `ruff format --check`, `mypy`). SUMMARY.md §6 records them clean alongside the 438-test count, which includes D94 |

### 8.6 Screenshots

Stored in [`screenshots/`](screenshots/). Full-page screenshots. The baseline is `main` at
`3e110ce`; the branch is `77e4aac`. Supervisor
pages use the edit page of "Demo task 19997" (`01a116ca-39dc-…`). Admin pages use the edit page
of "Omar Operator" (`01a1135c-0cab-…`).

| Page | Baseline | Branch | Comparison (360 / 768 / 1280) |
|---|---|---|---|
| Login | `tanstack-baseline-login-<w>.png` | `tanstack-login-<w>.png` | identical / identical / identical |
| Task list | `tanstack-baseline-tasks-<w>.png` | `tanstack-tasks-<w>.png` | identical / identical / identical |
| Task new | `tanstack-baseline-task-new-<w>.png` | `tanstack-task-new-<w>.png` | identical / identical / identical |
| Task edit | `tanstack-baseline-task-edit-<w>.png` | `tanstack-task-edit-<w>.png` | identical / identical / identical |
| Users list | `tanstack-baseline-users-<w>.png` | `tanstack-users-<w>.png` | identical / anti-aliasing (4 226 px) / anti-aliasing (4 757 px) |
| User new | `tanstack-baseline-user-new-<w>.png` | `tanstack-user-new-<w>.png` | identical / identical / identical |
| User edit | `tanstack-baseline-user-edit-<w>.png` | `tanstack-user-edit-<w>.png` | identical / identical / anti-aliasing (35 px) |
| Delete dialog | | `tanstack-delete-dialog-360.png` | 360 only, no baseline |

`<w>` is 360, 768 or 1280. Each pair has the same image size. The 18 "identical" pairs are
byte-identical files: each baseline and branch file is the same git blob.

- **Users table, 768 and 1280:** the differing pixels sit inside the glyphs of every row's text,
  in every column. Shifting the branch image by ±1 or ±2 px in either axis only increases the
  difference, so nothing moved: column edges differ by a fraction of a pixel. A likely cause is
  that the Name cell is now one text node (`${first_name} ${last_name}` from the column
  definition), where it used to be three (`{first} {last}` in JSX), which changes the auto table
  layout's measured widths by a sub-pixel amount. The card layout at 360 is identical.
- **User edit, 1280:** 35 px in a 2-px-wide strip on the left edge of **Cancel**, the same
  sub-pixel effect. 768 and 360 are identical.

Neither is visible at normal zoom. Layout, spacing and controls are unchanged.

### 8.7 Side effects and observations

| Record | Action | State now |
|---|---|---|
| Task "QA tanstack re-test A" (`01a11984-e485-…`) | Created (due 2020-01-01, Olga), unassigned, completed, deleted (Supervisor) | soft-deleted |
| Task "QA tanstack re-test B" (`01a11986-025b-…`) | Created, completed inline (L18), deleted | soft-deleted |
| Task "QA tanstack re-test C (operator)" (`01a1198c-e142-…`) | Created and deleted (Operator, R7) | soft-deleted |
| User `qa.tanstack.20261007@demo.local` (`01a1198e-3832-…`) | Created, last name edited, deactivated (Admin) | soft-deleted |
| "Demo task 19993" (`01a116ca-39d7-…`) | Q1 save with unchanged values; Q5 title changed twice from tab 2 | Restored: title, description, status, assignee unchanged. The form writes a date as noon UTC (D76), so the Q1 save moved `due_date` from `14:35:00.528234Z` to `12:00:00Z`. One direct API PATCH put back `2026-11-21T14:35:00.528234Z`. The history table has the extra rows |
| "Omar Operator" (`operator@demo.local`) | Q1 save with unchanged values; Q5 First name → "Omar (QA tab 2)" | Restored to "Omar" |
| "Demo task 19997" (`01a116ca-39dc-…`) | Two PATCH attempts, both 400 | unchanged |

The routed 403 never reached the server. The login throttle was tripped once on purpose (A4) and
had expired before the next sign-in. Playwright wrote its console logs to the main checkout's
git-ignored `.playwright-mcp/`.

Observations, not findings:

- **D94 was not exercised in the browser.** The running backend is `main`'s, without D94. The
  task chosen for the baseline screenshots, "Demo task 19997", turned out to be one of the 37 live tasks held by a deleted
  user (`user300@demo.local`, `deleted_at` 2026-10-08 02:09 UTC; read-only `psql`). Both saves of
  it returned 400 with DRF's raw `Invalid pk "01a11439-…" - object does not exist.`, shown under
  the Assignee picker with `aria-invalid` on `#assignee`. That is the pre-D94 behaviour D94 fixes;
  `main`'s SPA re-sends the assignee the same way. The behaviour D94's frontend test pins did
  show: an assignee validation error lands under the picker, not in the alert. Q1 and Q5 used
  "Demo task 19993" (assignee `user10@demo.local`, active) instead. The backend suite (§8.5)
  covers D94.
- **Two fewer users than §3.** `user100@demo.local` (`deleted_at` 02:08 UTC) and
  `user300@demo.local` (02:09 UTC) were soft-deleted before this run began, so the list shows 503
  rather than 505. The QA user created here was deactivated again, so it changes nothing.
- **Q5 needed help to trigger the refetch.** Playwright's tabs stay `visible`, so switching tabs
  never fires `visibilitychange`. Each Q5 case waited past the 30 s `staleTime` and then
  dispatched `visibilitychange` on `window`, which is what TanStack Query's focus manager listens
  to. Each case logged exactly one refetch GET.
- **A saved edit can show stale data for about 60 ms.** After Save, the detail page first renders
  the cached task, then the refetched one. In one probe the old title showed at navigation and
  the new title arrived 62 ms later. `useUpdateTask` invalidates without awaiting and the page then
  navigates. That file is unchanged from `main`.
- **Hand-made 403 body.** The Delete-failure alert read "Forbidden" because the routed 403 body
  used `message` rather than the API's `detail`, so the client fell back to the status text.
- **`aria-current` on Back to tasks.** On "Task not found", both the **Tasks** nav link and
  **Back to tasks** carry `aria-current="page"`, as §7.4 noted.
