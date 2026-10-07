# List Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver [2026-10-06-list-navigation-design.md](../specs/2026-10-06-list-navigation-design.md):
- a numbered pager with a page-size choice on both lists;
- list filters, sort, page and page size kept in the URL;
- a browser-tab title for every page.

**Architecture:** The URL is the only copy of list view state (D45). Each list route validates its
search params in a pure module. Each page derives its API filters from `useSearch` and writes back
through `navigate`'s updater form. Typed text goes through a debounced draft hook, because the
router commits search changes in a React transition (D50). The pager is one shared component
driven by `count`, with its pure helpers in `src/lib/pagination.ts`. Route titles use the router's
`head` option and `<HeadContent />`. The backend does not change.

**Tech Stack:** React 19 · TypeScript 6 · TanStack Router 1.170 · TanStack Query 5.104 · Vitest 5 · Testing Library · MSW 2 · Tailwind 3 · oxlint

---

## Execution Notes

**Work in the worktree.** All paths are relative to
`D:/VirtualWrapper/code/TaskManagementSystem/.worktrees/feat-list-navigation`, on branch
`feat/list-navigation`. Its `frontend/node_modules` is already installed.

**Frontend commands** run from the worktree root:

```bash
npm run --prefix frontend test                          # whole suite
npm run --prefix frontend test -- src/lib/pagination    # one file (a path filter)
npm run --prefix frontend typecheck
npm run --prefix frontend lint
```

The baseline is 89 tests in 10 files, all passing. The "Not implemented: Window's scrollTo()"
lines are jsdom noise from the router and predate this work.

**The console guard is strict.** `src/test/setup.ts` fails any test that writes an unexpected
`console.error` or `console.warn`. That rules out three things:
- An unhandled MSW request: `onUnhandledRequest: "error"`.
- React's "not wrapped in act(...)" warning. Wrap `router.history.back()` in `act()`.
- The router's "Could not find match for from" warning. `useNavigate` takes the route **path**
  (`"/tasks"`), not the route **id** that `useSearch` takes (`"/shell/tasks"`).

**The router is not type-registered.** No `declare module "@tanstack/react-router"` exists, so
`useSearch` returns `any`. Annotate it (`const search: TaskListSearch = useSearch(...)`) and type
the updater helpers explicitly. Do not add a `Register` declaration here: it would retype every
`Link` in the app and is out of scope.

**Pass `resetScroll: false` on every replace navigation** (D47). The router resets window scroll
after every navigation, replaces included, unless told otherwise.

**No backend change.** Task 11 runs the backend suite once anyway, as CI does.

**Iteration 3 overlap.** This branch is cut from `fix/iteration-3`, whose implementation has not
landed yet. If it lands first, rebase this branch before Task 7. The only shared files are
`TaskListPage.tsx` and its test, which change in different places (spec §5).

**Commit after every task.** Each task leaves the frontend suite, the typecheck and lint green.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `frontend/src/lib/pagination.ts` | Page-size constants and the pure page-window algorithm. |
| `frontend/src/lib/pagination.test.ts` | Table-driven tests for the window and the page-size guard. |
| `frontend/src/components/Pagination.tsx` | The shared pager: First / Prev / numbers / Next / Last, the range and Rows per page. Replaces `features/tasks/components/Pagination.tsx`. |
| `frontend/src/components/Pagination.test.tsx` | Component tests, rendered without a router. |
| `frontend/src/components/Button.test.tsx` | The new `size` prop. |
| `frontend/src/app/search-params.ts` | The two list routes' search types and validators. They are pure, so they are unit-tested apart from the router. |
| `frontend/src/app/search-params.test.ts` | Validator tests. |
| `frontend/src/lib/useSearchParamDraft.ts` | The debounced draft for text-entry fields bound to a search param. |
| `frontend/src/lib/useSearchParamDraft.test.ts` | Hook tests with fake timers. |
| `frontend/src/app/page-titles.test.tsx` | Every route's tab title, plus the missing static title. |

### Modified files

| File | Change |
|---|---|
| `frontend/src/components/Button.tsx` | `size?: "md" \| "sm"`. |
| `frontend/src/test/render-app.tsx` | Returns the router it created. |
| `frontend/src/features/auth/types.ts` | Exports `ROLES` (D56). |
| `frontend/src/features/users/components/UserForm.tsx` | Uses the shared `ROLES`. |
| `frontend/src/app/router.tsx` | Validators from `search-params.ts`, `stripSearchParams`, `validateSearch` on `/users`, `HeadContent` and route titles. |
| `frontend/src/features/tasks/TaskListPage.tsx` | URL state, new pager, keep-previous-page, 404 recovery. |
| `frontend/src/features/tasks/components/TaskFilters.tsx` | Emits patches; date drafts. |
| `frontend/src/features/tasks/hooks/useTasks.ts` | `placeholderData: keepPreviousData`. |
| `frontend/src/features/tasks/TaskListPage.test.tsx` | URL and pager tests; one budgeted comment change. |
| `frontend/src/features/users/UserListPage.tsx` | The same conversion as the task list. |
| `frontend/src/features/users/hooks/useUsers.ts` | `placeholderData: keepPreviousData`. |
| `frontend/src/features/users/UserListPage.test.tsx` | URL, draft and recovery tests. |
| `frontend/index.html` | Loses the static `<title>` (D58). |
| `README.md`, `docs-external/PROMPT-LOGS.md` | Decisions, the AGENTS.md override and the prompt record. |

### Deleted files

| File | Why |
|---|---|
| `frontend/src/features/tasks/components/Pagination.tsx` | Moved to `src/components/` (D52). Deleted in Task 8, once neither page imports it. |

---

## Task 1: `Button` gains a compact size (spec §3.2)

**Files:**
- Modify: `frontend/src/components/Button.tsx`
- Test: `frontend/src/components/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/Button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("is full size by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveClass("px-4", "py-2");
  });

  it("has a compact size that does not also carry the full-size padding", () => {
    // Button merges classes with plain clsx, and Tailwind emits .px-4 after
    // .px-3 — so a className="px-3" override would silently lose. The size
    // must replace the padding, not add to it.
    render(<Button size="sm">1</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("px-3", "py-1.5");
    expect(button).not.toHaveClass("px-4");
    expect(button).not.toHaveClass("py-2");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run --prefix frontend test -- src/components/Button`
Expected: the compact-size test FAILS. `size` is spread onto the `<button>` as an unknown attribute, and the button still carries `px-4`.

- [ ] **Step 3: Implement**

Replace `frontend/src/components/Button.tsx` with:

```tsx
import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  /** "sm" is the pager's compact size; every other button is "md". */
  size?: "md" | "sm";
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-status-progress text-white hover:bg-blue-700",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-status-overdue text-white hover:bg-red-700",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "px-4 py-2",
  sm: "px-3 py-1.5",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type,
  ...button
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={clsx(
        "rounded text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...button}
    />
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run --prefix frontend test`
Expected: all pass — 91 tests (89 + 2).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Button.tsx frontend/src/components/Button.test.tsx
git commit -m "feat: give Button a compact size"
```

---

## Task 2: The page window and page sizes (spec §3.1, D49, D51)

**Files:**
- Create: `frontend/src/lib/pagination.ts`
- Test: `frontend/src/lib/pagination.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, PAGE_SIZES, isPageSize, pageWindow } from "./pagination";

/** "1 … 3 4 5" — the same notation as the spec's table, so a failure reads like it. */
function render(current: number, total: number): string {
  return pageWindow(current, total)
    .map((item) => (item === "gap" ? "…" : String(item)))
    .join(" ");
}

describe("pageWindow", () => {
  it.each([
    [1, 1, "1"],
    [1, 2, "1 2"],
    [3, 4, "1 2 3 4"],
    [1, 10, "1 2 3 … 10"],
    [2, 10, "1 2 3 4 … 10"],
    [5, 10, "1 … 3 4 5 6 7 … 10"],
    [9, 10, "1 … 7 8 9 10"],
    [10, 10, "1 … 8 9 10"],
  ])("page %i of %i shows %s", (current, total, expected) => {
    expect(render(current, total)).toBe(expected);
  });
});

