# List Navigation — Design Specification

**Date:** 2026-10-06
**Builds on:** [2026-10-06-iteration-3-fixes-design.md](2026-10-06-iteration-3-fixes-design.md)
**Branch:** `feat/list-navigation`, off `fix/iteration-3` at `252b996` (worktree `.worktrees/feat-list-navigation`)
**Status:** approved

---

## 1. Scope

Three frontend improvements to the Tasks and Users lists. **No backend change:**
`DefaultPageNumberPagination` already honours `?page_size=` up to `max_page_size = 100`, and both
`buildTaskQuery` and `buildUserQuery` already send it.

| # | Request | Today |
|---|---|---|
| 1 | A numbered pager — "first, prev, 1, 3, 5 (current), 7, 10, next, last" | `Pagination` offers Previous / Next and "1–20 of N" only, enabled by the response's `next` / `previous` links. |
| 2 | A page-size choice of 10, 20, 50 or 100, within the backend's `max_page_size` of 100 | Both list pages hard-code `PAGE_SIZE = 20`. |
| 3 | Filtering reflected in the URL. Today the URL carries filters only when the list is reached from a dashboard card. | `/tasks` declares a `validateSearch`, but `TaskListPage` reads it **once** to seed `useState`; nothing writes back. `/users` has no search schema at all. |

### 1.1 Choices made by the project owner

- **Page window:** first and last page, plus the current page ±2, with a gap marker wherever pages
  are skipped: `1 … 3 4 [5] 6 7 … 10`. The literal reading of the example — steps of two,
  `1 3 [5] 7 10` — was rejected: it leaves pages 2, 4, 6, 8 and 9 reachable only through Prev / Next.
- **Page-size control in the pager bar**, not in the filter panel.
- **URL state on both lists**, for every filter, sort, page and page-size change.

### 1.2 Findings that shape the design

1. **The router commits search changes in a transition.** TanStack Router (`react-router`
   1.170.41, `router-core` 1.171.34) resolves `router.load()` asynchronously and commits the new
   matches through `React.startTransition` (`Transitioner.js`, `load-client.js`). `useSearch`
   therefore changes *after* an input's `onChange` has returned. React restores a controlled input
   to its current prop when the handler did not update state synchronously, so a text field bound
   straight to a search param snaps back and then jumps: the cursor moves to the end and keystrokes
   are at risk. A native date input typed digit by digit fails the same way. Checkboxes, selects
   and buttons are only out of step until the commit lands, and nothing is typed in the meantime.
   Text entry needs a draft (D50).
2. **The pager unmounts on every page change.** Neither `useTasks` nor `useUsers` keeps previous
   data, so a new page is a new query key with no data: the table and the pager unmount and
   "Loading tasks…" replaces them. Clicking "Page 3" destroys the button that had focus (D53).
3. **A page past the end is a 404.** DRF's `PageNumberPagination` raises `NotFound("Invalid page.")`,
   which the exception handler normalises to `{"detail": "Invalid page.", "code": "not_found"}`.
   With the page in the URL, a stale bookmark or deleting the last row of the last page reaches
   it (D54).
4. **TanStack's default search serialisation is JSON-based.** Arrays are written as JSON
   (`status=["PENDING"]`, which the dashboard tests already account for), and `parseSearch`
   JSON-parses every value — so a hand-written `?search=2026` arrives as the **number** 2026. The
   router's own stringifier quotes such strings, so only hand-written URLs hit this, but the
   parsers must accept it.

---

## 2. Decision log

Continues from D44.

| # | Decision | Rationale |
|---|---|---|
| D45 | **URL search params are the single source of truth for list view state** — filters, ordering, page and page size — on both lists. A page derives its API filters from `useSearch` and writes every change through `navigate`; there is no `useState` copy. | The seed-once copy is why the URL goes stale. A mirrored copy would need syncing in both directions, with echo handling for every field. With the URL as the only copy, back/forward, refresh, shared links and dashboard cards all take one code path. A generic `useListSearch` hook was considered and deferred: there are two lists, and TanStack's typed `from` makes a generic hook awkward. |
| D46 | **Changes are applied as patches through `navigate`'s updater form**, `search: (prev) => …`. `TaskFilters` emits `onChange(patch)` and `onClear()` rather than a full snapshot. | A debounced commit (D50) runs up to 300 ms after it was scheduled. A snapshot captured then would silently undo any change made in between. |
| D47 | **Page moves push a history entry and reset scroll; every other list navigation replaces the current entry and passes `resetScroll: false`.** That covers filter, sort, page-size and draft commits, and D54's recovery. | Back should undo navigation, not each checkbox. Pushing on every edit would bury the previous page under them. The router resets window scroll after **every** navigation, replaces included, unless told not to (`router-core` `router.js`: `resetScroll ?? true`). Without the flag, toggling a filter would jump the page to the top. |
| D48 | **URLs are canonical.** Both list routes use `stripSearchParams({ page: 1, page_size: DEFAULT_PAGE_SIZE })`, and empty filters are written as `undefined`. `validateSearch` drops what it cannot use: a page that is not a positive integer, a page size outside `PAGE_SIZES`, an unknown role. | One view, one URL. A framework middleware rather than omitting defaults by hand at each call site (AGENTS.md principle 12). An unlisted page size would leave the select showing no option. |
| D49 | **Page window: first, last, and current ±2**, with a gap marker wherever pages are skipped — including a single skipped page, as in the approved preview. Below `sm` the page numbers give way to "Page X of Y"; First / Prev / Next / Last remain. | Chosen by the project owner. Up to thirteen controls do not fit a phone. |
| D50 | **Text-entry controls edit a local draft committed to the URL after 300 ms without input.** These are the users Search box and the task Due after / Due before inputs. A committed value the draft did not write (Back, a nav link) replaces the draft and cancels a pending commit. Clear filters cancels both date drafts' pending commits explicitly. A pending commit is cancelled on unmount. | §1.2.1. With a 300 ms quiet period at most one write is in flight, so "did I write this?" is a single-value comparison. It also turns one request per keystroke into one per pause. Cancelling on unmount stops a late commit from navigating back to a list the user has left. |
| D51 | **The page-size select lives in the pager bar.** `PAGE_SIZES = [10, 20, 50, 100]` and `DEFAULT_PAGE_SIZE = 20` mirror `DefaultPageNumberPagination` (`page_size = 20`, `max_page_size = 100`). A change returns to page 1; Clear filters keeps the size. | Chosen by the project owner, and built once in the shared component. Page size is a view preference, not a filter. The backend still enforces the cap; the constants only choose what to offer. |
| D52 | **The pager is driven by `count`:** `totalPages = max(1, ceil(count / pageSize))`. The `hasNext` / `hasPrevious` props go. `Pagination` moves to `src/components/`, with its pure helpers in `src/lib/pagination.ts`. | Numbered pages need the total, which the `next` / `previous` links cannot give; `count` comes from the same response. Two features import the component, so it is no longer feature code (frontend AGENTS.md §3). |
| D53 | **Lists keep the previous page on screen while the next one loads** — `placeholderData: keepPreviousData` in `useTasks` and `useUsers`. The results region carries `aria-busy` and dims meanwhile. | §1.2.2. Without it, every page click unmounts the pager and drops keyboard focus. |
| D54 | **A 404 for a page above 1 replaces the URL with page 1**, without showing the error. | §1.2.3. Page 1 never 404s (`allow_empty_first_page`), so this cannot loop. Stepping back one page at a time could take many requests for a stale bookmark. |
| D55 | **The current page is a button with `aria-current="page"` whose click does nothing** — not a disabled button, not a `<span>`. Number buttons are keyed by page number. First / Prev / Next / Last still become `disabled` at the ends. | A clicked number becomes the current page; disabling or replacing that element would drop focus to `<body>`. At the ends the same focus drop is accepted: Prev and Next already behave that way today, and a disabled "Next" on the last page is the signal users expect. |
| D56 | **`ROLES` is exported once from `features/auth/types.ts`**, beside `Role`, and used by the router, `UserListPage` and `UserForm`. | The `/users` search schema would otherwise add a third private copy of the list. |