describe("page sizes", () => {
  it("offers what the API's max_page_size of 100 allows, defaulting to its page_size", () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it.each([10, 20, 50, 100])("accepts %i", (size) => {
    expect(isPageSize(size)).toBe(true);
  });

  it.each([0, 37, 101, 5000, "20", null, undefined])("rejects %j", (size) => {
    expect(isPageSize(size)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/lib/pagination`
Expected: FAIL — `Failed to resolve import "./pagination"`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/pagination.ts`:

```ts
/**
 * What the pager offers. The backend's DefaultPageNumberPagination has
 * page_size = 20 and max_page_size = 100, and still enforces the cap — these
 * only choose which sizes to offer (D51).
 */
export const PAGE_SIZES = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 20;

export function isPageSize(value: unknown): value is PageSize {
  return (PAGE_SIZES as readonly unknown[]).includes(value);
}

export type PageItem = number | "gap";

/**
 * First, last, and the current page ±2, with "gap" wherever pages are skipped
 * — even a single page, as in the approved design (D49). Expects
 * 1 ≤ current ≤ total; the caller clamps.
 */
export function pageWindow(current: number, total: number): PageItem[] {
  if (total <= 1) return [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  const items: PageItem[] = [1];
  if (start > 2) items.push("gap");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("gap");
  items.push(total);
  return items;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run --prefix frontend test -- src/lib/pagination`
Expected: PASS — 20 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pagination.ts frontend/src/lib/pagination.test.ts
git commit -m "feat: add the page window and the page sizes the API allows"
```

---

## Task 3: The shared `Pagination` component (spec §3.2, D52, D55)

The component is created here and wired into the pages in Tasks 7 and 8. Until then the old
`features/tasks/components/Pagination.tsx` stays in use, so the suite stays green.

**Files:**
- Create: `frontend/src/components/Pagination.tsx`
- Test: `frontend/src/components/Pagination.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/Pagination.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { Pagination } from "./Pagination";

/** 187 rows at 20 a page is ten pages; page 5 shows rows 81–100. */
function renderPager(props: Partial<ComponentProps<typeof Pagination>> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <Pagination
      count={187}
      page={5}
      pageSize={20}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      {...props}
    />,
  );
  return { onPageChange, onPageSizeChange };
}

function pageNumbers(): string[] {
  const nav = screen.getByRole("navigation", { name: /pagination/i });
  return within(nav)
    .getAllByRole("button", { name: /^page \d+$/i })
    .map((button) => button.textContent ?? "");
}

describe("Pagination", () => {
  it("shows the first, the last, and two pages either side of the current one", () => {
    renderPager();
    expect(pageNumbers()).toEqual(["1", "3", "4", "5", "6", "7", "10"]);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("marks only the current page", () => {
    renderPager();
    const current = screen.getAllByRole("button", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName("Page 5");
  });

  it("disables First and Prev on the first page", () => {
    renderPager({ page: 1 });
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeEnabled();
  });

  it("disables Next and Last on the last page", () => {
    renderPager({ page: 10 });
    expect(screen.getByRole("button", { name: "First page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
  });

  it("disables all four and shows one number when everything fits on a page", () => {
    renderPager({ count: 7, page: 1 });
    for (const name of ["First page", "Previous page", "Next page", "Last page"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(pageNumbers()).toEqual(["1"]);
  });

  it("asks for the page each control points at", async () => {
    const { onPageChange } = renderPager();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Page 7" }));
    await user.click(screen.getByRole("button", { name: "First page" }));
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(onPageChange.mock.calls).toEqual([[7], [1], [4], [6], [10]]);
  });

  it("keeps the current page focusable but does nothing when it is clicked", async () => {
    // D55: the number just clicked BECOMES the current page. Disabling it, or
    // swapping it for a <span>, would drop keyboard focus to <body>.
    const { onPageChange } = renderPager();
    const current = screen.getByRole("button", { name: "Page 5" });
    expect(current).toBeEnabled();
    await userEvent.setup().click(current);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("offers exactly the page sizes the API allows", async () => {
    const { onPageSizeChange } = renderPager();
    const select = screen.getByLabelText(/rows per page/i);
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "10",
      "20",
      "50",
      "100",
    ]);
    expect(select).toHaveValue("20");
    await userEvent.setup().selectOptions(select, "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("states the range, and the page count that replaces the numbers below sm", () => {
    renderPager();
    expect(screen.getByText("81–100 of 187")).toBeInTheDocument();
    expect(screen.getByText("Page 5 of 10")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/components/Pagination`
Expected: FAIL — `Failed to resolve import "./Pagination"`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/Pagination.tsx`:

```tsx
import { useId } from "react";

import { PAGE_SIZES, pageWindow, type PageSize } from "../lib/pagination";
import { Button } from "./Button";

interface PaginationProps {
  count: number;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}

/**
 * Driven by `count` rather than the envelope's next/previous links: numbered
 * pages need the total, which the links cannot give (D52).
 */
export function Pagination({
  count,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const sizeId = useId();
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(Math.max(page, 1), totalPages);
  const first = count === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, count);
  const atStart = current === 1;
  const atEnd = current === totalPages;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={atStart}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          « <span className="hidden sm:inline">First</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={atStart}
          onClick={() => onPageChange(current - 1)}
          aria-label="Previous page"
        >
          ‹ <span className="hidden sm:inline">Prev</span>
        </Button>

        {/* Up to thirteen controls do not fit a phone; below sm the count replaces the numbers (D49). */}
        <ul className="hidden items-center gap-1 sm:flex">
          {pageWindow(current, totalPages).map((item, index) =>
            item === "gap" ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-slate-500">
                …
              </li>
            ) : (
              // Keyed by page number, so the button just clicked is the same
              // element once it becomes the current page (D55).
              <li key={item}>
                <Button
                  variant={item === current ? "primary" : "secondary"}
                  size="sm"
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? "page" : undefined}
                  onClick={() => {
                    if (item !== current) onPageChange(item);
                  }}
                >
                  {item}
                </Button>
              </li>
            ),
          )}
        </ul>
        <span className="px-2 text-sm text-slate-600 sm:hidden">
          Page {current} of {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={atEnd}
          onClick={() => onPageChange(current + 1)}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span> ›
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={atEnd}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
        >
          <span className="hidden sm:inline">Last</span> »
        </Button>
      </nav>

      <p className="text-sm text-slate-600">
        {first}–{last} of {count}
      </p>

      <div className="flex items-center gap-2">
        <label htmlFor={sizeId} className="text-sm text-slate-700">
          Rows per page
        </label>
        <select
          id={sizeId}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

The `as PageSize` cast is safe: the `<select>` offers only `PAGE_SIZES`.

- [ ] **Step 4: Run the tests**

Run: `npm run --prefix frontend test -- src/components/Pagination`
Expected: PASS — 9 tests.

Run: `npm run --prefix frontend test`
Expected: all pass — nothing imports the new component yet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Pagination.tsx frontend/src/components/Pagination.test.tsx
git commit -m "feat: add a numbered pager with a rows-per-page choice"
```

---

## Task 4: `renderApp` returns its router (spec §8, test helper)

**Files:**
- Modify: `frontend/src/test/render-app.tsx`
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/features/tasks/TaskListPage.test.tsx`, add inside `describe("TaskListPage", …)`,
directly after the "shows an error state when the request fails" test:

```tsx
  it("exposes the router it rendered with, for the URL tests below", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual({ page: 2 });
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run --prefix frontend test -- src/features/tasks/TaskListPage`
Expected: FAIL — `Cannot read properties of undefined (reading 'state')`.

- [ ] **Step 3: Implement**

In `frontend/src/test/render-app.tsx`:

Change the router import to also bring in the type:

```tsx
import { createAppRouter, type AppRouter } from "../app/router";
```

Replace `AppAtPath`'s signature and its `useState` with:

```tsx
/** Where AppAtPath hands back the router it created, so tests can read the URL. */
interface RouterHolder {
  current: AppRouter | null;
}

function AppAtPath({ initialPath, holder }: { initialPath: string; holder: RouterHolder }) {
  const auth = useAuth();
  const [router] = useState(() => {
    const created = createAppRouter(auth, {
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    });
    holder.current = created;
    return created;
  });
```

The rest of `AppAtPath` is unchanged. Replace `renderApp` with:

```tsx
export async function renderApp(initialPath = "/") {
  clearAccessToken();
  // retry: false so a deliberate 4xx in a test fails fast instead of waiting
  // out backoff, and a dedicated client per render keeps caches isolated.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const holder: RouterHolder = { current: null };
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppAtPath initialPath={initialPath} holder={holder} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  // AppAtPath creates the router on its first render, which render() has
  // already completed — before the auth probe settles.
  const router = holder.current;
  if (router === null) throw new Error("renderApp: AppAtPath did not create a router");
  // Spread, not wrapped: StatsPage.test.tsx calls unmount() on the result.
  return { ...result, router };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run --prefix frontend test`
Expected: all pass, including every existing caller of `renderApp`.

Run: `npm run --prefix frontend lint`
Expected: no errors. One new **warning** is accepted: `react(immutability)` on
`holder.current = created`, "Do not mutate component props". The holder exists precisely to
receive that write, and it is test-only code.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/test/render-app.tsx frontend/src/features/tasks/TaskListPage.test.tsx
git commit -m "test: return the router from renderApp so tests can assert the URL"
```

---

## Task 5: Search validation, canonical URLs and one `ROLES` (spec §4.1, D48, D56)

**Files:**
- Create: `frontend/src/app/search-params.ts`
- Test: `frontend/src/app/search-params.test.ts`
- Modify: `frontend/src/app/router.tsx`, `frontend/src/features/auth/types.ts`,
  `frontend/src/features/users/components/UserForm.tsx`, `frontend/src/features/users/UserListPage.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/search-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateTaskListSearch, validateUserListSearch } from "./search-params";

describe("validateTaskListSearch", () => {
  it("keeps every value the list can use", () => {
    expect(
      validateTaskListSearch({
        status: ["PENDING", "IN_PROGRESS"],
        due_date_after: "2026-10-06T00:00:00.000Z",
        due_date_before: "2026-10-13T23:59:59.000Z",
        overdue: true,
        ordering: "due_date",
        page: 2,
        page_size: 50,
      }),
    ).toEqual({
      status: ["PENDING", "IN_PROGRESS"],
      due_date_after: "2026-10-06T00:00:00.000Z",
      due_date_before: "2026-10-13T23:59:59.000Z",
      overdue: true,
      ordering: "due_date",
      page: 2,
      page_size: 50,
    });
  });

  it("tolerates a single status rather than an array", () => {
    expect(validateTaskListSearch({ status: "PENDING" }).status).toEqual(["PENDING"]);
  });

  it("reads numbers written as strings", () => {
    const search = validateTaskListSearch({ page: "3", page_size: "50" });
    expect(search.page).toBe(3);
    expect(search.page_size).toBe(50);
  });

  it.each([0, -1, 2.5, "abc", "", true, null])("drops page %j", (page) => {
    expect(validateTaskListSearch({ page }).page).toBeUndefined();
  });

  it.each([37, 5000, 0, "abc", true])("drops page_size %j, which the select cannot show", (size) => {
    expect(validateTaskListSearch({ page_size: size }).page_size).toBeUndefined();
  });
});

describe("validateUserListSearch", () => {
  it("keeps a known role and drops an unknown one", () => {
    expect(validateUserListSearch({ role: "OPERATOR" }).role).toBe("OPERATOR");
    expect(validateUserListSearch({ role: "ROOT" }).role).toBeUndefined();
  });

  it.each([
    [true, true],
    ["true", true],
    [false, false],
    ["false", false],
    ["maybe", undefined],
  ])("reads is_active %j as %j", (raw, expected) => {
    expect(validateUserListSearch({ is_active: raw }).is_active).toBe(expected);
  });

  it("keeps a numeric search as text", () => {
    // The default parseSearch JSON-parses values, so a hand-written
    // ?search=2026 arrives as the number 2026 (spec §1.2.4).
    expect(validateUserListSearch({ search: 2026 }).search).toBe("2026");
  });

  it("validates page and page size like the task list", () => {
    const search = validateUserListSearch({ page: "2", page_size: 37 });
    expect(search.page).toBe(2);
    expect(search.page_size).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/app/search-params`
Expected: FAIL — `Failed to resolve import "./search-params"`.

- [ ] **Step 3: Export `ROLES` once (D56)**

In `frontend/src/features/auth/types.ts`, after the `Role` type:

```ts
export const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "OPERATOR"];
```

In `frontend/src/features/users/components/UserForm.tsx`:
- delete the local `const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "OPERATOR"];`;
- change the import to `import { ROLES, type Role } from "../../auth/types";`.

In `frontend/src/features/users/UserListPage.tsx`:
- delete the local `const ROLES: Role[] = …`;
- change the import to `import { ROLES, type Role } from "../auth/types";`.

- [ ] **Step 4: Create the validators**

Create `frontend/src/app/search-params.ts`:

```ts
import { ROLES, type Role } from "../features/auth/types";
import { isPageSize, type PageSize } from "../lib/pagination";

/**
 * The URL is the lists' only state (D45), so these are the single parse
 * boundary for it. Anything a validator cannot use becomes undefined — the
 * list's default — rather than reaching the API or a control that cannot
 * show it (D48).
 */
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

/** Coerces one raw search value into a string array, tolerating a single value. */
function asArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value !== "") return [value];
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Free text. A hand-written ?search=2026 arrives as a number (spec §1.2.4). */
function asText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asString(value);
}

function asPage(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

function asPageSize(value: unknown): PageSize | undefined {
  const size = typeof value === "string" ? Number(value) : value;
  return isPageSize(size) ? size : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function asRole(value: unknown): Role | undefined {
  return ROLES.find((role) => role === value);
}

export function validateTaskListSearch(search: Record<string, unknown>): TaskListSearch {
  return {
    status: asArray(search.status),
    due_date_after: asString(search.due_date_after),
    due_date_before: asString(search.due_date_before),
    // true only: the UI never sets false, and overdue=false means something else to the API.
    overdue: search.overdue === true || search.overdue === "true" ? true : undefined,
    ordering: asString(search.ordering),
    page: asPage(search.page),
    page_size: asPageSize(search.page_size),
  };
}

export function validateUserListSearch(search: Record<string, unknown>): UserListSearch {
  return {
    role: asRole(search.role),
    is_active: asBoolean(search.is_active),
    search: asText(search.search),
    page: asPage(search.page),
    page_size: asPageSize(search.page_size),
  };
}
```

- [ ] **Step 5: Wire them into the router**

In `frontend/src/app/router.tsx`:

1. Add `stripSearchParams` to the `@tanstack/react-router` import.
2. Add these imports:

   ```tsx
   import { DEFAULT_PAGE_SIZE } from "../lib/pagination";
   import { validateTaskListSearch, validateUserListSearch } from "./search-params";
   ```
3. Delete `asArray`, `asString` and the `TaskListSearch` interface (moved; nothing else imported
   them).
4. Replace `tasksRoute` and `usersRoute` with the code below. The middleware is written inline
   in each route on purpose. A shared constant does not typecheck, because the middleware's type
   is inferred per route schema: `TS2322 … SearchMiddleware<unknown>[] is not assignable to
   SearchMiddleware<TaskListSearch>[]`.

   ```tsx
   const tasksRoute = createRoute({
     getParentRoute: () => shellRoute,
     path: "/tasks",
     component: TaskListPage,
     beforeLoad: guard("/tasks"),
     /**
      * The list's filters, sort, page and page size live in the URL (D45), which
      * is what makes the dashboard drill-through links, Back and a shared link
      * all land on the same view.
      */
     validateSearch: validateTaskListSearch,
     // One view, one URL (D48): page 1 and the default size are never written,
     // so /tasks and /tasks?page=1&page_size=20 cannot both exist.
     search: { middlewares: [stripSearchParams({ page: 1, page_size: DEFAULT_PAGE_SIZE })] },
   });

   const usersRoute = createRoute({
     getParentRoute: () => shellRoute,
     path: "/users",
     component: UserListPage,
     beforeLoad: guard("/users"),
     validateSearch: validateUserListSearch,
     search: { middlewares: [stripSearchParams({ page: 1, page_size: DEFAULT_PAGE_SIZE })] },
   });
   ```

- [ ] **Step 6: Run the tests, the typecheck and lint**

Run: `npm run --prefix frontend test`
Expected: all pass. The new validator tests pass, and the existing list and dashboard tests still
pass — the task list still seeds from `useSearch`.

Run: `npm run --prefix frontend typecheck`
Expected: exit 0.

Run: `npm run --prefix frontend lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/search-params.ts frontend/src/app/search-params.test.ts frontend/src/app/router.tsx frontend/src/features/auth/types.ts frontend/src/features/users/components/UserForm.tsx frontend/src/features/users/UserListPage.tsx
git commit -m "feat: validate list search params in one module and keep defaults out of URLs"
```

---

## Task 6: The text-entry draft hook (spec §4.3, D50)

**Files:**
- Create: `frontend/src/lib/useSearchParamDraft.ts`
- Test: `frontend/src/lib/useSearchParamDraft.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/useSearchParamDraft.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSearchParamDraft } from "./useSearchParamDraft";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(initial = "") {
  const commit = vi.fn();
  const hook = renderHook(
    ({ committed, onCommit }) => useSearchParamDraft(committed, onCommit),
    { initialProps: { committed: initial, onCommit: commit } },
  );
  return { commit, hook };
}

describe("useSearchParamDraft", () => {
  it("starts from the committed value", () => {
    const { hook } = setup("omar");
    expect(hook.result.current.draft).toBe("omar");
  });

  it("updates the draft at once, and commits once after 300 ms without input", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("o"));
    expect(hook.result.current.draft).toBe("o");
    act(() => vi.advanceTimersByTime(100));
    act(() => hook.result.current.setDraft("om"));
    act(() => vi.advanceTimersByTime(299));
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(commit.mock.calls).toEqual([["om"]]);
  });

  it("ignores the echo of its own commit, even after more typing", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("om"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith("om");
    act(() => hook.result.current.setDraft("oma"));
    hook.rerender({ committed: "om", onCommit: commit });
    expect(hook.result.current.draft).toBe("oma");
  });

  it("takes a value it did not write, and drops its pending commit", () => {
    const { commit, hook } = setup("omar");
    act(() => hook.result.current.setDraft("omar x"));
    hook.rerender({ committed: "", onCommit: commit });
    expect(hook.result.current.draft).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("drops a pending commit on unmount", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("x"));
    hook.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("cancel() drops a pending commit and returns to the committed value", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("2026-10-06"));
    act(() => hook.result.current.cancel());
    expect(hook.result.current.draft).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("calls the latest commit callback, not the one current when typing began", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("x"));
    const later = vi.fn();
    hook.rerender({ committed: "", onCommit: later });
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith("x");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/lib/useSearchParamDraft`
Expected: FAIL — `Failed to resolve import "./useSearchParamDraft"`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/useSearchParamDraft.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface SearchParamDraft {
  draft: string;
  setDraft: (value: string) => void;
  /** Drop a pending commit and return to the committed value. */
  cancel: () => void;
}

/**
 * A text field's local draft of one URL search value (D50).
 *
 * The router commits search changes in a React transition, after an async
 * load, so a controlled input bound straight to a search param is reverted by
 * React and then jumps — the cursor moves and keystrokes are at risk. The draft
 * updates synchronously and reaches the URL after `delayMs` without input.
 *
 * With that quiet period at most one write is in flight, so "did I write this
 * value?" is a single comparison: a committed value other than the last one
 * written came from elsewhere (Back, a nav link) and replaces the draft.
 */
export function useSearchParamDraft(
  committed: string,
  commit: (value: string) => void,
  delayMs = 300,
): SearchParamDraft {
  const [draft, setDraftState] = useState(committed);
  const lastWritten = useRef(committed);
  const latest = useRef({ committed, commit });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = { committed, commit };
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (committed === lastWritten.current) return;
    clearTimer();
    lastWritten.current = committed;
    setDraftState(committed);
  }, [committed, clearTimer]);

  // A late commit after unmount would navigate back to a list the user left.
  useEffect(() => clearTimer, [clearTimer]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        lastWritten.current = value;
        latest.current.commit(value);
      }, delayMs);
    },
    [clearTimer, delayMs],
  );

  const cancel = useCallback(() => {
    clearTimer();
    setDraftState(latest.current.committed);
  }, [clearTimer]);

  return { draft, setDraft, cancel };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run --prefix frontend test -- src/lib/useSearchParamDraft`
Expected: PASS — 7 tests.

Run: `npm run --prefix frontend lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useSearchParamDraft.ts frontend/src/lib/useSearchParamDraft.test.ts
git commit -m "feat: add a debounced draft for text fields bound to a search param"
```

---

## Task 7: The task list reads and writes the URL (spec §4.2–§4.4, D45–D47, D53, D54)

**Files:**
- Modify: `frontend/src/features/tasks/TaskListPage.tsx`,
  `frontend/src/features/tasks/components/TaskFilters.tsx`,
  `frontend/src/features/tasks/hooks/useTasks.ts`
- Test: `frontend/src/features/tasks/TaskListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/features/tasks/TaskListPage.test.tsx`:

1. Change the first import to
   `import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";`.
2. After `lastQuery()`, add:

   ```tsx
   /**
    * Answers like DRF's PageNumberPagination: `count` rows in pages of the
    * requested size, one row per page so each page is recognisable, and a 404
    * past the last page.
    */
   function tasksPaged(count: number) {
     server.use(
       http.get(`${BASE}/tasks/`, ({ request }) => {
         const url = new URL(request.url);
         requested.push(url);
         const page = Number(url.searchParams.get("page") ?? "1");
         const size = Number(url.searchParams.get("page_size") ?? "20");
         const pages = Math.max(1, Math.ceil(count / size));
         if (page > pages) {
           return HttpResponse.json(
             { detail: "Invalid page.", code: "not_found", errors: null },
             { status: 404 },
           );
         }
         return HttpResponse.json({
           count,
           next: page < pages ? `${BASE}/tasks/?page=${page + 1}` : null,
           previous: page > 1 ? `${BASE}/tasks/?page=${page - 1}` : null,
           results: [task({ id: `task-${page}`, title: `Task on page ${page}` })],
         });
       }),
     );
   }
   ```
3. In "resets to page 1 when a filter changes", replace the two comment lines above `server.use`
   with:

   ```tsx
    // The pager counts pages from `count` (D52): 40 rows at 20 a page is two
    // pages, so Next is enabled on page 1.
   ```
4. Add a new `describe` block after the existing `describe("TaskListPage", …)`:

```tsx
describe("TaskListPage URL state", () => {
  it("reads the page, the page size and the filters from the URL", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    await renderApp("/tasks?page=2&page_size=50&overdue=true");
    await screen.findByRole("table");
    expect(lastQuery().get("page")).toBe("2");
    expect(lastQuery().get("page_size")).toBe("50");
    expect(lastQuery().get("overdue")).toBe("true");
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText(/rows per page/i)).toHaveValue("50");
  });

  it("falls back to the defaults for page values it cannot use", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    await renderApp("/tasks?page=0&page_size=37");
    await screen.findByRole("table");
    expect(lastQuery().get("page")).toBe("1");
    expect(lastQuery().get("page_size")).toBe("20");
  });

  it("writes a filter to the URL in place, and goes back to page 1", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(60);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");
    const entries = router.history.length;

    await userEvent.setup().click(screen.getByRole("checkbox", { name: /pending/i }));

    await waitFor(() => expect(router.state.location.search).toEqual({ status: ["PENDING"] }));
    expect(router.history.length).toBe(entries);
    await waitFor(() => expect(lastQuery().get("page")).toBe("1"));
  });

  it("adds a history entry for a page move, so Back returns to the previous page", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(60);
    const { router } = await renderApp("/tasks");
    await screen.findByRole("table");
    const entries = router.history.length;

    await userEvent.setup().click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 2 }));
    expect(router.history.length).toBe(entries + 1);
    // Scoped to the table: jsdom applies no CSS, so the card renders the title too.
    expect(
      await within(await screen.findByRole("table")).findByText("Task on page 2"),
    ).toBeInTheDocument();

    // back() runs the router's load synchronously; outside act() React warns
    // and the console guard fails the test.
    act(() => router.history.back());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page"),
    );
    expect(router.state.location.search).toEqual({});
  });

  it("goes back to page 1 when the page size changes, and keeps the size in the URL", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");

    await userEvent.setup().selectOptions(screen.getByLabelText(/rows per page/i), "50");

    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));
    await waitFor(() => expect(lastQuery().get("page_size")).toBe("50"));
    expect(lastQuery().get("page")).toBe("1");
  });

  it("keeps the defaults out of the URL", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    const { router } = await renderApp("/tasks?page=2&page_size=50");
    await screen.findByRole("table");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Page 1" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));

    await user.selectOptions(screen.getByLabelText(/rows per page/i), "20");
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("clears filters and ordering but keeps the page size", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    const status = encodeURIComponent(JSON.stringify(["PENDING"]));
    const { router } = await renderApp(
      `/tasks?status=${status}&overdue=true&ordering=due_date&page_size=50`,
    );
    await screen.findByRole("table");

    await userEvent.setup().click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));
  });

  it("commits a typed date once, after the typing stops", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    const { router } = await renderApp("/tasks");
    await screen.findByRole("table");
    const input = screen.getByLabelText(/due after/i);

    // What a date input fires while its year is typed digit by digit.
    fireEvent.change(input, { target: { value: "0002-10-06" } });
    fireEvent.change(input, { target: { value: "0020-10-06" } });
    fireEvent.change(input, { target: { value: "2026-10-06" } });
    expect(input).toHaveValue("2026-10-06");

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        due_date_after: "2026-10-06T00:00:00.000Z",
      }),
    );
    await waitFor(() => expect(lastQuery().has("due_date_after")).toBe(true));
    expect(
      requested
        .filter((url) => url.searchParams.has("due_date_after"))
        .map((url) => url.searchParams.get("due_date_after")),
    ).toEqual(["2026-10-06T00:00:00.000Z"]);
  });

  it("does not bring a date back when Clear filters beats its commit", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    await renderApp("/tasks");
    await screen.findByRole("table");
    const input = screen.getByLabelText(/due after/i);

    fireEvent.change(input, { target: { value: "2026-10-06" } });
    await userEvent.setup().click(screen.getByRole("button", { name: /clear filters/i }));
    expect(input).toHaveValue("");

    // Outlive the 300 ms debounce, so a surviving commit would have fired.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(input).toHaveValue("");
    expect(requested.some((url) => url.searchParams.has("due_date_after"))).toBe(false);
  });

  it("lands on page 1, without an error, when the URL's page no longer exists", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(30); // two pages at 20
    const { router } = await renderApp("/tasks?page=3");

    expect(
      await within(await screen.findByRole("table")).findByText("Task on page 1"),
    ).toBeInTheDocument();
    expect(router.state.location.search).toEqual({});
    expect(requested.map((url) => url.searchParams.get("page"))).toEqual(["3", "1"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the current page on screen while the next one loads", async () => {
    signedInAs(SUPERVISOR);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${BASE}/tasks/`, async ({ request }) => {
        const url = new URL(request.url);
        requested.push(url);
        const page = url.searchParams.get("page") ?? "1";
        if (page === "2") await held;
        return HttpResponse.json({
          count: 40,
          next: null,
          previous: null,
          results: [task({ id: `task-${page}`, title: `Task on page ${page}` })],
        });
      }),
    );
    await renderApp("/tasks");
    const table = await screen.findByRole("table");

    await userEvent.setup().click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(lastQuery().get("page")).toBe("2"));

    // The same element, not a remount, and the pager is still there (D53).
    expect(screen.getByRole("table")).toBe(table);
    expect(table.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();

    release();
    expect(await within(table).findByText("Task on page 2")).toBeInTheDocument();
    expect(table.closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/features/tasks/TaskListPage`
Expected: the new `URL state` tests FAIL — for example, no button is named "Page 2" and nothing
is labelled "Rows per page". The existing tests still pass.

One exception is expected: "falls back to the defaults for page values it cannot use" already
passes. Task 5's validators drop `page=0` and `page_size=37`, and the old page falls back to
its defaults. It stays as the guard for that behaviour.

- [ ] **Step 3: Keep the previous page while the next loads (D53)**

In `frontend/src/features/tasks/hooks/useTasks.ts`, change the import to
`import { keepPreviousData, useQuery } from "@tanstack/react-query";` and `useTasks` to:

```ts
export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => taskService.listTasks(filters),
    // A page move keeps the current rows and the pager on screen instead of
    // unmounting them, which would drop keyboard focus (D53).
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 4: `TaskFilters` emits patches and drafts its dates (D46, D50)**

Replace `frontend/src/features/tasks/components/TaskFilters.tsx` with:

```tsx
import { Button } from "../../../components/Button";
import { useSearchParamDraft } from "../../../lib/useSearchParamDraft";
import { STATUS_LABEL } from "./StatusBadge";
import type { TaskFilters as Filters, TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/** What this panel edits. Paging and ordering belong to the list. */
export type FilterPatch = Partial<
  Pick<Filters, "status" | "due_date_after" | "due_date_before" | "overdue">
>;

interface TaskFiltersProps {
  filters: Filters;
  /** A patch, not a snapshot: a draft commits up to 300 ms later (D46). */
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}

/** "" clears the bound; otherwise the day at `time`, in UTC, as before. */
function toBound(day: string, time: string): string | undefined {
  return day === "" ? undefined : new Date(`${day}T${time}Z`).toISOString();
}

export function TaskFilters({ filters, onChange, onClear }: TaskFiltersProps) {
  const selected = filters.status ?? [];
  // Drafts, not the URL directly: a date typed digit by digit would be
  // reverted mid-entry by the router's transition (D50).
  const after = useSearchParamDraft(filters.due_date_after?.slice(0, 10) ?? "", (day) =>
    onChange({ due_date_after: toBound(day, "00:00:00") }),
  );
  const before = useSearchParamDraft(filters.due_date_before?.slice(0, 10) ?? "", (day) =>
    onChange({ due_date_before: toBound(day, "23:59:59") }),
  );

  function toggleStatus(status: TaskStatus) {
    const next = selected.includes(status)
      ? selected.filter((value) => value !== status)
      : [...selected, status];
    onChange({ status: next.length === 0 ? undefined : next });
  }

  function clear() {
    // A pending date commit would otherwise land after the clear and bring
    // the date back.
    after.cancel();
    before.cancel();
    onClear();
  }

  return (
    <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <fieldset className="mb-3">
        <legend className="mb-2 text-sm font-medium text-slate-700">Status</legend>
        <div className="flex flex-wrap gap-3">
          {STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selected.includes(status)}
                onChange={() => toggleStatus(status)}
              />
              {STATUS_LABEL[status]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="due-after" className="mb-1 block text-sm font-medium text-slate-700">
            Due after
          </label>
          <input
            id="due-after"
            type="date"
            value={after.draft}
            onChange={(event) => after.setDraft(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="due-before" className="mb-1 block text-sm font-medium text-slate-700">
            Due before
          </label>
          <input
            id="due-before"
            type="date"
            value={before.draft}
            onChange={(event) => before.setDraft(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filters.overdue === true}
            onChange={(event) => onChange({ overdue: event.target.checked ? true : undefined })}
          />
          Overdue only
        </label>
        <Button variant="secondary" onClick={clear} className="sm:ml-auto">
          Clear filters
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `TaskListPage` reads the URL and writes patches (D45, D47, D54)**

Replace `frontend/src/features/tasks/TaskListPage.tsx` with:

```tsx
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useState } from "react";

import type { TaskListSearch } from "../../app/search-params";
import { Button } from "../../components/Button";
import { FormError } from "../../components/FormError";
import { Pagination } from "../../components/Pagination";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../lib/pagination";
import { useAuth } from "../auth/hooks/useAuth";
import { TaskCard } from "./components/TaskCard";
import { TaskFilters, type FilterPatch } from "./components/TaskFilters";
import { TaskTable } from "./components/TaskTable";
import { useCompleteTask, useDeleteTask } from "./hooks/useTaskMutations";
import { useTasks } from "./hooks/useTasks";
import type { TaskFilters as Filters } from "./types";

type SearchUpdate = (prev: TaskListSearch) => TaskListSearch;

export function TaskListPage() {
  const { user } = useAuth();
  // The URL is the list's only state (D45): a dashboard card, a refresh, Back
  // and a shared link all arrive here the same way. Annotated because the
  // router is not type-registered, so useSearch returns any.
  const search: TaskListSearch = useSearch({ from: "/shell/tasks" });
  // A path, not the route id useSearch takes: given the id, navigate warns.
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isPending, isError, error, isPlaceholderData } = useTasks(filters);
  const complete = useCompleteTask();
  const remove = useDeleteTask();

  // An Operator's list is already scoped to themselves, so the column is noise.
  const showAssignee = user?.role === "SUPERVISOR";

  /**
   * Edits replace the history entry and keep the scroll position; only a page
   * move is navigation (D47). The updater form reads the latest URL, so a
   * draft committing late cannot undo a newer change (D46).
   */
  function editSearch(update: SearchUpdate) {
    void navigate({ search: update, replace: true, resetScroll: false });
  }

  /** Any filter change resets to page 1 — otherwise a filter applied on page 3
   *  shows an empty page and looks like "no results". */
  function applyFilters(patch: FilterPatch) {
    editSearch((prev) => ({ ...prev, ...patch, page: undefined }));
  }

  function clearFilters() {
    // Filters and ordering go, as before; the page size is a preference, not a filter.
    editSearch((prev) => ({ page_size: prev.page_size }));
  }

  function setPageSize(next: PageSize) {
    editSearch((prev) => ({ ...prev, page_size: next, page: undefined }));
  }

  function goToPage(next: number) {
    void navigate({ search: (prev: TaskListSearch) => ({ ...prev, page: next }) });
  }

  // A page past the end is a 404 — a stale link, or the last row of the last
  // page deleted. Page 1 never 404s, so this cannot loop (D54).
  const pageOutOfRange = error instanceof ApiError && error.status === 404 && page > 1;
  useEffect(() => {
    if (!pageOutOfRange) return;
    void navigate({
      search: (prev: TaskListSearch) => ({ ...prev, page: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [pageOutOfRange, navigate]);

  async function runAction(id: string, action: (id: string) => Promise<unknown>) {
    setActionError(null);
    setBusyId(id);
    try {
      await action(id);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
        <Link to="/tasks/new" className="ml-auto">
          <Button>New task</Button>
        </Link>
      </div>

      <TaskFilters filters={filters} onChange={applyFilters} onClear={clearFilters} />
      <FormError message={actionError} />

      {isPending && (
        <p role="status" className="text-sm text-slate-500">
          Loading tasks…
        </p>
      )}

      {isError && !pageOutOfRange && (
        <p role="alert" className="text-sm text-status-overdue">
          {error instanceof ApiError ? error.message : "Could not load tasks."}
        </p>
      )}

      {data !== undefined && data.results.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No tasks match these filters.
        </p>
      )}

      {data !== undefined && data.results.length > 0 && (
        // The previous page stays while the next loads (D53).
        <div
          aria-busy={isPlaceholderData}
          className={clsx("transition-opacity", isPlaceholderData && "opacity-60")}
        >
          {/* The table collapses to stacked cards below md (spec §11.6). */}
          <div className="hidden overflow-x-auto md:block">
            <TaskTable
              tasks={data.results}
              showAssignee={showAssignee}
              ordering={filters.ordering}
              onOrderingChange={(ordering) =>
                editSearch((prev) => ({ ...prev, ordering, page: undefined }))
              }
              onComplete={(id) => void runAction(id, complete.mutateAsync)}
              onDelete={(id) => void runAction(id, remove.mutateAsync)}
              busyId={busyId}
            />
          </div>
          <div className="md:hidden">
            {data.results.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showAssignee={showAssignee}
                onComplete={(id) => void runAction(id, complete.mutateAsync)}
                onDelete={(id) => void runAction(id, remove.mutateAsync)}
                isBusy={busyId === task.id}
              />
            ))}
          </div>

          <Pagination
            count={data.count}
            page={page}
            pageSize={pageSize}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </section>
  );
}
```

If iteration 3 has landed and you rebased, keep its `DeleteTaskDialog` wiring (`pendingDelete`,
`onDelete`, the dialog element). Apply only the filters, pager, wrapper and recovery changes above
around it.

- [ ] **Step 6: Run the tests, the typecheck and lint**

Run: `npm run --prefix frontend test`
Expected: all pass. That includes every existing `TaskListPage` test, the dashboard drill-through
tests (unmodified, spec §4.5) and the `useTasks` hook tests.

Run: `npm run --prefix frontend typecheck`
Expected: exit 0.

Run: `npm run --prefix frontend lint`
Expected: no errors.

If a dashboard drill-through test fails, the cause is in the `/tasks` validator or the
middleware, not the test. The spec requires those tests to pass unmodified.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/tasks/TaskListPage.tsx frontend/src/features/tasks/components/TaskFilters.tsx frontend/src/features/tasks/hooks/useTasks.ts frontend/src/features/tasks/TaskListPage.test.tsx
git commit -m "feat: keep the task list's filters, sort, page and page size in the URL"
```

---

## Task 8: The user list reads and writes the URL (spec §4.2–§4.4)

**Files:**
- Modify: `frontend/src/features/users/UserListPage.tsx`, `frontend/src/features/users/hooks/useUsers.ts`
- Delete: `frontend/src/features/tasks/components/Pagination.tsx`
- Test: `frontend/src/features/users/UserListPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/features/users/UserListPage.test.tsx`, add a new `describe` block after the
existing one:

```tsx
describe("UserListPage URL state", () => {
  it("reads its filters, search and page size from the URL", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users?role=OPERATOR&search=omar&page_size=10");
    await screen.findByRole("table");
    expect(lastQuery().get("role")).toBe("OPERATOR");
    expect(lastQuery().get("search")).toBe("omar");
    expect(lastQuery().get("page_size")).toBe("10");
    expect(screen.getByLabelText(/search/i)).toHaveValue("omar");
    expect(screen.getByLabelText(/^role$/i)).toHaveValue("OPERATOR");
    expect(screen.getByLabelText(/rows per page/i)).toHaveValue("10");
  });

  it("keeps a numeric search as text", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users?search=2026");
    await screen.findByRole("table");
    expect(screen.getByLabelText(/search/i)).toHaveValue("2026");
    expect(lastQuery().get("search")).toBe("2026");
  });

  it("drops a role it does not know", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users?role=ROOT");
    await screen.findByRole("table");
    expect(lastQuery().has("role")).toBe(false);
    expect(screen.getByLabelText(/^role$/i)).toHaveValue("");
  });

  it("sends one request per pause in typing, not one per keystroke", async () => {
    usersRespondWith([operator()]);
    const { router } = await renderApp("/users");
    await screen.findByRole("table");

    await userEvent.setup().type(screen.getByLabelText(/search/i), "omar");

    await waitFor(() => expect(router.state.location.search).toEqual({ search: "omar" }));
    await waitFor(() => expect(lastQuery().get("search")).toBe("omar"));
    expect(
      requested
        .filter((url) => url.searchParams.has("search"))
        .map((url) => url.searchParams.get("search")),
    ).toEqual(["omar"]);
  });

  it("empties the search box when navigation clears a committed search", async () => {
    usersRespondWith([operator()]);
    const { router } = await renderApp("/users");
    await screen.findByRole("table");
    const user = userEvent.setup();

    // Typed and committed, so the clear below must beat the draft's own echo
    // check rather than an initial value.
    await user.type(screen.getByLabelText(/search/i), "omar");
    await waitFor(() => expect(router.state.location.search).toEqual({ search: "omar" }));

    await user.click(screen.getByRole("link", { name: /^users$/i }));

    await waitFor(() => expect(screen.getByLabelText(/search/i)).toHaveValue(""));
    expect(router.state.location.search).toEqual({});
    await waitFor(() => expect(lastQuery().has("search")).toBe(false));
  });

  it("lands on page 1, without an error, when the URL's page no longer exists", async () => {
    server.use(
      http.get(`${BASE}/users/`, ({ request }) => {
        const url = new URL(request.url);
        requested.push(url);
        if (url.searchParams.get("page") === "4") {
          return HttpResponse.json(
            { detail: "Invalid page.", code: "not_found", errors: null },
            { status: 404 },
          );
        }
        return HttpResponse.json({ count: 1, next: null, previous: null, results: [operator()] });
      }),
    );
    const { router } = await renderApp("/users?page=4");
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual({});
    expect(requested.map((url) => url.searchParams.get("page"))).toEqual(["4", "1"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/features/users/UserListPage`
Expected: the new tests FAIL — for example, the Search box is empty for `?search=omar`, and nothing
is labelled "Rows per page". The existing tests still pass.

One exception is expected: "drops a role it does not know" already passes, because the old page
ignores the URL altogether. After this task it guards the validator path instead.

- [ ] **Step 3: Keep the previous page while the next loads (D53)**

In `frontend/src/features/users/hooks/useUsers.ts`, change the import to
`import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";`
and `useUsers` to:

```ts
export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => userService.listUsers(filters),
    // A page move keeps the current rows and the pager on screen (D53).
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 4: Convert the page**

Replace `frontend/src/features/users/UserListPage.tsx` with:

```tsx
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useState } from "react";

import type { UserListSearch } from "../../app/search-params";
import { Button } from "../../components/Button";
import { Pagination } from "../../components/Pagination";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../lib/pagination";
import { useSearchParamDraft } from "../../lib/useSearchParamDraft";
import { ROLES, type Role } from "../auth/types";
import { DeleteUserDialog } from "./components/DeleteUserDialog";
import { UserCard } from "./components/UserCard";
import { UserTable } from "./components/UserTable";
import { useDeleteUser, useUsers } from "./hooks/useUsers";
import type { UserDetail, UserFilters } from "./types";

type SearchUpdate = (prev: UserListSearch) => UserListSearch;
type UserFilterPatch = Partial<Pick<UserListSearch, "role" | "is_active" | "search">>;

export function UserListPage() {
  // The URL is the list's only state (D45). Annotated because the router is
  // not type-registered, so useSearch returns any.
  const search: UserListSearch = useSearch({ from: "/shell/users" });
  // A path, not the route id useSearch takes: given the id, navigate warns.
  const navigate = useNavigate({ from: "/users" });
  const page = search.page ?? 1;
  const pageSize: PageSize = search.page_size ?? DEFAULT_PAGE_SIZE;
  const filters: UserFilters = {
    role: search.role,
    is_active: search.is_active,
    search: search.search,
    page,
    page_size: pageSize,
  };
  const [pendingDelete, setPendingDelete] = useState<UserDetail | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, error, isPlaceholderData } = useUsers(filters);
  const remove = useDeleteUser();

  /** Edits replace the history entry and keep the scroll position (D47). */
  function editSearch(update: SearchUpdate) {
    void navigate({ search: update, replace: true, resetScroll: false });
  }

  /** Any filter change resets to page 1, or a filter applied on page 3 looks empty. */
  function applyFilters(patch: UserFilterPatch) {
    editSearch((prev) => ({ ...prev, ...patch, page: undefined }));
  }

  // Typed text goes through a draft: the router's transition would revert a
  // controlled input bound straight to the URL (D50).
  const searchDraft = useSearchParamDraft(search.search ?? "", (value) =>
    applyFilters({ search: value === "" ? undefined : value }),
  );

  function setPageSize(next: PageSize) {
    editSearch((prev) => ({ ...prev, page_size: next, page: undefined }));
  }

  function goToPage(next: number) {
    void navigate({ search: (prev: UserListSearch) => ({ ...prev, page: next }) });
  }

  // A page past the end is a 404; page 1 never is, so this cannot loop (D54).
  const pageOutOfRange = error instanceof ApiError && error.status === 404 && page > 1;
  useEffect(() => {
    if (!pageOutOfRange) return;
    void navigate({
      search: (prev: UserListSearch) => ({ ...prev, page: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [pageOutOfRange, navigate]);

  function beginDelete(user: UserDetail) {
    setDeleteError(null);
    setPendingDelete(user);
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "Could not deactivate that user.",
      );
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Users</h1>
        <Link to="/users/new" className="ml-auto">
          <Button>New user</Button>
        </Link>
      </div>

      <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label htmlFor="search" className="mb-1 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="search"
              type="search"
              value={searchDraft.draft}
              onChange={(event) => searchDraft.setDraft(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="role-filter" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="role-filter"
              value={search.role ?? ""}
              onChange={(event) =>
                applyFilters({ role: (event.target.value || undefined) as Role | undefined })
              }
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={search.is_active === false}
              onChange={(event) =>
                applyFilters({ is_active: event.target.checked ? false : undefined })
              }
            />
            Inactive only
          </label>
        </div>
      </section>

      {isPending && (
        <p role="status" className="text-sm text-slate-500">
          Loading users…
        </p>
      )}

      {isError && !pageOutOfRange && (
        <p role="alert" className="text-sm text-status-overdue">
          {error instanceof ApiError ? error.message : "Could not load users."}
        </p>
      )}

      {data !== undefined && data.results.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No users match these filters.
        </p>
      )}

      {data !== undefined && data.results.length > 0 && (
        // The previous page stays while the next loads (D53).
        <div
          aria-busy={isPlaceholderData}
          className={clsx("transition-opacity", isPlaceholderData && "opacity-60")}
        >
          {/* The table collapses to stacked cards below md (spec §5.2). */}
          <div className="hidden overflow-x-auto md:block">
            <UserTable users={data.results} onDelete={beginDelete} />
          </div>
          <div className="md:hidden">
            {data.results.map((user) => (
              <UserCard key={user.id} user={user} onDelete={beginDelete} />
            ))}
          </div>

          <Pagination
            count={data.count}
            page={page}
            pageSize={pageSize}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {pendingDelete !== null && (
        <DeleteUserDialog
          user={pendingDelete}
          error={deleteError}
          isDeleting={remove.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 5: Delete the old pager**

```bash
git rm frontend/src/features/tasks/components/Pagination.tsx
```

Then confirm nothing still imports it:

Run: `git grep -n "components/Pagination" -- frontend/src`
Expected: only the two `../../components/Pagination` imports, in `TaskListPage.tsx` and
`UserListPage.tsx`.

- [ ] **Step 6: Run the tests, the typecheck and lint**

Run: `npm run --prefix frontend test`
Expected: all pass. That includes the unchanged "filters by role and by inactive, and searches"
test: the 300 ms debounce sits inside `waitFor`'s one-second default.

Run: `npm run --prefix frontend typecheck`
Expected: exit 0.

Run: `npm run --prefix frontend lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/users/UserListPage.tsx frontend/src/features/users/hooks/useUsers.ts frontend/src/features/users/UserListPage.test.tsx
git commit -m "feat: keep the user list's filters, search, page and page size in the URL"
```

---

## Task 9: Page titles (spec §6, D57, D58)

**Files:**
- Modify: `frontend/src/app/router.tsx`, `frontend/index.html`
- Test: `frontend/src/app/page-titles.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/page-titles.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import indexHtml from "../../index.html?raw";
import { currentUser } from "../test/msw-handlers";
import { server } from "../test/msw-server";
import { renderApp } from "../test/render-app";

const BASE = "http://localhost:8000/api/v1";
const ID = "0199a0f0-0000-7000-8000-0000000000a1";
const SUFFIX = "Task Management System";

const notFound = () =>
  HttpResponse.json({ detail: "Not found.", code: "not_found", errors: null }, { status: 404 });

describe("page titles", () => {
  it.each([
    ["/login", null, "Sign in"],
    ["/dashboard", "SUPERVISOR", "Dashboard"],
    ["/tasks", "SUPERVISOR", "Tasks"],
    ["/tasks/new", "SUPERVISOR", "New task"],
    [`/tasks/${ID}`, "SUPERVISOR", "Task details"],
    [`/tasks/${ID}/edit`, "SUPERVISOR", "Edit task"],
    ["/users", "ADMIN", "Users"],
    ["/users/new", "ADMIN", "New user"],
    [`/users/${ID}`, "ADMIN", "Edit user"],
  ] as const)("titles %s", async (path, role, page) => {
    // The detail pages' data is beside the point; a 404 renders their error
    // state quietly. Registered FIRST: server.use prepends, and /users/:userId/
    // would otherwise also answer /users/me/.
    server.use(
      http.get(`${BASE}/tasks/:taskId/`, notFound),
      http.get(`${BASE}/users/:userId/`, notFound),
    );
    if (role === null) {
      server.use(
        http.post(`${BASE}/auth/refresh/`, () =>
          HttpResponse.json(
            { detail: "no cookie", code: "refresh_cookie_missing" },
            { status: 401 },
          ),
        ),
      );
    } else {
      server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json({ ...currentUser, role })));
    }

    await renderApp(path);

    await waitFor(() => expect(document.title).toBe(`${page} · ${SUFFIX}`));
  });

  it("follows client-side navigation, not just the first render", async () => {
    await renderApp("/dashboard"); // the default fixture is a Supervisor
    await waitFor(() => expect(document.title).toBe(`Dashboard · ${SUFFIX}`));

    await userEvent.setup().click(await screen.findByRole("link", { name: /^tasks$/i }));

    await waitFor(() => expect(document.title).toBe(`Tasks · ${SUFFIX}`));
  });

  it("leaves the title to the routes", () => {
    // React 19 hoists a route's <title> into <head> AFTER any static one, and
    // the tab shows the first — so a static title would win forever (D58).
    expect(indexHtml).not.toMatch(/<title/i);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run --prefix frontend test -- src/app/page-titles`
Expected: FAIL. Each route test times out with `document.title` as `""`, and the `index.html` test
finds `<title>tms-frontend</title>`.

- [ ] **Step 3: Declare the titles**

In `frontend/src/app/router.tsx`:

1. Add `HeadContent` to the `@tanstack/react-router` import.
2. Above `rootRoute`, add:

   ```tsx
   const APP_NAME = "Task Management System";

   /** A route's tab title: the page first, so it survives a narrow tab (D57). */
   function pageTitle(page: string) {
     return () => ({ meta: [{ title: `${page} · ${APP_NAME}` }] });
   }
   ```
3. Replace `rootRoute` with:

   ```tsx
   // The root route needs an explicit component: without one it renders nothing and
   // no child route ever appears. HeadContent renders the deepest match's title, and
   // React 19 hoists it into <head>; the root's own title is the fallback (D57).
   const rootRoute = createRootRouteWithContext<RouterContext>()({
     component: () => (
       <>
         <HeadContent />
         <Outlet />
       </>
     ),
     head: () => ({ meta: [{ title: APP_NAME }] }),
   });
   ```
4. Add a `head` line to each of these routes. `indexRoute` and `shellRoute` get none: `/` only
   redirects, and the shell is a layout.

   | Route constant | Add |
   |---|---|
   | `loginRoute` | `head: pageTitle("Sign in"),` |
   | `dashboardRoute` | `head: pageTitle("Dashboard"),` |
   | `tasksRoute` | `head: pageTitle("Tasks"),` |
   | `taskCreateRoute` | `head: pageTitle("New task"),` |
   | `taskDetailRoute` | `head: pageTitle("Task details"),` |
   | `taskEditRoute` | `head: pageTitle("Edit task"),` |
   | `usersRoute` | `head: pageTitle("Users"),` |
   | `userCreateRoute` | `head: pageTitle("New user"),` |
   | `userEditRoute` | `head: pageTitle("Edit user"),` |

- [ ] **Step 4: Remove the static title (D58)**

In `frontend/index.html`, delete the line `<title>tms-frontend</title>`.

- [ ] **Step 5: Run the tests, the typecheck and lint**

Run: `npm run --prefix frontend test`
Expected: all pass.

Run: `npm run --prefix frontend typecheck`
Expected: exit 0. `vite/client`'s types declare the `?raw` import.

Run: `npm run --prefix frontend lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/router.tsx frontend/index.html frontend/src/app/page-titles.test.tsx
git commit -m "feat: name the current page in the browser tab"
```

---

## Task 10: Documentation (spec §7)

**Files:**
- Modify: `README.md`, `docs-external/PROMPT-LOGS.md`

- [ ] **Step 1: Key implementation decisions**

In `README.md`, directly before `## Deliberate overrides of AGENTS.md`, add:

```markdown
### List state lives in the URL (D45–D56)

Both lists keep their filters, sort, page and page size in the URL. The URL is the only copy:
each page derives its API query from the route's search params and writes every change back
with `navigate`. Refresh, Back/Forward, a shared link and a dashboard card all therefore land
on the same view. Before, the task list read the URL once and then kept a private copy, so
the URL went stale after the first filter.

- **Validated in one place.** `src/app/search-params.ts` drops anything a list cannot use: a
  page that is not a positive integer, a page size outside 10/20/50/100, an unknown role.
  `stripSearchParams` keeps page 1 and size 20 out of URLs, so one view has one URL.
- **Edits replace, page moves push.** Back undoes navigation, not each checkbox. Every replace
  passes `resetScroll: false`, because the router otherwise scrolls to the top even on a replace.
- **Typed text goes through a 300 ms draft.** The router commits search changes in a React
  transition after an async load. A controlled input bound straight to a search param is
  therefore reverted by React and then jumps. The Search box and the date inputs keep a local
  draft and commit once typing pauses, which also means one request per pause, not per
  keystroke.
- **The pager is numbered and driven by `count`:** first, last, and the current page ±2. The
  previous page stays on screen while the next loads (`keepPreviousData`), so a click never
  unmounts the pager or drops keyboard focus. A page that no longer exists, such as a stale
  link or the last row of the last page deleted, returns to page 1 instead of showing an error.

### Page titles (D57, D58)

Every route declares its tab title with the router's `head` option, as "Tasks · Task
Management System", page name first so it survives a narrow tab. `<HeadContent />` in the root
route renders it. `index.html` deliberately has no `<title>`: React 19 hoists the route's title
into `<head>` after any static one, and the browser shows the first.
```

- [ ] **Step 2: The AGENTS.md override**

In the `## Deliberate overrides of AGENTS.md` table, add a row:

```markdown
| **A fourth kind of state** | frontend §4: three kinds of state — server state in TanStack Query, shared client state in Context, local UI state in `useState` | List view state (filters, sort, page, page size) lives in the URL, owned by the router | A list's view must survive refresh, Back and a shared link, and the dashboard's cards must be able to open it. Only the URL does all four. Typed text keeps a short-lived local draft (D50), which is §4's local UI state. |
```

- [ ] **Step 3: The GenAI record**

In `README.md`, at the end of `## GenAI prompt and validation record`, add:

```markdown
**List navigation.** The spec review caught five claims that would have failed at
implementation:
- the router resets scroll on `replace` navigations too, unless told not to;
- a date picked and then cleared within the debounce would have reappeared;
- the spec's own snippets passed an optional page into a required prop and did not typecheck;
- `useNavigate` given the route id rather than its path logs a warning that the console guard
  fails on;
- a `className="px-3"` override cannot beat `Button`'s `px-4`, because classes are merged with
  plain `clsx`.

The request's own example pager, "1, 3, 5 (current), 7, 10", read two ways. The project owner
chose a contiguous window over literal steps of two.
```

Then append anything implementation itself proved wrong, in the same style. If nothing was,
leave it at that rather than inventing a finding.

- [ ] **Step 4: The prompt log**

At the end of `docs-external/PROMPT-LOGS.md`, append:

````markdown


## List navigation
```
using /superpowers-extended-cc:using-git-worktrees  and /superpowers-extended-cc:brainstorming, analyze and plan required changes for the following frontend improvements:

- include pagination steps component in lists to allow easier navigation between pages, pages number as "first, prev, 1, 3, 5(current), 7, 10, next, last"
- include page size in filter parameters according to backend max_page_size of 100, available page sizes (10, 20, 50, 100)
- include URL params during lists filtering, the params are included only when the filter comes from dashboard cards
```
```
I identify another minor issue, browser tabs aren't showing current page name, "dashboard, tasks, users, detail, etc"
```
````

- [ ] **Step 5: Commit**

```bash
git add README.md docs-external/PROMPT-LOGS.md
git commit -m "docs: record the list navigation decisions and prompts"
```

---

## Task 11: Full verification

Every task verified its own slice. This runs what CI runs, together, plus the browser checks
jsdom cannot make.

- [ ] **Step 1: Frontend gates**

```bash
npm run --prefix frontend test
npm run --prefix frontend typecheck
npm run --prefix frontend lint
npm run --prefix frontend build
```
Expected: all pass. The test count is the baseline 89 plus every test this plan added.

- [ ] **Step 2: Backend, unchanged but run as CI runs it**

```bash
docker compose exec -T -e DJANGO_SETTINGS_MODULE=config.settings.test backend pytest -q
```

The Compose `backend` service bind-mounts the **main checkout's** `backend/`. The backend is
untouched on this branch, so the two trees are identical and the result stands for both.
Expected: 358 passed, coverage 100%.

- [ ] **Step 3: The browser**

The Compose `frontend` service serves the main checkout, so run this worktree's dev server on
the same port. The API's CORS and cookie settings expect `localhost:5173`.

```bash
docker compose stop frontend
npm run --prefix frontend dev
```

To get enough rows for ten pages at the default size, top the local demo data up. This adds rows
to the local development database only.

```bash
docker compose exec backend python manage.py seed_demo_data --tasks 200
```

Sign in as `supervisor@demo.local`, then `admin@demo.local`, and confirm each of these:

- **Pager:**
  - At ≥ `lg`: `« First ‹ Prev 1 … 3 4 [5] 6 7 … 10 Next › Last »`, "81–100 of …" and
    Rows per page.
  - Below `sm` (DevTools device mode): `« ‹ Page 5 of 10 › »`, wrapping cleanly with no
    horizontal scroll.
- **Keyboard focus:** tab to "Page 6" and press Enter. Focus stays on that button, now the
  current page. The rows dim briefly instead of disappearing.
- **History:** tick a status, then press Back. That leaves the list, because filters replaced
  the entry. Click page 2, then page 3, then Back: the list shows page 2.
- **Shared view:** copy the URL of a filtered, paged, resized list into a new tab. It opens the
  same view.
- **Typing:**
  - Type into Users → Search quickly, then edit the middle of the text. No characters are
    reverted and the cursor never jumps. The Network tab shows one request per pause.
  - Type a Due after year digit by digit with the keyboard. It is accepted.
- **Dashboard cards:** each card still opens a list whose count matches the card.
- **Out-of-range page:** edit the URL to `?page=99`. The list shows page 1 with no error.
- **Tab titles:** "Dashboard · Task Management System", "Tasks · …", "Task details · …",
  "Users · …", "Sign in · …" after signing out.
- **Console:** no errors or warnings in any of the flows above (frontend AGENTS.md §7).

Then restore the stack:

```bash
docker compose start frontend
```

- [ ] **Step 4: Commit anything the verification changed**

If nothing changed, there is nothing to commit — say so rather than inventing a commit.

---

## Task 12: Persist insights to `claude-insights/`

**Files:**
- Modify: `D:\VirtualWrapper\code\claude-insights\projects\task-management-system.md`

- [ ] **Step 1: Read what is already there**

The file covers iterations 1 and 2. Append; do not duplicate or restructure.

- [ ] **Step 2: Add only what cost time to discover**

Candidates from this work, each non-obvious and transferable:

- **TanStack Router commits search changes in a transition.** `router.load()` is async and the
  matches commit through `React.startTransition`, so `useSearch` changes after `onChange`
  returns. A controlled text or date input bound straight to a search param is reverted by
  React and then jumps. Discrete controls are fine. Text needs a draft, and "did I write this?"
  stays a single comparison only while a debounce guarantees one write in flight.
- **`resetScroll` defaults to `true` even for `replace: true`.** Filter edits scroll to the top
  unless every replace passes `resetScroll: false`.
- **`useSearch` takes the route id and `useNavigate` the path.** With a pathless layout
  (`id: "shell"`), `useSearch({ from: "/shell/tasks" })` is right, while
  `useNavigate({ from: "/shell/tasks" })` logs "Could not find match" — fatal under a console
  guard.
- **An unregistered router types `useSearch` as `any`.** Annotate it, or the URL state is
  untyped end to end.
- **React 19 `<title>` hoisting does not replace a static `<title>`.** It appends, and the
  browser shows the first, so route-managed titles require removing the one in `index.html`.
- **`keepPreviousData` is an accessibility fix for numbered pagers.** Without it, every page
  click unmounts the pager and drops focus.
- **MSW `server.use` prepends.** A later `/users/:userId/` handler shadows an earlier
  `/users/me/`, so register catch-alls first.

- [ ] **Step 3: Commit**

```bash
git -C D:/VirtualWrapper/code/claude-insights add projects/task-management-system.md
git -C D:/VirtualWrapper/code/claude-insights commit -m "docs: add list navigation insights"
```

That repository is mostly untracked, and unrelated files there may carry modifications from
other work. Stage narrowly, as above.