---

## 3. Shared pagination (D49, D51, D52, D55)

### 3.1 `src/lib/pagination.ts`

```ts
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 20;

export function isPageSize(value: unknown): value is PageSize;

export type PageItem = number | "gap";
/** First, last, and current ±2, with "gap" wherever pages are skipped. */
export function pageWindow(current: number, total: number): PageItem[];
```

`pageWindow` expects `1 ≤ current ≤ total`; `Pagination` clamps before calling it. With
`start = max(2, current − 2)` and `end = min(total − 1, current + 2)`, the result is `1`, a gap if
`start > 2`, `start…end`, a gap if `end < total − 1`, then `total` when `total > 1`.

| current / total | Window |
|---|---|
| 1 / 1 | `1` |
| 1 / 2 | `1 2` |
| 3 / 4 | `1 2 3 4` |
| 1 / 10 | `1 2 3 … 10` |
| 2 / 10 | `1 2 3 4 … 10` |
| 5 / 10 | `1 … 3 4 5 6 7 … 10` |
| 9 / 10 | `1 … 7 8 9 10` |
| 10 / 10 | `1 … 8 9 10` |

### 3.2 `src/components/Pagination.tsx`

Moved from `features/tasks/components/Pagination.tsx`.

```ts
interface PaginationProps {
  count: number;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}
```

```
≥ sm   « First  ‹ Prev  1 … 3 4 [5] 6 7 … 10  Next ›  Last »   81–100 of 187   Rows per page [20 ▾]

< sm   «  ‹  Page 5 of 10  ›  »
       81–100 of 187   Rows per page [20 ▾]
```

- `<nav aria-label="Pagination">` wraps the page controls. The range text and the page-size select
  sit beside it in one `flex-wrap` row.
- **Accessible names:** "First page", "Previous page", "Page N", "Next page", "Last page". Each
  contains its visible text (WCAG 2.5.3). The existing tests' `/next page/i` and
  `/previous page/i` keep matching, and nothing else on either page is named that way.
- First and Prev are disabled on page 1; Next and Last on the last page. With a single page, all
  four are disabled and the window is `1`.
- The page numbers are a `<ul className="hidden sm:flex">`. Gaps are `<li aria-hidden="true">…</li>`.
  The current page uses the primary `Button` variant with `aria-current="page"` and a no-op click
  (D55); the rest use the secondary variant. All of them are compact: `Button` gains a
  `size?: "md" | "sm"` prop (default `"md"`, today's `px-4 py-2`; `"sm"` is `px-3 py-1.5`). A
  `className="px-3"` would not work, because `Button` merges classes with plain `clsx` and
  Tailwind emits `.px-4` after `.px-3`.
- "Page X of Y" is a `<span className="sm:hidden">`.
- **Rows per page** is a `<label>` and `<select>` tied by `useId`, offering exactly `PAGE_SIZES`.
- The range text is unchanged: "first–last of count".

### 3.3 Callers

Both pages render the pager inside the results branch, as today, so an empty list shows no
pager:

```tsx
<Pagination
  count={data.count}
  page={page}
  pageSize={pageSize}
  onPageChange={goToPage}
  onPageSizeChange={setPageSize}
/>
```

`page: number` and `pageSize: PageSize` are locals resolved from the URL (§4.2). `Filters.page` and
`Filters.page_size` are optional, so passing them directly would not typecheck.

---

## 4. List state in the URL (D45–D48, D50, D53, D54, D56)

### 4.1 Route search schemas — `src/app/router.tsx`

```ts
export interface TaskListSearch {
  status?: string[];
  due_date_after?: string;
  due_date_before?: string;
  overdue?: boolean;
  ordering?: string;
  page?: number;
  page_size?: PageSize;
}

export interface UserListSearch {
  role?: Role;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: PageSize;
}
```

New parsers sit beside the existing `asArray` and `asString`:

| Parser | Accepts | Notes |
|---|---|---|
| `asPage` | a positive integer, as a number or numeric string | Today's `Number(search.page) > 0` also accepts `2.5`. |
| `asPageSize` | a value in `PAGE_SIZES` | Via `isPageSize(Number(value))`. |
| `asRole` | a value in `ROLES` | D56. |
| `asText` | a non-empty string, or a finite number as its string | For `search` (§1.2.4). |

`overdue` keeps today's parse (`true` only, as the UI only ever sets that). `is_active` accepts
`true` / `"true"` and `false` / `"false"`, since the API supports both.

`usersRoute` gains `validateSearch`. Both list routes gain
`search: { middlewares: [stripSearchParams({ page: 1, page_size: DEFAULT_PAGE_SIZE })] }` (D48).

### 4.2 The pages read the URL and write patches

`TaskListPage` derives its API filters from the URL on every render:

```ts
const search = useSearch({ from: "/shell/tasks" });
const navigate = useNavigate({ from: "/tasks" });
const page = search.page ?? 1;
const pageSize: PageSize = search.page_size ?? DEFAULT_PAGE_SIZE;
const filters: Filters = {
  status: search.status as Filters["status"],
  due_date_after: search.due_date_after,
  due_date_before: search.due_date_before,
  overdue: search.overdue,
  ordering: search.ordering,
  page,
  page_size: pageSize,
};
```

`useSearch` takes the route **id** (`/shell/tasks`). `useNavigate` takes a **path** (`/tasks`): given
the id, it logs a dev `console.warn`, which the test setup's console guard turns into a failure.

`filters` reaches `useTasks(filters)` exactly as today, so the query key keeps its shape and the
existing `useTasks` tests are unaffected. Every write is a `navigate` with the updater form (D46):

| Action | `search: (prev) => …` | History | Scroll |
|---|---|---|---|
| Filter patch (`TaskFilters.onChange`) | `{ ...prev, ...patch, page: undefined }` | replace | `resetScroll: false` |
| Clear filters (`TaskFilters.onClear`) | `{ page_size: prev.page_size }` — drops filters **and** ordering, as today | replace | `resetScroll: false` |
| Sort (`TaskTable.onOrderingChange`) | `{ ...prev, ordering, page: undefined }` | replace | `resetScroll: false` |
| Page size | `{ ...prev, page_size, page: undefined }` | replace | `resetScroll: false` |
| Page move | `{ ...prev, page }` | **push** | default (reset to top) |

`TaskFilters` changes contract:

```ts
type FilterPatch = Pick<Filters, "status" | "due_date_after" | "due_date_before" | "overdue">;

interface TaskFiltersProps {
  filters: Filters;
  onChange: (patch: Partial<FilterPatch>) => void;
  onClear: () => void;
}
```

The status checkboxes and "Overdue only" emit patches immediately. The date inputs go through
drafts (§4.3).

`UserListPage` follows the same pattern over `UserListSearch`. Role and "Inactive only" patch
immediately; Search goes through a draft. It reads `ROLES` from `features/auth/types.ts`, as does
`UserForm` (D56).

### 4.3 Text-entry drafts — `src/lib/useSearchParamDraft.ts` (D50)

```ts
/**
 * A text field's local draft of one URL search value. The draft updates
 * synchronously, so typing is never reverted by the router's transition;
 * it reaches the URL after `delayMs` without further input.
 */
export function useSearchParamDraft(
  committed: string,
  commit: (value: string) => void,
  delayMs = 300,
): { draft: string; setDraft: (value: string) => void; cancel: () => void };
```

1. The draft starts as `committed`, and so does the last written value.
2. `setDraft(value)` sets the draft and restarts the timer. When the timer fires, it records
   `value` as the last value written, then calls `commit(value)`.
3. When `committed` changes to a value other than the last written, the change came from
   elsewhere: the draft takes the new value, which becomes the last written, and any pending
   timer is cancelled.
4. Unmounting cancels a pending timer.
5. `cancel()` drops a pending timer and resets the draft to `committed`. Rule 3 cannot catch a
   reset that leaves this field's URL value unchanged: for example, picking a Due after date while
   none is set, then clicking Clear filters within 300 ms. `TaskFilters` therefore calls both date
   drafts' `cancel()` before `onClear()`.
6. `commit` is read through a ref, so the timer always calls the latest closure.

| Field | `committed` | `commit(value)` |
|---|---|---|
| Users Search | `search.search ?? ""` | patch `{ search: value \|\| undefined }` |
| Due after | `filters.due_date_after?.slice(0, 10) ?? ""` | patch `due_date_after`: `undefined` for `""`, else the ISO string of `${value}T00:00:00Z`, as today |
| Due before | `filters.due_date_before?.slice(0, 10) ?? ""` | the same with `T23:59:59Z` |

The due-soon dashboard card writes a full timestamp (`isoDay(0)`). The draft compares the sliced
day, so the echo of its own commit is recognised whatever the time part.

**Accepted edges.** Two cases leave this field's URL value unchanged, so rule 3 never fires and
the pending commit still lands:
- typing, then pressing Back within 300 ms onto an entry whose value equals the last written one;
- typing into an empty Search, then clicking the "Users" nav link within 300 ms, which is a
  same-location navigation.

Leaving the list altogether unmounts the page and cancels the commit.

### 4.4 Loading and out-of-range pages (D53, D54)

- `useTasks` and `useUsers` gain `placeholderData: keepPreviousData`.
- Each page wraps its results (table, cards, pager) in
  `<div aria-busy={isPlaceholderData} className={clsx(isPlaceholderData && "opacity-60")}>`.
  "Loading tasks…" / "Loading users…" now appears only before the first response.
- Each page computes
  `pageOutOfRange = error instanceof ApiError && error.status === 404 && filters.page > 1`.
  An effect replaces the URL with `{ ...prev, page: undefined }` (`resetScroll: false`) when it is true, and the error
  alert is not rendered for that case. Any other error renders as today.

### 4.5 Dashboard

No code change. The cards produce `{ status: [...] }`, `{ overdue: true }` and
`{ due_date_after, due_date_before, status }`. `TaskListSearch` accepts all three, and their missing
page and page size mean the defaults. Iteration 3 reworks `StatTile` but keeps its `to` and
`search` exactly (its §5.2), so this holds after iteration 3 too. The existing drill-through tests
must pass unmodified.

A consequence worth stating: browser Back from a task's detail page now restores the exact list
the user left, including later filtering and paging. Before, it restored only what the URL held,
which was the dashboard card's predicate at most.

---

## 5. Interaction with iteration 3

This branch is cut from `fix/iteration-3` at `252b996`, which holds the iteration 3 spec but none
of its code.

| File | Iteration 3 | This work |
|---|---|---|
| `TaskListPage.tsx` | Delete dialog: `pendingDelete`, `onDelete` wiring | Filters and paging from the URL |
| `TaskListPage.test.tsx` | Delete tests | URL and pager tests |
| `StatTile.tsx`, `StatsPage.tsx` and its test | Reworked | Untouched |

Whichever lands second rebases. The overlap is textual, in different parts of the same files.
Iteration 3's delete flow gains from D54: deleting the last row of the last page refetches a page
that no longer exists, and the list now lands on page 1 instead of showing an error.

---

## 6. Documentation

The README is the reviewer's primary deliverable (root AGENTS.md §7):

- **Key implementation decisions:** a section "List state lives in the URL", summarising D45–D56.
- **Deliberate overrides of AGENTS.md:** frontend AGENTS.md §4 names three kinds of state, each
  with one tool. List view state is a fourth — URL state, owned by the router. Recorded there; the
  AGENTS.md files themselves are not edited.
- **GenAI prompt and validation record:** this request, and how the output was validated.

---

## 7. Testing

| Area | Test |
|---|---|
| `pageWindow` | Every row of the §3.1 table |
| `Pagination` | Ten pages at page 5 renders `1 … 3 4 5 6 7 … 10`, with `aria-current="page"` on 5 only |
| `Pagination` | First and Prev disabled on page 1; Next and Last disabled on the last page; one page disables all four |
| `Pagination` | Clicking "Page 7" calls `onPageChange(7)`; clicking the current page calls nothing |
| `Pagination` | "Rows per page" offers exactly 10, 20, 50 and 100; choosing 50 calls `onPageSizeChange(50)` |
| `Pagination` | Shows "81–100 of 187" and "Page 5 of 10" |
| Tasks, URL → API | `/tasks?page=2&page_size=50&overdue=true` requests `page=2`, `page_size=50`, `overdue=true`; page 2 is current and the select shows 50 |
| Tasks, invalid URL | `page_size=37` requests `page_size=20`; `page=0` and `page=abc` request `page=1` |
| Tasks, UI → URL | From `/tasks?page=2`, ticking Pending puts `status` in the location and drops `page`; history length is unchanged (replace) |
| Tasks, paging | Clicking "Page 2" puts `page=2` in the location and adds a history entry; `history.back()` requests page 1 again and marks it current |
| Tasks, page size | From `/tasks?page=2`, choosing 50 requests `page_size=50&page=1`; the location has `page_size=50` and no `page` |
| Tasks, canonical | Returning to page 1 or size 20 removes them from the location |
| Tasks, Clear filters | Drops filters and ordering, keeps `page_size` |
| Tasks, date draft | Typing a Due after date sends exactly one request carrying `due_date_after`, and the location gains it |
| Tasks, Clear during a draft | Entering a Due after date and clicking Clear filters within 300 ms leaves the input empty, and no request ever carries `due_date_after` |
| Tasks, out of range | `/tasks?page=3`, answered 404 for page 3, re-requests page 1, drops `page` from the location, and shows no alert |
| Tasks, previous page kept | With the page-2 response held back, the table stays rendered inside `aria-busy="true"` until it arrives |
| Users, URL → API | `/users?role=OPERATOR&search=omar&page_size=10` requests all three; the Search box shows "omar" |
| Users, numeric search | `/users?search=2026` shows "2026" in the box and requests `search=2026` |
| Users, debounce | Typing "omar" sends exactly one request carrying `search`, equal to "omar" |
| Users, external change | Once a search has been committed, clicking the "Users" nav link empties the box and the query |
| Users, unknown role | `role=ROOT` is dropped from the request |
| Dashboard | The existing drill-through tests pass unmodified |

**Test helper.** `renderApp` returns the router it created alongside the render result, so tests
can assert `router.state.location.search` and `router.history.length`, and call
`router.history.back()`.
- The router is created inside `AppAtPath`'s `useState`, so it reaches `renderApp` through a holder
  object passed down as a prop.
- The return value keeps every field of the render result. `StatsPage.test.tsx` calls `unmount()`
  on it.
- `router.history.back()` runs `router.load()` synchronously and updates router stores. Tests wrap
  it in `act()`; otherwise React's "not wrapped in act" `console.error` fails the test through
  the console guard in `setup.ts`.

**Budgeted changes to existing tests.**

- `TaskListPage` "resets to page 1 when a filter changes": its comment says pagination is driven
  by the `next` / `previous` envelope, which D52 makes untrue. The steps are unchanged: a count of
  40 at size 20 is still two pages.
- `UserListPage` "filters by role and by inactive, and searches": unchanged. The 300 ms debounce
  sits well inside `waitFor`'s one-second default.
- Both pages' `Pagination` import path.

**In the browser,** before the branch is pushed: the pager below `sm` and at `lg`, and typing into
Search and into a date input digit by digit, with no reverted characters and no cursor jumps. The
console must stay clean throughout (frontend AGENTS.md §7). Then `npm run lint`,
`npm run typecheck` and `npm test`.

---

## 8. Out of scope

- A generic `useListSearch` hook (D45).
- Readable array encoding in the URL. `status=["PENDING"]` stays in TanStack's JSON form, which the
  dashboard tests already accept.
- Validating `status` values in the URL. An unknown status reaches the API, whose 400 renders as
  the list's error state.
- Remembering the page size across sessions.
- A jump-to-page input.
- The detail page's "Back to tasks" link preserving the list's filters. Browser Back now does.
- Any backend change.
