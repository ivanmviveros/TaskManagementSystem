# TanStack Form, Table and Store Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's hand-written forms, tables and component-local state with TanStack Form, TanStack Table and TanStack Store, with no change in behaviour.

**Architecture:** Each library through its own composition API: `createFormHook` with project field components, `createTableHook` with a registered `TableView` and `Pagination`, and `useCreateStore` + `createStoreContext` for per-mount feature stores and one session store. The URL stays the only copy of list state (D45): tables are controlled from it and write back through `navigate`. Thin project glue: one server-error mapper, one URL-sync hook, two mapping helpers (`sorting.ts`, `routePaginationChange`).

**Tech Stack:** React 19, TypeScript 6, Vite 8, TanStack Query 5 / Router 1 (existing), `@tanstack/react-form` 1.33, `@tanstack/react-table` 9.2, `@tanstack/react-store` 0.11, Vitest 5 + Testing Library + MSW, oxlint.

**Spec:** [`docs/superpowers/specs/2026-10-07-tanstack-form-table-store-design.md`](../specs/2026-10-07-tanstack-form-table-store-design.md). Decision numbers (D79–D88) refer to it; `docs/TECHNICAL-DECISIONS.md` on `main` reserves them for this branch.

**Branch state:** `main` was merged into the branch at `607262f` (after the plan was written, `main` gained the docs reorganisation and structured logging, D89–D93; none of it touches `frontend/src`). If `main` moves again before Phase 5, merge it again first (Task 21 Step 0).

**Deliberate deviations from the spec's wording**, all keeping its behaviour:
- **`onDeleted` is an option of `useTaskActions(store, { onDeleted })`**, not an argument of `confirmDelete` (spec §4.2), so the dialog's `onConfirm` stays a zero-argument callback.
- **Row actions arrive through context, not by calling `useTaskActions()` in each row** (spec §4.2). The page calls `useTaskActions(store)` once and puts `{ store, actions }` in context; rows read their busy flag from the store and call `actions`. One mutation observer per page instead of one per row.
- **The delete-flow actions are named `beginDelete`, `cancelDelete`, `failDelete`, plus `clearDeleteError`** (spec §4.2 says `begin`, `cancel`, `fail`): the prefixes keep them distinct when spread beside `startAction`/`failAction`, and `clearDeleteError` is today's "reset the error before each attempt".
- **`setServerErrors`/`clearServerErrors` take `ServerErrorTarget = Pick<AnyFormApi, "setErrorMap">`** (spec §5.2 says `AnyFormApi`): a concrete `FormApi` is not assignable to `AnyFormApi` (its `TSubmitMeta` is `never`), and the helpers only call `setErrorMap`.
- **`SortHeader` is a plain component taking `column`**, not a registered `headerComponent` (spec §6.1). A registered header component needs `table.AppHeader` around each `<th>` to read its context; passing the column needs nothing. Markup, `aria-sort` and behaviour are as specified.

---

## Conventions for every task

- **Working directory** for every `npm` command: `D:/VirtualWrapper/code/TaskManagementSystem/.worktrees/refactor-tanstack/frontend`. All paths below are relative to `frontend/` unless they start with `docs/` or `README.md` (repository root of the worktree).
- **One command per Bash call** (no `&&` chains, no `$(...)`). `git` runs from the worktree; it is already on branch `refactor/tanstack-form-table-store`.
- **Gates** (run at the end of every task unless the task says otherwise):
  - `npm run typecheck` → no output after the script line.
  - `npm run lint` → exit 0 and **no new warning**. Today there are 5 (`providers.tsx`, `StatusBadge.tsx`, `render-app.tsx` ×2, `AuthContext.tsx`); Task 3 deletes `AuthContext.tsx`, after which the other 4 remain. oxlint also runs the React Compiler rules (immutability, refs, exhaustive-deps…) by default; they raised nothing on the prototype of this code.
  - `npm test` → all files pass. The baseline is **19 files, 303 tests**; each task's new tests add to it, so check "0 failed" rather than an exact count. The jsdom `Not implemented: Window's scrollTo()` lines are pre-existing noise.
- **End-of-phase gates** (after Tasks 6, 12, 15 and 20), in addition: `npm run build` (succeeds) and `npm ls @tanstack/store` (one version, the rest `deduped`) — spec §7.4.
- **Behaviour does not change.** The existing tests are the regression net. Edit an existing test only where a task says so; any other edit must be behaviour-neutral and explained in the commit message.
- **Commit messages** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
  (Shown once here; every `git commit -m` below needs it as the last paragraph.)
- **Facts verified while writing this plan** (against the installed 1.33.5 / 9.2.6 / 0.11.2 packages, by typechecking a prototype and running it under Node and jsdom):
  - Form: an `onServer` error blocks the next `handleSubmit` until cleared; `setErrorMap({ onServer: { form: undefined, fields: {} } })` clears form **and** fields, `{ onServer: undefined }` does not; editing a field does not clear its `onServer` error; `FormApi.update` rewrites an untouched form when `defaultValues` change; `setFieldValue(name, v, { dontRunListeners: true })` skips listeners; `form.AppField` re-renders its children on value and error-map changes.
  - Table: with `sortDescFirst: false` + `enableSortingRemoval: false` a click cycles inactive → asc → desc → asc; `getCanSort()` is **true for any accessor column** unless it sets `enableSorting: false` (display columns are false); `rowCount: 187, pageSize: 20` → `getPageCount() === 10`; `setPageSize(50)` from page index 4 proposes `{ pageIndex: 1, pageSize: 50 }`; controlled `state` is reflected **in the same render** (no one-render lag) for pagination, sorting, column visibility and rows, including inside a registered table component.
  - Store: `useCreateStore(initial, actionsFactory)` returns a writable store with `.actions`; passing a function as the first argument creates a *read-only* store, so never pass a ready-made store.

## File map

**Create**

| File | Responsibility |
|---|---|
| `src/lib/store-api.ts` | `StoreApi<T>`: the `{ setState, get }` argument of every actions factory |
| `src/lib/delete-flow.ts` (+ `.test.ts`) | Generic delete-dialog slice: state and actions |
| `src/features/auth/session-store.ts` (+ `.test.ts`) | Session state, actions, `AuthState` type |
| `src/features/auth/session-context.ts` | `createStoreContext` for the session store |
| `src/features/auth/SessionProvider.tsx` | Creates the session store per mount; bootstrap effect |
| `src/features/tasks/task-actions-store.ts` (+ `.test.ts`) | Task list/detail UI state: delete flow, busy row, action error |
| `src/features/tasks/task-actions-context.ts` | Context carrying `{ store, actions }` to rows and cards |
| `src/features/tasks/hooks/useTaskActions.ts` | Complete/delete actions over a task-actions store |
| `src/features/users/user-list-store.ts` | User list UI state: delete flow |
| `src/features/users/user-list-context.ts` | Context carrying `{ store }` to rows and cards |
| `src/features/users/components/UserRowActions.tsx` | Edit + Deactivate buttons, shared by table cell and card |
| `src/features/tasks/components/assignee-combobox-store.ts` | Combobox open / query / active option |
| `src/components/form/server-errors.ts` (+ `.test.ts`) | `toServerErrors`, `setServerErrors`, `clearServerErrors`, `serverMessage` |
| `src/components/form/form-contexts.ts` | `createFormHookContexts()` |
| `src/components/form/fields/{TextField,TextareaField,SelectField,CheckboxField,CheckboxGroupField}.tsx` | Bound field components |
| `src/components/form/SubmitButton.tsx`, `ServerFormError.tsx` | Form components |
| `src/components/form/app-form.ts` (+ `app-form.test.tsx`) | `useAppForm` |
| `src/features/tasks/task-form-values.ts` (+ `.test.ts`) | `TaskFormDraft`, `taskSnapshot`, `toTaskInput`, `TaskFormValues` |
| `src/lib/useUrlFieldSync.ts` (+ `.test.ts`) | Field ↔ URL sync with echo queue, debounce, cancel |
| `src/features/users/components/UserFilters.tsx` | The user list's filter panel |
| `src/components/table/{table-features,table-contexts,app-table}.ts` | Table setup |
| `src/components/table/{TableView,SortHeader,Pagination}.tsx` (+ `Pagination.test.tsx`) | Table components |
| `src/features/tasks/components/TaskTitleLink.tsx` | Title link carrying the list search (D70) |
| `src/features/tasks/task-columns.tsx`, `src/features/users/user-columns.tsx` | Column definitions |

**Delete:** `src/App.tsx`, `src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`, `src/features/auth/AuthContext.tsx`, `src/lib/useSearchParamDraft.ts` (+ test), `src/components/Pagination.tsx` (+ test), `src/features/tasks/components/TaskTable.tsx`, `src/features/users/components/UserTable.tsx`.

**Modify:** `providers.tsx`, `router.tsx`, `useRouterAuthSync.ts`, `test/render-app.tsx`, `hooks/useAuth.ts`, `components/TextField.tsx`, `LoginPage.tsx`, `UserForm.tsx`, `TaskForm.tsx`, `TaskFormPage.tsx`, `AssigneeCombobox.tsx`, `TaskFilters.tsx`, `TaskListPage.tsx`, `TaskDetailPage.tsx`, `TaskRowActions.tsx`, `TaskCard.tsx`, `UserListPage.tsx`, `UserCard.tsx`, `sorting.ts` (+ test), `lib/pagination.ts` (+ test), `lib/useDebouncedValue.ts` (comment), comments in `lib/api-client.ts`, `app/layout/AppShell.test.tsx`, `test/msw-handlers.ts`, `package.json`/`package-lock.json`, tests named in tasks; docs: `docs/TECHNICAL-DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/GENAI-WORKFLOW.md`, `frontend/README.md`, `README.md`, `SUMMARY.md`, `docs-external/PROMPT-LOGS.md`, `docs/qa/2026-10-07-frontend-qa-report.md`.

---

# Phase 1 — Store

### Task 1: Dependencies and dead code

**Files:**
- Modify: `package.json`, `package-lock.json`
- Delete: `src/App.tsx`, `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`

- [ ] **Step 1: Record the bundle baseline**

Run: `npm run build`
Expected: Vite prints a table ending with a line like `dist/assets/index-XXXX.js   NNN.NN kB │ gzip: NN.NN kB`. Write down the **gzip** size of that JS line; it goes into this task's commit message and, in Task 21, the README.

- [ ] **Step 2: Install the three packages**

Run: `npm install @tanstack/react-form@^1.33.5 @tanstack/react-table@^9.2.6 @tanstack/react-store@^0.11.2`
Expected: `added N packages`; `package.json` `dependencies` now lists the three.

- [ ] **Step 3: Check there is one Store copy**

Run: `npm ls @tanstack/store`
Expected: every `@tanstack/store@0.11.x` line is the same version, all but one marked `deduped`.

- [ ] **Step 4: Confirm the dead files are unused, then delete them**

Run: `git grep -n -e "App.css" -e "assets/hero" -e "assets/react.svg" -e "assets/vite.svg" -e "from \"./App\"" -e "from './App'" -- src index.html`
Expected: matches only inside `src/App.tsx`.

Run: `git rm src/App.tsx src/App.css src/assets/hero.png src/assets/react.svg src/assets/vite.svg`

- [ ] **Step 5: Gates**

Run the three gates. Expected: typecheck clean, lint 5 warnings (unchanged), tests 19 files / 303 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add TanStack Form, Table and Store; drop the unused Vite template App

Bundle baseline before the refactor: <gzip kB from Step 1> kB gzip (index JS).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The store helper and the delete-flow slice

**Files:**
- Create: `src/lib/store-api.ts`, `src/lib/delete-flow.ts`
- Test: `src/lib/delete-flow.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/delete-flow.test.ts`:

```ts
import { createStore } from "@tanstack/react-store";
import { describe, expect, it } from "vitest";

import { IDLE_DELETE, deleteFlowActions, type DeleteFlow } from "./delete-flow";
import type { StoreApi } from "./store-api";

type Row = { id: string; title: string };
type State = { delete: DeleteFlow<Row>; other: number };

const ROW: Row = { id: "r1", title: "First" };
const actions = (api: StoreApi<State>) => deleteFlowActions(api);
const initial: State = { delete: IDLE_DELETE, other: 7 };
const make = () => createStore(initial, actions);

describe("deleteFlowActions", () => {
  it("starts idle", () => {
    expect(make().state.delete).toEqual({ pending: null, error: null });
  });

  it("begin stores the target object and clears any old error", () => {
    const store = make();
    store.actions.failDelete("old");
    store.actions.beginDelete(ROW);
    expect(store.state.delete).toEqual({ pending: ROW, error: null });
  });

  it("fail keeps the target and records the message", () => {
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.failDelete("Could not delete that task.");
    expect(store.state.delete).toEqual({ pending: ROW, error: "Could not delete that task." });
  });

  it("clearDeleteError keeps the target", () => {
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.failDelete("x");
    store.actions.clearDeleteError();
    expect(store.state.delete).toEqual({ pending: ROW, error: null });
  });

  it("cancel returns to idle and leaves the rest of the state alone", () => {
    const store = make();
    store.actions.beginDelete(ROW);
    store.actions.cancelDelete();
    expect(store.state).toEqual({ delete: { pending: null, error: null }, other: 7 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/lib/delete-flow.test.ts`
Expected: FAIL — `Failed to resolve import "./delete-flow"`.

- [ ] **Step 3: Implement**

`src/lib/store-api.ts`:

```ts
import type { StoreActionsFactory } from "@tanstack/react-store";

/**
 * The `{ setState, get }` argument every Store actions factory receives (D87).
 * Named once so each store module types its factory the same way.
 */
export type StoreApi<T> = Parameters<StoreActionsFactory<T, Record<string, never>>>[0];
```

`src/lib/delete-flow.ts`:

```ts
import type { StoreApi } from "./store-api";

/**
 * A confirm-before-delete dialog's state (D87): the row it is about, and the
 * last failure. The target is the object, not an id, so a refetch while the
 * dialog is open cannot make it disappear.
 */
export type DeleteFlow<T> = { pending: T | null; error: string | null };

/** The idle dialog. Frozen, because every store's initial state shares this one object. */
export const IDLE_DELETE: DeleteFlow<never> = Object.freeze({ pending: null, error: null });

/**
 * Actions over the `delete` slice of any store whose state has one. The target's
 * type comes from the store's own state, so a wrong target cannot be passed.
 * (Amended by Task 2's code review: a second type parameter could not be
 * inferred, so a wrong target type compiled silently.)
 */
export function deleteFlowActions<S extends { delete: DeleteFlow<unknown> }>({ setState }: StoreApi<S>) {
  return {
    beginDelete: (target: NonNullable<S["delete"]["pending"]>) =>
      setState((state) => ({ ...state, delete: { pending: target, error: null } })),
    cancelDelete: () => setState((state) => ({ ...state, delete: IDLE_DELETE })),
    /** Before each attempt, so a repeat failure with the same message still refocuses (D75). */
    clearDeleteError: () =>
      setState((state) => ({ ...state, delete: { ...state.delete, error: null } })),
    failDelete: (message: string) =>
      setState((state) => ({ ...state, delete: { ...state.delete, error: message } })),
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- src/lib/delete-flow.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/lib/store-api.ts src/lib/delete-flow.ts src/lib/delete-flow.test.ts
git commit -m "feat: add a generic delete-dialog store slice (D87)"
```

---

### Task 3: The session store replaces AuthContext (D86)

**Files:**
- Create: `src/features/auth/session-store.ts`, `src/features/auth/session-context.ts`, `src/features/auth/SessionProvider.tsx`
- Test: `src/features/auth/session-store.test.ts`
- Modify: `src/features/auth/hooks/useAuth.ts`, `src/app/providers.tsx`, `src/app/router.tsx:12`, `src/app/useRouterAuthSync.ts:3`, `src/test/render-app.tsx:8,51-53`
- Delete: `src/features/auth/AuthContext.tsx`

- [ ] **Step 1: Write the failing test**

`src/features/auth/session-store.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { clearAccessToken } from "../../lib/api-client";
import { server } from "../../test/msw-server";
import { createSessionStore } from "./session-store";
import type { CurrentUser } from "./types";

const BASE = "http://localhost:8000/api/v1";
const ME: CurrentUser = {
  id: "0199a0f0-0000-7000-8000-00000000sv01",
  email: "supervisor@demo.local",
  first_name: "Sam",
  last_name: "Supervisor",
  role: "SUPERVISOR",
};

afterEach(() => clearAccessToken());

describe("session store", () => {
  it("starts loading, with nobody signed in", () => {
    expect(createSessionStore().state).toEqual({ user: null, isLoading: true });
  });

  it("settle ends loading, signed in or not", () => {
    const store = createSessionStore();
    store.actions.settle(ME);
    expect(store.state).toEqual({ user: ME, isLoading: false });
    store.actions.settle(null);
    expect(store.state).toEqual({ user: null, isLoading: false });
  });

  it("signIn stores and returns the user the server sent", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () => HttpResponse.json({ access: "token", user: ME })),
    );
    const store = createSessionStore();
    await expect(store.actions.signIn("supervisor@demo.local", "pw")).resolves.toEqual(ME);
    expect(store.state.user).toEqual(ME);
  });

  it("signOut never rejects, and clears the user even when the server fails", async () => {
    server.use(
      http.post(`${BASE}/auth/logout/`, () =>
        HttpResponse.json({ detail: "x", code: "x", errors: null }, { status: 500 }),
      ),
    );
    const store = createSessionStore();
    store.actions.settle(ME);
    await expect(store.actions.signOut()).resolves.toBeUndefined();
    expect(store.state.user).toBeNull();
  });

  it("expire clears the user and keeps loading settled", () => {
    const store = createSessionStore();
    store.actions.settle(ME);
    store.actions.expire();
    expect(store.state).toEqual({ user: null, isLoading: false });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/features/auth/session-store.test.ts`
Expected: FAIL — `Failed to resolve import "./session-store"`.

- [ ] **Step 3: Implement the store, its context and the provider**

`src/features/auth/session-store.ts`:

```ts
import { createStore } from "@tanstack/react-store";

import { clearAccessToken, setAccessToken } from "../../lib/api-client";
import type { StoreApi } from "../../lib/store-api";
import * as authService from "./services/auth-service";
import type { CurrentUser } from "./types";

/**
 * The session: shared CLIENT state, which is why it lives in a store rather
 * than in TanStack Query (frontend §4, D86). The access token itself is NOT
 * kept here: api-client owns it in module memory, so there is never a second
 * copy that could disagree with what the client actually sends.
 */
export type SessionState = {
  user: CurrentUser | null;
  /** True until the initial "who am I?" probe settles, so guards can wait. */
  isLoading: boolean;
};

/** Frozen: every store created from it shares this one object. */
export const initialSessionState: SessionState = Object.freeze({ user: null, isLoading: true });

export const sessionActions = ({ setState }: StoreApi<SessionState>) => ({
  /** Ends the bootstrap probe, signed in or not. */
  settle: (user: CurrentUser | null) => setState(() => ({ user, isLoading: false })),

  signIn: async (email: string, password: string): Promise<CurrentUser> => {
    const { access, user } = await authService.login(email, password);
    setAccessToken(access);
    setState((state) => ({ ...state, user }));
    return user;
  },

  /**
   * Never rejects. The local sign-out is authoritative: the token is dropped and
   * the user cleared whatever the server says, so the UI can never be stuck
   * appearing signed in. A failed revoke leaves a refresh token alive until it
   * expires, which the caller cannot do anything about — so swallowing it here
   * is the honest contract, rather than handing every caller a rejection to
   * discard with `void`.
   */
  signOut: async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Already expired, offline, or a 5xx: nothing actionable.
    } finally {
      clearAccessToken();
      setState((state) => ({ ...state, user: null }));
    }
  },

  /** A failed refresh means the session is over: the guards send the user to /login. */
  expire: () => setState((state) => ({ ...state, user: null })),
});

/** For unit tests. Components create theirs with useCreateStore (spec §4.0). */
export const createSessionStore = () => createStore(initialSessionState, sessionActions);
export type SessionStore = ReturnType<typeof createSessionStore>;

/** What useAuth() returns: the same shape the old auth context provided (D86). */
export type AuthState = SessionState & Pick<SessionStore["actions"], "signIn" | "signOut">;
```

`src/features/auth/session-context.ts`:

```ts
import { createStoreContext } from "@tanstack/react-store";

import type { SessionStore } from "./session-store";

/** Carries the app's one session store from SessionProvider to useAuth (D86). */
export const { StoreProvider: SessionStoreProvider, useStoreContext: useSessionStore } =
  createStoreContext<{ session: SessionStore }>();
```

`src/features/auth/SessionProvider.tsx`:

```tsx
import { useCreateStore } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { apiClient } from "../../lib/api-client";
import * as authService from "./services/auth-service";
import { SessionStoreProvider } from "./session-context";
import { initialSessionState, sessionActions } from "./session-store";

/**
 * Creates the app's session store — once per mount, so every test render gets
 * a fresh one — and restores the session from the refresh cookie (D35, D86).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useCreateStore(initialSessionState, sessionActions);

  useEffect(() => {
    let cancelled = false;
    // Refresh FIRST, then fetch the user (D35). The access token is memory-only,
    // so after a reload the cookie is the only way back into a session; probing
    // /users/me/ first was a guaranteed 401 for anonymous visitors and did not
    // avoid the refresh anyway. restoreSession resolves to null rather than
    // rejecting when there is no session, because that is an ordinary answer.
    // The catch stays: /users/me/ can still fail (a 5xx) after a good refresh.
    authService
      .restoreSession()
      .then((me) => {
        if (!cancelled) session.actions.settle(me);
      })
      .catch(() => {
        if (!cancelled) session.actions.settle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    // When a refresh fails, the session is genuinely over: drop the user so the
    // route guards send them to /login.
    apiClient.onSessionExpired(session.actions.expire);
  }, [session]);

  const value = useMemo(() => ({ session }), [session]);
  return <SessionStoreProvider value={value}>{children}</SessionStoreProvider>;
}
```

- [ ] **Step 4: Run the store test to see it pass**

Run: `npm test -- src/features/auth/session-store.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point useAuth at the store**

Replace `src/features/auth/hooks/useAuth.ts` entirely:

```ts
import { shallow, useSelector } from "@tanstack/react-store";
import { useMemo } from "react";

import { useSessionStore } from "../session-context";
import type { AuthState } from "../session-store";

/** The signed-in user and the session actions, from the session store (D86). */
export function useAuth(): AuthState {
  const { session } = useSessionStore();
  const { user, isLoading } = useSelector(
    session,
    (state) => ({ user: state.user, isLoading: state.isLoading }),
    { compare: shallow },
  );
  const { signIn, signOut } = session.actions;
  return useMemo(() => ({ user, isLoading, signIn, signOut }), [user, isLoading, signIn, signOut]);
}
```

- [ ] **Step 6: Swap the provider and the AuthState import everywhere**

`src/app/providers.tsx`: replace the import
`import { AuthProvider } from "../features/auth/AuthContext";`
with
`import { SessionProvider } from "../features/auth/SessionProvider";`
and in `Providers`, replace `<AuthProvider>{children ?? <RoutedApp />}</AuthProvider>` with `<SessionProvider>{children ?? <RoutedApp />}</SessionProvider>`.

`src/test/render-app.tsx`: replace the import
`import { AuthProvider } from "../features/auth/AuthContext";`
with
`import { SessionProvider } from "../features/auth/SessionProvider";`
and replace the `<AuthProvider>` / `</AuthProvider>` pair (lines 51–53) with `<SessionProvider>` / `</SessionProvider>`.

`src/app/router.tsx` line 12 and `src/app/useRouterAuthSync.ts` line 3: replace
`import type { AuthState } from "../features/auth/AuthContext";`
with
`import type { AuthState } from "../features/auth/session-store";`

Delete the old context: `git rm src/features/auth/AuthContext.tsx`

Run: `git grep -n "AuthContext\|AuthProvider" -- src`
Expected: only comments remain, in five places. Update each so it names the new owner:
- `src/lib/api-client.ts:19` — "AuthContext is the only" → "Outside this module, the session store is the only";
- `src/lib/api-client.ts:81` — "so AuthContext's bootstrap reuses" → "so SessionProvider's bootstrap reuses";
- `src/lib/api-client.ts:140` — "AuthContext uses it to sign the user out" → "SessionProvider wires it to the session store's `expire`";
- `src/app/layout/AppShell.test.tsx:147` — "AuthContext drops the user" → "the session store drops the user";
- `src/test/msw-handlers.ts:36` — "Once AuthContext bootstraps" → "Once SessionProvider bootstraps".

Re-run the grep. Expected: no matches.

- [ ] **Step 7: Gates**

Expected: typecheck clean; lint **4** warnings (`AuthContext.tsx`'s is gone); every test passes — including `auth-routing.test.tsx`'s bootstrap request counts, unchanged.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "refactor: keep the session in a TanStack Store instead of AuthContext (D86)"
```

---

### Task 4: The task-actions store for the task list and detail (D87)

**Files:**
- Create: `src/features/tasks/task-actions-store.ts`, `src/features/tasks/task-actions-context.ts`, `src/features/tasks/hooks/useTaskActions.ts`
- Test: `src/features/tasks/task-actions-store.test.ts`; add one test to `src/features/tasks/TaskListPage.test.tsx`
- Modify: `src/features/tasks/TaskListPage.tsx`, `src/features/tasks/TaskDetailPage.tsx`, `src/features/tasks/components/TaskRowActions.tsx`, `src/features/tasks/components/TaskCard.tsx`, `src/features/tasks/components/TaskTable.tsx`

- [ ] **Step 1: Write the failing store test**

`src/features/tasks/task-actions-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createTaskActionsStore } from "./task-actions-store";

describe("task-actions store", () => {
  it("starts with no dialog, no busy row and no error", () => {
    expect(createTaskActionsStore().state).toEqual({
      delete: { pending: null, error: null },
      busyId: null,
      actionError: null,
    });
  });

  it("startAction marks the row busy and clears the last error", () => {
    const store = createTaskActionsStore();
    store.actions.failAction("old");
    store.actions.startAction("t1");
    expect(store.state.busyId).toBe("t1");
    expect(store.state.actionError).toBeNull();
  });

  it("failAction keeps the row busy until endAction", () => {
    const store = createTaskActionsStore();
    store.actions.startAction("t1");
    store.actions.failAction("Something went wrong. Try again.");
    expect(store.state).toMatchObject({ busyId: "t1", actionError: "Something went wrong. Try again." });
    store.actions.endAction();
    expect(store.state).toMatchObject({ busyId: null, actionError: "Something went wrong. Try again." });
  });

  it("carries the delete-flow actions", () => {
    const store = createTaskActionsStore();
    store.actions.beginDelete({ id: "t1", title: "Review the brief" });
    expect(store.state.delete.pending).toEqual({ id: "t1", title: "Review the brief" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/features/tasks/task-actions-store.test.ts`
Expected: FAIL — `Failed to resolve import "./task-actions-store"`.

- [ ] **Step 3: Implement the store, the hook and the context**

`src/features/tasks/task-actions-store.ts`:

```ts
import { createStore } from "@tanstack/react-store";

import { IDLE_DELETE, deleteFlowActions, type DeleteFlow } from "../../lib/delete-flow";
import type { StoreApi } from "../../lib/store-api";

/** What the delete dialog needs: the list and detail payloads both satisfy it. */
export type DeleteTarget = { id: string; title: string };

/**
 * The task list's and detail page's UI state (D87): the delete dialog, the row
 * whose action is in flight, and the last action's failure. Each page creates
 * its own with useCreateStore, so it starts clean on every visit.
 */
export type TaskActionsState = {
  delete: DeleteFlow<DeleteTarget>;
  busyId: string | null;
  actionError: string | null;
};

/** Frozen: every store created from it shares this one object. */
export const initialTaskActionsState: TaskActionsState = Object.freeze({
  delete: IDLE_DELETE,
  busyId: null,
  actionError: null,
});

export const taskActions = (api: StoreApi<TaskActionsState>) => ({
  ...deleteFlowActions(api),
  startAction: (id: string) => api.setState((state) => ({ ...state, busyId: id, actionError: null })),
  failAction: (message: string) => api.setState((state) => ({ ...state, actionError: message })),
  endAction: () => api.setState((state) => ({ ...state, busyId: null })),
});

/** For unit tests. Pages create theirs with useCreateStore (spec §4.0). */
export const createTaskActionsStore = () => createStore(initialTaskActionsState, taskActions);
export type TaskActionsStore = ReturnType<typeof createTaskActionsStore>;
```

`src/features/tasks/hooks/useTaskActions.ts`:

```ts
import { ApiError } from "../../../lib/api-error";
import type { DeleteTarget, TaskActionsStore } from "../task-actions-store";
import { useCompleteTask, useDeleteTask } from "./useTaskMutations";

export interface TaskActions {
  complete: (task: { id: string }) => Promise<void>;
  beginDelete: (task: DeleteTarget) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  isDeleting: boolean;
}

/**
 * The task actions a page offers, over its own task-actions store (D87): the
 * store holds what the UI shows, the mutations do the work.
 *
 * `onDeleted` replaces closing the dialog after a successful delete: the detail
 * page navigates back to the list with the dialog still open, as it always has.
 */
export function useTaskActions(
  store: TaskActionsStore,
  { onDeleted }: { onDeleted?: () => Promise<unknown> } = {},
): TaskActions {
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const { actions } = store;

  async function complete(task: { id: string }) {
    actions.startAction(task.id);
    try {
      await completeTask.mutateAsync(task.id);
    } catch (caught) {
      actions.failAction(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again.",
      );
    } finally {
      actions.endAction();
    }
  }

  async function confirmDelete() {
    const target = store.state.delete.pending;
    if (target === null) return;
    actions.clearDeleteError();
    try {
      await deleteTask.mutateAsync(target.id);
      if (onDeleted === undefined) actions.cancelDelete();
      else await onDeleted();
    } catch (caught) {
      actions.failDelete(caught instanceof ApiError ? caught.message : "Could not delete that task.");
    }
  }

  return {
    complete,
    beginDelete: actions.beginDelete,
    cancelDelete: actions.cancelDelete,
    confirmDelete,
    isDeleting: deleteTask.isPending,
  };
}
```

`src/features/tasks/task-actions-context.ts`:

```ts
import { createStoreContext } from "@tanstack/react-store";

import type { TaskActions } from "./hooks/useTaskActions";
import type { TaskActionsStore } from "./task-actions-store";

/** The list page's task-actions store and actions, for its rows and cards (D87). */
export const { StoreProvider: TaskActionsProvider, useStoreContext: useTaskActionsContext } =
  createStoreContext<{ store: TaskActionsStore; actions: TaskActions }>();
```

- [ ] **Step 4: Run the store test to see it pass**

Run: `npm test -- src/features/tasks/task-actions-store.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Rows read the store**

Replace `src/features/tasks/components/TaskRowActions.tsx` entirely:

```tsx
import { useSelector } from "@tanstack/react-store";

import { Button } from "../../../components/Button";
import { useTaskActionsContext } from "../task-actions-context";
import type { TaskListItem } from "../types";

/**
 * The UX mirror of D27. `task.can_delete` comes from the API, which applies the
 * same predicate the permission class enforces — so the UI never offers a delete
 * the backend would refuse, and the rule is not duplicated here (F7).
 */
export function TaskRowActions({ task }: { task: TaskListItem }) {
  const { store, actions } = useTaskActionsContext();
  // A busy-flag change re-renders only the row whose flag flipped (D87).
  const isBusy = useSelector(store, (state) => state.busyId === task.id);
  const isOpen = task.status === "PENDING" || task.status === "IN_PROGRESS";
  return (
    <div className="flex flex-wrap gap-2">
      {isOpen && (
        <Button
          variant="secondary"
          disabled={isBusy}
          onClick={() => void actions.complete(task)}
          aria-label={`Complete ${task.title}`}
        >
          Complete
        </Button>
      )}
      {task.can_delete && (
        <Button
          variant="danger"
          disabled={isBusy}
          onClick={() => actions.beginDelete(task)}
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
```

`src/features/tasks/components/TaskCard.tsx`: remove the `onComplete`, `onDelete` and `isBusy` props (from `TaskCardProps`, the destructuring and the defaults) and render `<TaskRowActions task={task} />` in place of `<TaskRowActions task={task} onComplete={onComplete} onDelete={onDelete} isBusy={isBusy} />`. The props interface becomes:

```ts
interface TaskCardProps {
  task: TaskListItem;
  showAssignee: boolean;
  /** Left in history state by the title link, so the detail can return here (D70). */
  listSearch: TaskListSearch;
}
```

and the signature `export function TaskCard({ task, showAssignee, listSearch }: TaskCardProps) {`.

`src/features/tasks/components/TaskTable.tsx`: remove `onComplete`, `onDelete` and `busyId` from `TaskTableProps` and from the destructuring (with `busyId = null`), and replace the actions cell's `<TaskRowActions task={task} onComplete={onComplete} onDelete={onDelete} isBusy={busyId === task.id} />` with `<TaskRowActions task={task} />`.

- [ ] **Step 6: The list page creates and provides the store**

Replace `src/features/tasks/TaskListPage.tsx` entirely:

```tsx
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect } from "react";

import type { TaskListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { Pagination } from "../../components/Pagination";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../lib/pagination";
import { useAuth } from "../auth/hooks/useAuth";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { TaskCard } from "./components/TaskCard";
import { TaskFilters, type FilterPatch } from "./components/TaskFilters";
import { TaskSortSelect } from "./components/TaskSortSelect";
import { TaskTable } from "./components/TaskTable";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTasks } from "./hooks/useTasks";
import type { Ordering } from "./sorting";
import { TaskActionsProvider } from "./task-actions-context";
import { initialTaskActionsState, taskActions } from "./task-actions-store";
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
    status: search.status,
    due_date_after: search.due_date_after,
    due_date_before: search.due_date_before,
    overdue: search.overdue,
    ordering: search.ordering,
    page,
    page_size: pageSize,
  };
  // The page's UI state (D87): one store per mount, so it starts clean on every visit.
  const store = useCreateStore(initialTaskActionsState, taskActions);
  const actions = useTaskActions(store);
  const actionError = useSelector(store, (state) => state.actionError);
  const pendingDelete = useSelector(store, (state) => state.delete.pending);
  const deleteError = useSelector(store, (state) => state.delete.error);

  const { data, isPending, isError, error, isPlaceholderData } = useTasks(filters);

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

  /** A sort change is an edit, like a filter: replace, keep scroll, page 1 (D47). */
  function setOrdering(ordering: Ordering | undefined) {
    editSearch((prev) => ({ ...prev, ordering, page: undefined }));
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

  return (
    <TaskActionsProvider value={{ store, actions }}>
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
          <ButtonLink to="/tasks/new" state={{ tasksSearch: search }} className="ml-auto">
            New task
          </ButtonLink>
        </div>

        <TaskFilters filters={filters} onChange={applyFilters} onClear={clearFilters} />
        <FormError message={actionError} />
        {/* Outside the results, so it survives an empty result (spec §4.3). */}
        <TaskSortSelect ordering={filters.ordering} onChange={setOrdering} className="lg:hidden" />

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
            {/* Cards below lg, not md (D69): at md the table's six columns and two
                action buttons do not fit, so badges and actions wrapped. */}
            <div className="hidden overflow-x-auto lg:block">
              <TaskTable
                tasks={data.results}
                showAssignee={showAssignee}
                ordering={filters.ordering}
                onOrderingChange={setOrdering}
                listSearch={search}
              />
            </div>
            <div className="lg:hidden">
              {data.results.map((task) => (
                <TaskCard key={task.id} task={task} showAssignee={showAssignee} listSearch={search} />
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
          <DeleteTaskDialog
            task={pendingDelete}
            error={deleteError}
            isDeleting={actions.isDeleting}
            onConfirm={() => void actions.confirmDelete()}
            onCancel={actions.cancelDelete}
          />
        )}
      </section>
    </TaskActionsProvider>
  );
}
```

- [ ] **Step 7: The detail page creates its own store**

Replace `src/features/tasks/TaskDetailPage.tsx` entirely:

```tsx
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useParams } from "@tanstack/react-router";

import { Button } from "../../components/Button";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { ApiError } from "../../lib/api-error";
import { formatDueDate } from "../../lib/dates";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { OverdueBadge, StatusBadge } from "./components/StatusBadge";
import { TaskNotFound } from "./components/TaskNotFound";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTask } from "./hooks/useTasks";
import { useTasksBackSearch } from "./hooks/useTasksBackSearch";
import { initialTaskActionsState, taskActions } from "./task-actions-store";

export function TaskDetailPage() {
  const { taskId } = useParams({ from: "/shell/tasks/$taskId" });
  const navigate = useNavigate();
  const back = useTasksBackSearch();
  const { data: task, isPending, isError, error } = useTask(taskId);
  // The page's UI state (D87). After a delete the page returns to the list it
  // came from (D70), with the dialog still open until it leaves.
  const store = useCreateStore(initialTaskActionsState, taskActions);
  const actions = useTaskActions(store, {
    onDeleted: () => navigate({ to: "/tasks", search: back }),
  });
  const actionError = useSelector(store, (state) => state.actionError);
  const confirmingDelete = useSelector(store, (state) => state.delete.pending !== null);
  const deleteError = useSelector(store, (state) => state.delete.error);

  if (isPending) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Loading task…
      </p>
    );
  }

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

  // Completion is offered only while the task is still open: COMPLETED and
  // CANCELLED are terminal (D19), and the API answers 409 for either.
  const isOpen = task.status === "PENDING" || task.status === "IN_PROGRESS";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
        <StatusBadge status={task.status} />
        {task.is_overdue && <OverdueBadge />}
      </div>

      <FormError message={actionError} />

      <dl className="mb-6 grid grid-cols-1 gap-2 rounded-lg bg-white p-4 text-sm shadow-sm sm:grid-cols-[10rem_1fr] sm:p-6">
        <dt className="font-medium text-slate-700">Description</dt>
        <dd className="text-slate-600">
          {task.description === "" ? "No description" : task.description}
        </dd>
        <dt className="font-medium text-slate-700">Due date</dt>
        <dd className="text-slate-600">
          {task.due_date === null ? "No deadline" : formatDueDate(task.due_date)}
        </dd>
        <dt className="font-medium text-slate-700">Assignee</dt>
        <dd className="text-slate-600">
          {task.assignee === null
            ? "Unassigned"
            : `${task.assignee.first_name} ${task.assignee.last_name}`}
        </dd>
        <dt className="font-medium text-slate-700">Created by</dt>
        <dd className="text-slate-600">
          {task.created_by.first_name} {task.created_by.last_name}
        </dd>
        {task.completed_at !== null && (
          <>
            <dt className="font-medium text-slate-700">Completed</dt>
            <dd className="text-slate-600">{new Date(task.completed_at).toLocaleString()}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {isOpen && <Button onClick={() => void actions.complete(task)}>Mark complete</Button>}
        <ButtonLink
          variant="secondary"
          to="/tasks/$taskId/edit"
          params={{ taskId: task.id }}
          state={{ tasksSearch: back }}
        >
          Edit
        </ButtonLink>
        {task.can_delete && (
          <Button variant="danger" onClick={() => actions.beginDelete(task)}>
            Delete
          </Button>
        )}
        <ButtonLink variant="secondary" to="/tasks" search={back}>
          Back to tasks
        </ButtonLink>
      </div>

      {confirmingDelete && (
        <DeleteTaskDialog
          task={task}
          error={deleteError}
          isDeleting={actions.isDeleting}
          onConfirm={() => void actions.confirmDelete()}
          onCancel={actions.cancelDelete}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 8: Add the per-mount isolation test**

In `src/features/tasks/TaskListPage.test.tsx`, inside `describe("task deletion from the list", …)` after the `it("keeps the dialog open and shows the error when deletion fails", …)` test, add:

```tsx
  it("starts with the dialog closed after leaving the list and coming back (D87)", async () => {
    signedInAs(OPERATOR);
    tasksRespondWith([TASK]);
    const { router } = await renderApp("/tasks");
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: /^delete review the brief/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(() => router.navigate({ to: "/dashboard" }));
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
    await act(() => router.navigate({ to: "/tasks" }));
    await screen.findByRole("table");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
```

- [ ] **Step 9: Run the task tests**

Run: `npm test -- src/features/tasks`
Expected: PASS — every existing TaskListPage / TaskForm (detail page) test and the new one.

- [ ] **Step 10: Prove the isolation test can fail (spec §7.3)**

Temporarily, in `TaskListPage.tsx`, add `import { createTaskActionsStore } from "./task-actions-store";` and `const LEAKED = createTaskActionsStore();` at module scope, and replace `const store = useCreateStore(initialTaskActionsState, taskActions);` with `const store = LEAKED;`.
Run: `npm test -- src/features/tasks/TaskListPage.test.tsx -t "after leaving the list"`
Expected: FAIL — the dialog is still in the document.
Revert both edits (`git diff src/features/tasks/TaskListPage.tsx` must show only the Step 6 version), then re-run the same command: PASS.

- [ ] **Step 11: Gates, then commit**

```bash
git add -A src/features/tasks
git commit -m "refactor: keep task list and detail UI state in a per-mount store (D87)

The isolation test fails when the store is hoisted to module scope.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The user-list store (D87)

**Files:**
- Create: `src/features/users/user-list-store.ts`, `src/features/users/user-list-context.ts`, `src/features/users/components/UserRowActions.tsx`
- Modify: `src/features/users/UserListPage.tsx`, `src/features/users/components/UserCard.tsx`, `src/features/users/components/UserTable.tsx`

- [ ] **Step 1: Implement the store and context**

`src/features/users/user-list-store.ts`:

```ts
import { createStore } from "@tanstack/react-store";

import { IDLE_DELETE, deleteFlowActions, type DeleteFlow } from "../../lib/delete-flow";
import type { StoreApi } from "../../lib/store-api";
import type { UserDetail } from "./types";

/** The user list's UI state (D87): its deactivate dialog. One store per page mount. */
export type UserListState = { delete: DeleteFlow<UserDetail> };

/** Frozen: every store created from it shares this one object. */
export const initialUserListState: UserListState = Object.freeze({ delete: IDLE_DELETE });

export const userListActions = (api: StoreApi<UserListState>) =>
  deleteFlowActions(api);

/** For unit tests. The page creates its own with useCreateStore (spec §4.0). */
export const createUserListStore = () => createStore(initialUserListState, userListActions);
export type UserListStore = ReturnType<typeof createUserListStore>;
```

`src/features/users/user-list-context.ts`:

```ts
import { createStoreContext } from "@tanstack/react-store";

import type { UserListStore } from "./user-list-store";

/** The user list page's store, for its rows and cards (D87). */
export const { StoreProvider: UserListProvider, useStoreContext: useUserListContext } =
  createStoreContext<{ store: UserListStore }>();
```

- [ ] **Step 2: One actions component for the table cell and the card**

`src/features/users/components/UserRowActions.tsx`:

```tsx
import { Button } from "../../../components/Button";
import { ButtonLink } from "../../../components/ButtonLink";
import { useAuth } from "../../auth/hooks/useAuth";
import type { UserDetail } from "../types";
import { useUserListContext } from "../user-list-context";

/** A user row's Edit and Deactivate, shared by the table and the cards. */
export function UserRowActions({ user }: { user: UserDetail }) {
  const { user: currentUser } = useAuth();
  const { store } = useUserListContext();
  return (
    <div className="flex flex-wrap gap-2">
      <ButtonLink
        variant="secondary"
        to="/users/$userId"
        params={{ userId: user.id }}
        aria-label={`Edit ${user.email}`}
      >
        Edit
      </ButtonLink>
      {/* D66, the UX mirror of IsNotSelf: never offer a refusal. */}
      {user.id !== currentUser?.id && (
        <Button
          variant="danger"
          aria-label={`Deactivate ${user.email}`}
          onClick={() => store.actions.beginDelete(user)}
        >
          Deactivate
        </Button>
      )}
    </div>
  );
}
```

Replace `src/features/users/components/UserCard.tsx` entirely:

```tsx
import { ROLE_LABEL } from "../../auth/types";
import type { UserDetail } from "../types";
import { UserRowActions } from "./UserRowActions";

/**
 * The below-`md` presentation of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader — the same reasoning
 * as TaskCard (spec §5.2).
 */
export function UserCard({ user }: { user: UserDetail }) {
  return (
    <article className="mb-3 rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-medium">
        {user.first_name} {user.last_name}
      </h3>
      <dl className="mb-3 grid grid-cols-2 gap-1 text-sm text-slate-600">
        <dt className="font-medium">Email</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="font-medium">Role</dt>
        <dd>{ROLE_LABEL[user.role]}</dd>
        <dt className="font-medium">Active</dt>
        <dd>{user.is_active ? "Yes" : "No"}</dd>
      </dl>
      <UserRowActions user={user} />
    </article>
  );
}
```

In `src/features/users/components/UserTable.tsx`: remove the `Button` and `ButtonLink` imports, change the props to `{ users: UserDetail[] }` (drop `onDelete` and `currentUserId` from `UserTableProps` and the destructuring), add `import { UserRowActions } from "./UserRowActions";`, and replace the whole actions `<td className="p-3">…</td>` (the `<div className="flex flex-wrap gap-2">` with Edit and Deactivate) with:

```tsx
            <td className="p-3">
              <UserRowActions user={user} />
            </td>
```

- [ ] **Step 3: The page creates and provides the store**

In `src/features/users/UserListPage.tsx`:

1. Replace `import { useEffect, useState } from "react";` with `import { useEffect } from "react";` and add `import { useCreateStore, useSelector } from "@tanstack/react-store";` as the first import.
2. Remove `import { useAuth } from "../auth/hooks/useAuth";`, and change `import type { UserDetail, UserFilters } from "./types";` to `import type { UserFilters } from "./types";`.
3. Add `import { UserListProvider } from "./user-list-context";` and `import { initialUserListState, userListActions } from "./user-list-store";`.
4. Remove `const { user: currentUser } = useAuth();`.
5. Replace the two `useState` lines (`pendingDelete`, `deleteError`) with:

```tsx
  // The page's UI state (D87): one store per mount, so it starts clean on every visit.
  const store = useCreateStore(initialUserListState, userListActions);
  const pendingDelete = useSelector(store, (state) => state.delete.pending);
  const deleteError = useSelector(store, (state) => state.delete.error);
```

6. Delete the `beginDelete` function and replace `confirmDelete` with:

```tsx
  async function confirmDelete() {
    const target = store.state.delete.pending;
    if (target === null) return;
    store.actions.clearDeleteError();
    try {
      await remove.mutateAsync(target.id);
      store.actions.cancelDelete();
    } catch (caught) {
      store.actions.failDelete(
        caught instanceof ApiError ? caught.message : "Could not deactivate that user.",
      );
    }
  }
```

7. Wrap the returned `<section>…</section>` in `<UserListProvider value={{ store }}>…</UserListProvider>`.
8. Render `<UserTable users={data.results} />` and `<UserCard key={user.id} user={user} />` (drop `onDelete` and `currentUserId`).
9. In `<DeleteUserDialog …>`, replace `onCancel={() => setPendingDelete(null)}` with `onCancel={store.actions.cancelDelete}`.

- [ ] **Step 4: Run the user tests**

Run: `npm test -- src/features/users`
Expected: PASS — including "never offers the signed-in Admin a Deactivate for their own account (D66)", "keeps the dialog open and shows the error when deletion fails" and "moves focus to the error inside the dialog when deletion fails (D75)".

- [ ] **Step 5: Gates, then commit**

```bash
git add -A src/features/users
git commit -m "refactor: keep the user list's dialog state in a per-mount store (D87)"
```

---

### Task 6: The assignee combobox's own store (D87)

**Files:**
- Create: `src/features/tasks/components/assignee-combobox-store.ts`
- Modify: `src/features/tasks/components/AssigneeCombobox.tsx`

- [ ] **Step 1: Implement the store**

`src/features/tasks/components/assignee-combobox-store.ts`:

```ts
import type { StoreApi } from "../../../lib/store-api";

/**
 * The assignee picker's own UI state (D87), one store per combobox instance.
 * `query` null means "not searching": the input shows the chosen user and the
 * list is unfiltered. `activeIndex` -1 means no active option, so Enter chooses
 * nothing — the state after typing, until an arrow key picks one.
 */
export type ComboboxState = { open: boolean; query: string | null; activeIndex: number };

/** Frozen: every store created from it shares this one object. */
export const initialComboboxState: ComboboxState = Object.freeze({
  open: false,
  query: null,
  activeIndex: -1,
});

export const comboboxActions = ({ setState }: StoreApi<ComboboxState>) => ({
  /** Opens the list with `index` active. */
  openAt: (index: number) => setState((state) => ({ ...state, open: true, activeIndex: index })),
  /** Closes without choosing: the input goes back to the chosen user. */
  close: () => setState(() => initialComboboxState),
  /** Typing searches, and no option is active until an arrow key picks one. */
  type: (query: string) => setState(() => ({ open: true, query, activeIndex: -1 })),
  moveTo: (index: number) => setState((state) => ({ ...state, activeIndex: index })),
});
```

- [ ] **Step 2: Use it in the combobox**

In `src/features/tasks/components/AssigneeCombobox.tsx`:

1. Replace `import { useEffect, useState } from "react";` with:

```tsx
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
```

and add `import { comboboxActions, initialComboboxState } from "./assignee-combobox-store";` after the `useAssignableUsers` import block.

2. Replace the three `useState` declarations and their comments (`open`, `query`, `activeIndex`) with:

```tsx
  const store = useCreateStore(initialComboboxState, comboboxActions);
  const { open, query, activeIndex } = useSelector(store);
```

3. Replace `openList`, `close` and `moveTo` with:

```tsx
  function openList() {
    if (open) return;
    const current = options.findIndex((option) => option?.id === value?.id);
    store.actions.openAt(current === -1 ? 0 : current);
  }

  /** Closes without choosing: the input goes back to the chosen user. */
  function close() {
    store.actions.close();
  }
```

and

```tsx
  function moveTo(index: number) {
    store.actions.moveTo(index);
    if (index === options.length - 1) loadMore();
  }
```

4. Replace the input's `onChange` handler body (`setQuery(…); setActiveIndex(-1); setOpen(true);`) with:

```tsx
          onChange={(event) => store.actions.type(event.target.value)}
```

Run: `git grep -n "useState\|setQuery\|setActiveIndex\|setOpen" -- src/features/tasks/components/AssigneeCombobox.tsx`
Expected: no matches.

- [ ] **Step 3: Run the combobox tests**

Run: `npm test -- src/features/tasks/TaskForm.test.tsx`
Expected: PASS — all the D64 picker tests (search per pause, keyboard choice, load more, Escape, blur, Unassigned).

- [ ] **Step 4: Gates, then commit**

```bash
git add src/features/tasks/components/assignee-combobox-store.ts src/features/tasks/components/AssigneeCombobox.tsx
git commit -m "refactor: keep the assignee picker's open/query/active state in its own store (D87)"
```

---

# Phase 2 — Forms

### Task 7: The server-error mapper (D80)

**Files:**
- Create: `src/components/form/server-errors.ts`
- Test: `src/components/form/server-errors.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/form/server-errors.test.ts`:

```ts
import { FieldApi, FormApi } from "@tanstack/react-form";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../lib/api-error";
import { clearServerErrors, serverMessage, setServerErrors, toServerErrors } from "./server-errors";

const OPTIONS = {
  renderedFields: ["title", "due_date"],
  codeToField: { assignee_not_assignable: "assignee" },
  fallback: "Could not save. Try again.",
} as const;

const invalid = (errors: Record<string, string[]>) =>
  new ApiError(400, "Invalid input.", "validation_error", errors);

describe("toServerErrors", () => {
  it("puts each rendered field's first message on that field, with no form message", () => {
    expect(toServerErrors(invalid({ title: ["Blank.", "Second."] }), OPTIONS)).toEqual({
      fields: { title: "Blank." },
    });
  });

  it("sends an error on a field the form does not render to the alert instead (D75)", () => {
    expect(toServerErrors(invalid({ description: ["Too long."] }), OPTIONS)).toEqual({
      form: "Invalid input.",
      fields: {},
    });
  });

  it("never puts a key outside renderedFields into fields (D80)", () => {
    expect(
      toServerErrors(invalid({ title: ["Blank."], description: ["Too long."] }), OPTIONS),
    ).toEqual({ fields: { title: "Blank." } });
  });

  it("routes a field-specific code to its field, by code alone", () => {
    const error = new ApiError(400, "Not assignable.", "assignee_not_assignable");
    expect(toServerErrors(error, OPTIONS)).toEqual({ fields: { assignee: "Not assignable." } });
  });

  it("shows any other API error's message as the form message", () => {
    const error = new ApiError(409, "Invalid transition.", "invalid_status_transition");
    expect(toServerErrors(error, OPTIONS)).toEqual({ form: "Invalid transition.", fields: {} });
  });

  it("falls back for anything that is not an API error", () => {
    expect(toServerErrors(new TypeError("offline"), OPTIONS)).toEqual({
      form: "Could not save. Try again.",
      fields: {},
    });
  });
});

describe("setServerErrors and clearServerErrors", () => {
  function mountedForm() {
    const form = new FormApi({ defaultValues: { title: "", due_date: "" } });
    form.mount();
    const title = new FieldApi({ form, name: "title" });
    const due = new FieldApi({ form, name: "due_date" });
    title.mount();
    due.mount();
    return { form, title, due };
  }

  it("writes the form message and each field's message into the onServer slot", () => {
    const { form, title, due } = mountedForm();
    setServerErrors(form, { form: "Whole form.", fields: { title: "Blank." } });
    expect(serverMessage(form.state.errorMap)).toBe("Whole form.");
    expect(serverMessage(title.state.meta.errorMap)).toBe("Blank.");
    expect(serverMessage(due.state.meta.errorMap)).toBeUndefined();
  });

  it("clears the form message AND every field's message", () => {
    const { form, title } = mountedForm();
    setServerErrors(form, { form: "Whole form.", fields: { title: "Blank." } });
    clearServerErrors(form);
    expect(serverMessage(form.state.errorMap)).toBeUndefined();
    expect(serverMessage(title.state.meta.errorMap)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/components/form/server-errors.test.ts`
Expected: FAIL — `Failed to resolve import "./server-errors"`.

- [ ] **Step 3: Implement**

`src/components/form/server-errors.ts`:

```ts
import type { AnyFormApi } from "@tanstack/react-form";

import { ApiError } from "../../lib/api-error";

/** What a failed submit shows: one form-level message and one message per field (D80). */
export interface ServerErrors {
  form?: string;
  fields: Record<string, string>;
}

export interface ServerErrorOptions {
  /** The fields this form renders an error for. No other key reaches `fields`. */
  renderedFields: readonly string[];
  /** Error codes that belong to one field, decided by `code`, never by parsing `detail`. */
  codeToField?: Readonly<Record<string, string>>;
  /** The message for anything that is not an ApiError. */
  fallback: string;
}

/**
 * The one mapping from a failed save to what the form shows (D80). Only the
 * keys a form renders an error for reach `fields`: Form writes `fields[name]`
 * to EVERY registered field, so an error keyed on, say, `description` would
 * otherwise appear under a textarea that never showed one, and D75 would focus
 * it instead of the alert.
 */
export function toServerErrors(
  error: unknown,
  { renderedFields, codeToField = {}, fallback }: ServerErrorOptions,
): ServerErrors {
  if (!(error instanceof ApiError)) return { form: fallback, fields: {} };
  if (error.code === "validation_error") {
    const fields: Record<string, string> = {};
    for (const name of renderedFields) {
      const message = error.fieldError(name);
      if (message !== undefined) fields[name] = message;
    }
    // An error keyed on a field this form does not render would otherwise
    // vanish; the alert carries it, and D75 focuses the alert.
    return Object.keys(fields).length > 0 ? { fields } : { form: error.message, fields };
  }
  const field = codeToField[error.code];
  if (field !== undefined) return { fields: { [field]: error.message } };
  return { form: error.message, fields: {} };
}

/** Writes the errors into the form's `onServer` slot: the form and every registered field. */
export function setServerErrors(form: AnyFormApi, errors: ServerErrors): void {
  form.setErrorMap({ onServer: { form: errors.form, fields: errors.fields } });
}

/**
 * Empties the `onServer` slot, form and fields. Call it before every submit: while
 * an onServer error stands, form-core refuses to submit at all (D80). The
 * `fields` key is required — `{ onServer: undefined }` clears only the form-level
 * message and leaves every field error, still blocking the submit.
 */
export function clearServerErrors(form: AnyFormApi): void {
  form.setErrorMap({ onServer: { form: undefined, fields: {} } });
}

/** The message setServerErrors left in an `onServer` slot, if any. */
export function serverMessage(errorMap: { onServer?: unknown }): string | undefined {
  return typeof errorMap.onServer === "string" ? errorMap.onServer : undefined;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- src/components/form/server-errors.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/components/form/server-errors.ts src/components/form/server-errors.test.ts
git commit -m "feat: add one server-error mapper for every form (D80)"
```

---

### Task 8: The app form: contexts, fields and form components (D79)

**Files:**
- Modify: `src/components/TextField.tsx`
- Create: `src/components/form/form-contexts.ts`, `src/components/form/fields/TextField.tsx`, `src/components/form/fields/TextareaField.tsx`, `src/components/form/fields/SelectField.tsx`, `src/components/form/fields/CheckboxField.tsx`, `src/components/form/fields/CheckboxGroupField.tsx`, `src/components/form/SubmitButton.tsx`, `src/components/form/ServerFormError.tsx`, `src/components/form/app-form.ts`
- Test: `src/components/form/app-form.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/form/app-form.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api-error";
import { useAppForm } from "./app-form";
import { clearServerErrors, setServerErrors, toServerErrors } from "./server-errors";

/** The smallest form wired the way every app form is (spec §5.2). */
function Harness({ save }: { save: (values: { email: string }) => Promise<unknown> }) {
  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save(value);
      } catch (caught) {
        setServerErrors(
          formApi,
          toServerErrors(caught, { renderedFields: ["email"], fallback: "Could not save." }),
        );
      }
    },
  });
  return (
    <form
      noValidate
      aria-label="Harness"
      onSubmit={(event) => {
        event.preventDefault();
        clearServerErrors(form);
        void form.handleSubmit();
      }}
    >
      <form.AppField name="email">{(field) => <field.TextField id="email" label="Email" />}</form.AppField>
      <form.AppForm>
        <form.ServerFormError />
        <form.SubmitButton label="Save" pendingLabel="Saving…" />
      </form.AppForm>
    </form>
  );
}

const taken = () => new ApiError(400, "Invalid input.", "validation_error", { email: ["Taken."] });

describe("useAppForm", () => {
  it("shows a field's server error beside it and marks the input invalid", async () => {
    render(<Harness save={() => Promise.reject(taken())} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Taken.")).toHaveAttribute("id", "email-error");
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a form-level message in the alert", async () => {
    render(<Harness save={() => Promise.reject(new ApiError(409, "Conflict.", "conflict"))} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conflict.");
  });

  it("submits again after a server error, and clears the old one (D80)", async () => {
    const save = vi.fn().mockRejectedValueOnce(taken()).mockResolvedValueOnce(undefined);
    render(<Harness save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Taken.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Taken.")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("disables the button and shows its pending label while submitting", async () => {
    render(<Harness save={() => new Promise(() => {})} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/components/form/app-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./app-form"`.

- [ ] **Step 3: Give the presentational TextField a compact density**

Replace `src/components/TextField.tsx` entirely:

```tsx
import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** A server-side field error, rendered beside the input (F3). */
  error?: string;
  /** "compact" is the filter bar's look: smaller text, auto width, no bottom margin. */
  density?: "default" | "compact";
}

export function TextField({
  id,
  label,
  error,
  density = "default",
  className,
  ...input
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const compact = density === "compact";
  return (
    <div className={compact ? undefined : "mb-4"}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={clsx(
          "rounded border px-3 py-2",
          compact ? "text-sm" : "w-full text-slate-900",
          error === undefined ? "border-slate-300" : "border-status-overdue",
          className,
        )}
        {...input}
      />
      {error !== undefined && (
        <p id={errorId} className="mt-1 text-sm text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
```

(`{...input}` stays last, so an explicit `aria-invalid` / `aria-describedby` from a caller — D78's date range — overrides the error-driven ones. The class sets are exactly today's: `w-full rounded border px-3 py-2 text-slate-900` plus the border colour for forms, `rounded border border-slate-300 px-3 py-2 text-sm` for the filter bar.)

- [ ] **Step 4: The contexts and the bound fields**

`src/components/form/form-contexts.ts`:

```ts
import { createFormHookContexts } from "@tanstack/react-form";

/**
 * The form and field contexts (D79). A module of its own, so the hook factory
 * (app-form.ts) and the components it registers do not import each other.
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();
```

`src/components/form/fields/TextField.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";
import type { InputHTMLAttributes } from "react";

import { TextField as TextFieldView } from "../../TextField";
import { useFieldContext } from "../form-contexts";
import { serverMessage } from "../server-errors";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "defaultValue" | "onChange" | "onBlur" | "checked"
>;

interface TextFieldProps extends InputProps {
  id: string;
  label: string;
  density?: "default" | "compact";
}

/** A text-like input bound to its form field, showing the field's server error (D80). */
export function TextField(props: TextFieldProps) {
  const field = useFieldContext<string>();
  const value = useSelector(field.store, (state) => state.value);
  const error = useSelector(field.store, (state) => serverMessage(state.meta.errorMap));
  return (
    <TextFieldView
      {...props}
      value={value}
      error={error}
      onChange={(event) => field.handleChange(event.target.value)}
      onBlur={field.handleBlur}
    />
  );
}
```

`src/components/form/fields/TextareaField.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";

import { useFieldContext } from "../form-contexts";

/** A textarea bound to its form field. No form routes an error here (D80). */
export function TextareaField({ id, label, rows = 4 }: { id: string; label: string; rows?: number }) {
  const field = useFieldContext<string>();
  const value = useSelector(field.store, (state) => state.value);
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        className="w-full rounded border border-slate-300 px-3 py-2"
      />
    </div>
  );
}
```

`src/components/form/fields/SelectField.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";
import clsx from "clsx";

import { useFieldContext } from "../form-contexts";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  options: readonly SelectOption<T>[];
  density?: "default" | "compact";
}

/** A select bound to its form field. The options fix which values it can hold. */
export function SelectField<T extends string>({
  id,
  label,
  options,
  density = "default",
}: SelectFieldProps<T>) {
  const field = useFieldContext<T>();
  const value = useSelector(field.store, (state) => state.value);
  const compact = density === "compact";
  return (
    <div className={compact ? undefined : "mb-4"}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        // The options come from `options`, so the value is always a T.
        onChange={(event) => field.handleChange(event.target.value as T)}
        onBlur={field.handleBlur}
        className={clsx("rounded border border-slate-300 px-3 py-2", compact ? "text-sm" : "w-full")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

`src/components/form/fields/CheckboxField.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";
import clsx from "clsx";

import { useFieldContext } from "../form-contexts";

/** A single checkbox bound to a boolean form field, its label wrapping it. */
export function CheckboxField({
  label,
  density = "default",
}: {
  label: string;
  density?: "default" | "compact";
}) {
  const field = useFieldContext<boolean>();
  const checked = useSelector(field.store, (state) => state.value);
  return (
    <label
      className={clsx(
        "flex items-center text-sm text-slate-700",
        density === "compact" ? "gap-1.5" : "mb-4 gap-2",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => field.handleChange(event.target.checked)}
        onBlur={field.handleBlur}
      />
      {label}
    </label>
  );
}
```

`src/components/form/fields/CheckboxGroupField.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";

import { useFieldContext } from "../form-contexts";
import type { SelectOption } from "./SelectField";

/** A fieldset of checkboxes bound to an array field: each one toggles its value. */
export function CheckboxGroupField<T extends string>({
  legend,
  options,
}: {
  legend: string;
  options: readonly SelectOption<T>[];
}) {
  const field = useFieldContext<T[]>();
  const selected = useSelector(field.store, (state) => state.value);

  function toggle(value: T) {
    field.handleChange((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <fieldset className="mb-3">
      <legend className="mb-2 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 5: The form components and the hook**

`src/components/form/SubmitButton.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";

import { Button } from "../Button";
import { useFormContext } from "./form-contexts";

/** The submit button: disabled, showing its pending label, while the form submits. */
export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  return (
    <Button type="submit" disabled={isSubmitting} className={className}>
      {isSubmitting ? pendingLabel : label}
    </Button>
  );
}
```

`src/components/form/ServerFormError.tsx`:

```tsx
import { useSelector } from "@tanstack/react-form";

import { FormError } from "../FormError";
import { useFormContext } from "./form-contexts";
import { serverMessage } from "./server-errors";

/** The form-level server message, in the role="alert" that D75 focuses (D80). */
export function ServerFormError() {
  const form = useFormContext();
  const message = useSelector(form.store, (state) => serverMessage(state.errorMap) ?? null);
  return <FormError message={message} />;
}
```

`src/components/form/app-form.ts`:

```ts
import { createFormHook } from "@tanstack/react-form";

import { CheckboxField } from "./fields/CheckboxField";
import { CheckboxGroupField } from "./fields/CheckboxGroupField";
import { SelectField } from "./fields/SelectField";
import { TextareaField } from "./fields/TextareaField";
import { TextField } from "./fields/TextField";
import { fieldContext, formContext } from "./form-contexts";
import { ServerFormError } from "./ServerFormError";
import { SubmitButton } from "./SubmitButton";

/**
 * The app's one form hook (D79): every form and filter panel uses these field
 * components, so they share one look and one error display. Validation stays
 * on the server; there are no client validators.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, CheckboxField, CheckboxGroupField },
  formComponents: { SubmitButton, ServerFormError },
});
```

- [ ] **Step 6: Run it to see it pass**

Run: `npm test -- src/components/form`
Expected: PASS — 4 app-form tests and 8 server-errors tests.

- [ ] **Step 7: Prove the re-submit test guards D80**

Temporarily delete the `clearServerErrors(form);` line from `Harness` in `app-form.test.tsx`.
Run: `npm test -- src/components/form/app-form.test.tsx -t "submits again"`
Expected: FAIL — `save` called 1 time, not 2.
Restore the line; re-run: PASS.

- [ ] **Step 8: Gates, then commit**

```bash
git add src/components/TextField.tsx src/components/form
git commit -m "feat: add the app form hook, bound fields and form components (D79)

The re-submit test fails when clearServerErrors is left out.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: LoginPage on the app form

**Files:**
- Modify: `src/features/auth/LoginPage.tsx`
- Test: `src/features/auth/LoginPage.test.tsx` (one test added)

- [ ] **Step 1: Write the new test**

In `src/features/auth/LoginPage.test.tsx`, inside `describe("LoginPage", …)` after "disables the submit button while the request is in flight", add:

```tsx
  it("lets a second attempt through after a failed one (D80)", async () => {
    let attempts = 0;
    server.use(
      http.post(`${BASE}/auth/login/`, () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json(
            {
              detail: "No active account found with the given credentials.",
              code: "no_active_account",
              errors: null,
            },
            { status: 401 },
          );
        }
        signedIn = true;
        return HttpResponse.json({ access: "fresh-access-token", user: SUPERVISOR });
      }),
    );
    await renderApp("/login");
    const user = await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no active account/i);
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
```

Run: `npm test -- src/features/auth/LoginPage.test.tsx`
Expected: PASS on the current `useState` form (it has always allowed a retry). This test guards the migration.

- [ ] **Step 2: Rewrite LoginPage on the app form**

Replace `src/features/auth/LoginPage.tsx` entirely:

```tsx
import { useAppForm } from "../../components/form/app-form";
import {
  clearServerErrors,
  setServerErrors,
  type ServerErrors,
} from "../../components/form/server-errors";
import { useFocusFirstError } from "../../components/useFocusFirstError";
import { ApiError } from "../../lib/api-error";
import { useAuth } from "./hooks/useAuth";

const LOGIN_DEFAULTS = { email: "", password: "" };

/**
 * Sign-in's own error rules, unlike the shared mapper: the message always shows,
 * beside any field errors, and a 429 gets fixed copy.
 */
function loginErrors(error: unknown): ServerErrors {
  if (!(error instanceof ApiError)) {
    return { form: "Could not reach the server. Try again.", fields: {} };
  }
  // Branch on STATUS, not on the message: the backend's throttle copy is not a
  // contract, the 429 is.
  if (error.status === 429) {
    return { form: "Too many attempts. Wait a minute and try again.", fields: {} };
  }
  // Otherwise show what the server said rather than inventing copy (F3).
  const fields: Record<string, string> = {};
  for (const name of ["email", "password"]) {
    const message = error.fieldError(name);
    if (message !== undefined) fields[name] = message;
  }
  return { form: error.message, fields };
}

export function LoginPage() {
  const { signIn } = useAuth();
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const form = useAppForm({
    defaultValues: LOGIN_DEFAULTS,
    onSubmit: async ({ value, formApi }) => {
      try {
        await signIn(value.email, value.password);
        // The router's beforeLoad sends the user to their role's landing page.
      } catch (caught) {
        setServerErrors(formApi, loginErrors(caught));
        signalFailure();
      }
    },
  });

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          // D80: a standing server error would make the form refuse this submit.
          clearServerErrors(form);
          void form.handleSubmit();
        }}
        noValidate
        aria-label="Sign in"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h1>

        <form.AppField name="email">
          {(field) => (
            <field.TextField
              id="email"
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => (
            <field.TextField
              id="password"
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </form.AppField>

        <form.AppForm>
          <form.ServerFormError />
          <form.SubmitButton label="Sign in" pendingLabel="Signing in…" className="w-full" />
        </form.AppForm>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Run the login tests**

Run: `npm test -- src/features/auth`
Expected: PASS — every LoginPage test (D75 focus to the field and to the alert, the 429 copy, per-field errors, disabled while in flight, no token in storage) and the new one.

- [ ] **Step 4: Gates, then commit**

```bash
git add src/features/auth/LoginPage.tsx src/features/auth/LoginPage.test.tsx
git commit -m "refactor: build the sign-in form on the app form (D79, D80)"
```

---

### Task 10: UserForm on the app form, with its snapshot (D79, D81)

**Files:**
- Modify: `src/features/users/components/UserForm.tsx`
- Test: `src/features/users/UserForm.test.tsx` (two tests added)

- [ ] **Step 1: Write the two new tests**

In `src/features/users/UserForm.test.tsx`, add `import { focusManager } from "@tanstack/react-query";` as the first import line and change the Testing Library import to `import { act, screen, waitFor } from "@testing-library/react";`. Then, at the end of `describe("UserForm", …)`, add:

```tsx
  it("submits again after a server error (D80)", async () => {
    let posts = 0;
    server.use(
      http.post(`${BASE}/users/`, () => {
        posts += 1;
        return posts === 1
          ? HttpResponse.json(
              {
                detail: "A user with this email address already exists.",
                code: "email_already_in_use",
                errors: null,
              },
              { status: 400 },
            )
          : HttpResponse.json(TARGET, { status: 201 });
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp("/users/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^email$/i), "dupe@demo.local");
    await user.type(screen.getByLabelText(/first name/i), "D");
    await user.type(screen.getByLabelText(/last name/i), "Upe");
    await user.type(screen.getByLabelText(/^password$/i), "a-strong-password-1");
    await user.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(posts).toBe(2));
  });

  it("keeps the values it loaded when a focus refetch brings newer ones (D81)", async () => {
    let gets = 0;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/users/${TARGET.id}/`, () => {
        gets += 1;
        return HttpResponse.json(
          gets === 1 ? TARGET : { ...TARGET, first_name: "Changed", role: "SUPERVISOR" },
        );
      }),
      http.patch(`${BASE}/users/${TARGET.id}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(TARGET);
      }),
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    );
    await renderApp(`/users/${TARGET.id}`);
    await screen.findByRole("button", { name: /save changes/i });
    try {
      // The test client's staleTime of 0 makes a focus event refetch the user.
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(gets).toBe(2));
      expect(screen.getByLabelText(/first name/i)).toHaveValue("Omar");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      await waitFor(() => expect(body).not.toBeNull());
      expect(body).toMatchObject({ first_name: "Omar", role: "OPERATOR" });
    } finally {
      // Restores the shared singleton (see the D40 test in TaskForm.test.tsx).
      focusManager.setFocused(undefined);
    }
  });
```

Run: `npm test -- src/features/users/UserForm.test.tsx`
Expected: PASS on the current form: its `useState` initialisers already act as a snapshot.

- [ ] **Step 2: Rewrite UserForm on the app form**

Replace `src/features/users/components/UserForm.tsx` entirely:

```tsx
import { useState } from "react";

import { Button } from "../../../components/Button";
import { useAppForm } from "../../../components/form/app-form";
import {
  clearServerErrors,
  setServerErrors,
  toServerErrors,
} from "../../../components/form/server-errors";
import { useFocusFirstError } from "../../../components/useFocusFirstError";
import { useAuth } from "../../auth/hooks/useAuth";
import { ROLE_LABEL, ROLES, type Role } from "../../auth/types";
import type { UserDetail } from "../types";

export interface UserFormValues {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
}

interface UserFormProps {
  user?: UserDetail;
  onSubmit: (values: UserFormValues) => Promise<unknown>;
  onCancel: () => void;
}

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

export function UserForm({ user, onSubmit, onCancel }: UserFormProps) {
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const isEdit = user !== undefined;
  const { user: currentUser } = useAuth();
  // D66: an Admin's own role and active flag are not theirs to change. The
  // values are still submitted, unchanged, which the API accepts.
  const isSelf = user !== undefined && user.id === currentUser?.id;
  // D81: taken once. UserEditPage passes the live query result, which refetches
  // on focus, and useForm re-applies changed defaults to an untouched form.
  const [defaults] = useState<UserFormValues>(() => ({
    email: user?.email ?? "",
    password: "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    role: user?.role ?? "OPERATOR",
    is_active: user?.is_active ?? true,
  }));

  const form = useAppForm({
    defaultValues: defaults,
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(value);
      } catch (caught) {
        setServerErrors(
          formApi,
          toServerErrors(caught, {
            renderedFields: ["email", "first_name", "last_name", "password"],
            // Against the field, not the form: it is the email that is wrong.
            codeToField: { email_already_in_use: "email" },
            fallback: "Could not save. Try again.",
          }),
        );
        signalFailure();
      }
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        // D80: a standing server error would make the form refuse this submit.
        clearServerErrors(form);
        void form.handleSubmit();
      }}
      noValidate
      aria-label={isEdit ? "Edit user" : "New user"}
    >
      <form.AppField name="email">
        {(field) => (
          <field.TextField
            id="email"
            label="Email"
            type="email"
            required
            // The backend does not accept an email change on update, so the field
            // is read-only in edit mode rather than silently discarded.
            readOnly={isEdit}
          />
        )}
      </form.AppField>

      <form.AppField name="first_name">
        {(field) => <field.TextField id="first_name" label="First name" required />}
      </form.AppField>

      <form.AppField name="last_name">
        {(field) => <field.TextField id="last_name" label="Last name" required />}
      </form.AppField>

      <form.AppField name="password">
        {(field) => (
          <field.TextField
            id="password"
            label={isEdit ? "New password (leave blank to keep the current one)" : "Password"}
            type="password"
            autoComplete="new-password"
            required={!isEdit}
          />
        )}
      </form.AppField>

      {isSelf ? (
        <div className="mb-4">
          {/* Plain text, not a <label>: there is no control to label. */}
          <p className="mb-1 text-sm font-medium text-slate-700">Role</p>
          <p className="text-sm text-slate-900">{ROLE_LABEL[defaults.role]}</p>
          <p className="mt-1 text-sm text-slate-500">
            You can&apos;t change your own role or deactivate your own account.
          </p>
        </div>
      ) : (
        <form.AppField name="role">
          {(field) => <field.SelectField id="role" label="Role" options={ROLE_OPTIONS} />}
        </form.AppField>
      )}

      {isEdit && !isSelf && (
        <form.AppField name="is_active">
          {(field) => <field.CheckboxField label="Active (can sign in)" />}
        </form.AppField>
      )}

      <form.AppForm>
        <form.ServerFormError />
        <div className="flex gap-2">
          <form.SubmitButton label={isEdit ? "Save changes" : "Create user"} pendingLabel="Saving…" />
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form.AppForm>
    </form>
  );
}
```

- [ ] **Step 3: Run the user tests**

Run: `npm test -- src/features/users`
Expected: PASS — all UserForm tests (D75 focus, `email_already_in_use` on the field, per-field errors, no empty password on edit, the D66 read-only role, `cannot_change_own_access` as a form message) and both new ones.

- [ ] **Step 4: Prove the snapshot test guards D81**

Temporarily replace `const [defaults] = useState<UserFormValues>(() => ({` with `const defaults: UserFormValues = ({` and its closing `}));` with `});`, so the defaults follow the live user.
Run: `npm test -- src/features/users/UserForm.test.tsx -t "focus refetch"`
Expected: FAIL — the first name reads "Changed", or the PATCH carries `first_name: "Changed"`.
Restore the `useState` lines; re-run: PASS.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/features/users/components/UserForm.tsx src/features/users/UserForm.test.tsx
git commit -m "refactor: build the user form on the app form, with a defaults snapshot (D79, D81)

The refetch test fails with live defaults.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The task form's values: snapshot and API payload (D32, D40, D81)

**Files:**
- Create: `src/features/tasks/task-form-values.ts`
- Test: `src/features/tasks/task-form-values.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/tasks/task-form-values.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { taskSnapshot, toTaskInput } from "./task-form-values";
import type { TaskDetail } from "./types";

const OPERATOR = {
  id: "0199a0f0-0000-7000-8000-00000000op01",
  email: "operator@demo.local",
  first_name: "Omar",
  last_name: "Operator",
  role: "OPERATOR" as const,
};

const DETAIL: TaskDetail = {
  id: "0199a0f0-0000-7000-8000-0000000000a1",
  title: "Review the brief",
  description: "Read it closely.",
  status: "PENDING",
  allowed_transitions: ["IN_PROGRESS", "CANCELLED"],
  due_date: null,
  assignee: OPERATOR,
  created_by: OPERATOR,
  is_overdue: false,
  can_delete: true,
  completed_at: null,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
};

describe("taskSnapshot", () => {
  it("gives a new task empty defaults, Pending, and no transitions", () => {
    expect(taskSnapshot(undefined)).toEqual({
      defaults: { title: "", description: "", due_date: "", assignee: null, status: "PENDING" },
      initialStatus: undefined,
      initialTransitions: [],
    });
  });

  it("takes an existing task's values, with the due date as its UTC day (D76)", () => {
    const snapshot = taskSnapshot({ ...DETAIL, due_date: "2026-09-28T12:00:00Z" });
    expect(snapshot.defaults).toEqual({
      title: "Review the brief",
      description: "Read it closely.",
      due_date: "2026-09-28",
      assignee: OPERATOR,
      status: "PENDING",
    });
    expect(snapshot.initialStatus).toBe("PENDING");
    expect(snapshot.initialTransitions).toEqual(["IN_PROGRESS", "CANCELLED"]);
  });
});

describe("toTaskInput", () => {
  const draft = taskSnapshot(DETAIL).defaults;
  const create = { canChooseAssignee: true, isEdit: false, initialStatus: undefined };
  const edit = { canChooseAssignee: true, isEdit: true, initialStatus: "PENDING" as const };

  it("sends no deadline as null, and a day as noon UTC (D76)", () => {
    expect(toTaskInput({ ...draft, due_date: "" }, create).due_date).toBeNull();
    expect(toTaskInput({ ...draft, due_date: "2026-10-07" }, create).due_date).toBe(
      "2026-10-07T12:00:00.000Z",
    );
  });

  it("omits the assignee when the actor may not choose one (D32)", () => {
    expect(toTaskInput(draft, { ...create, canChooseAssignee: false })).not.toHaveProperty(
      "assignee",
    );
  });

  it("sends null for Unassigned and the id for a chosen user (D32)", () => {
    expect(toTaskInput({ ...draft, assignee: null }, create).assignee).toBeNull();
    expect(toTaskInput(draft, create).assignee).toBe(OPERATOR.id);
  });

  it("never sends a status on create", () => {
    expect(toTaskInput({ ...draft, status: "IN_PROGRESS" }, create)).not.toHaveProperty("status");
  });

  it("sends a status on edit only when it changed (D40)", () => {
    expect(toTaskInput(draft, edit)).not.toHaveProperty("status");
    expect(toTaskInput({ ...draft, status: "IN_PROGRESS" }, edit).status).toBe("IN_PROGRESS");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/features/tasks/task-form-values.test.ts`
Expected: FAIL — `Failed to resolve import "./task-form-values"`.

- [ ] **Step 3: Implement**

`src/features/tasks/task-form-values.ts`:

```ts
import type { UserMinimal } from "../users/types";
import type { TaskDetail, TaskStatus } from "./types";

/** What the task form edits: shaped for its inputs, not for the API. */
export type TaskFormDraft = {
  title: string;
  description: string;
  /** "yyyy-mm-dd", or "" for no deadline: what <input type="date"> holds. */
  due_date: string;
  /** The whole user, not an id: the picker loads a page at a time (D64). */
  assignee: UserMinimal | null;
  status: TaskStatus;
};

/** What TaskForm hands its page: the API's shape. */
export interface TaskFormValues {
  title: string;
  description: string;
  due_date: string | null;
  /**
   * Absent when the actor may not choose an assignee (an Operator, D15/D16);
   * null means "unassigned". The two must stay distinct: the API reads an
   * omitted assignee as "leave it / default it" and null as "unassign" (D32).
   */
  assignee?: string | null;
  status?: TaskStatus;
}

/**
 * D40/D81: ONE snapshot, taken when the form opens. It seeds the draft and
 * drives the status field: the options, the read-only switch and the "did the
 * user change it?" check. The detail query refetches (30 s staleTime, refetch on
 * focus) and none of these may follow it — options from the select's own value
 * would drop the original status after a change; read-only from the live task
 * could strand a changed value; comparing with the live status would silently
 * undo a change someone else made meanwhile.
 */
export interface TaskSnapshot {
  defaults: TaskFormDraft;
  initialStatus: TaskStatus | undefined;
  initialTransitions: TaskStatus[];
}

export function taskSnapshot(task: TaskDetail | undefined): TaskSnapshot {
  return {
    defaults: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      due_date: task?.due_date?.slice(0, 10) ?? "",
      assignee: task?.assignee ?? null,
      status: task?.status ?? "PENDING",
    },
    initialStatus: task?.status,
    initialTransitions: task?.allowed_transitions ?? [],
  };
}

export function toTaskInput(
  draft: TaskFormDraft,
  {
    canChooseAssignee,
    isEdit,
    initialStatus,
  }: { canChooseAssignee: boolean; isEdit: boolean; initialStatus: TaskStatus | undefined },
): TaskFormValues {
  return {
    title: draft.title,
    description: draft.description,
    due_date: draft.due_date === "" ? null : new Date(`${draft.due_date}T12:00:00Z`).toISOString(),
    ...(canChooseAssignee ? { assignee: draft.assignee?.id ?? null } : {}),
    // Sent only when the user changed it (D40). TaskEditPage omits an undefined
    // status from the PATCH.
    ...(isEdit && draft.status !== initialStatus ? { status: draft.status } : {}),
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- src/features/tasks/task-form-values.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/features/tasks/task-form-values.ts src/features/tasks/task-form-values.test.ts
git commit -m "feat: extract the task form's snapshot and payload as pure functions (D32, D40, D81)"
```

---

### Task 12: TaskForm on the app form (D79, D81)

**Files:**
- Modify: `src/features/tasks/components/TaskForm.tsx`, `src/features/tasks/TaskFormPage.tsx:5`
- Test: `src/features/tasks/TaskForm.test.tsx` (two tests added)

- [ ] **Step 1: Write the two new tests**

The existing D40 refetch test ("does not undo a status someone else changed…") does **not** guard the snapshot on its own: with live defaults an untouched form follows the refetch on both sides of the status comparison, sends no status, and still passes. The second test below pins what the snapshot really protects — an untouched form keeps the values it loaded.

In `src/features/tasks/TaskForm.test.tsx`, inside `describe("TaskForm", …)` after "moves focus to the first invalid field after a failed save, every time (D75)", add both:

```tsx
  it("saves on a second attempt after a server error (D80)", async () => {
    signedInAs(SUPERVISOR);
    taskDetail();
    let posts = 0;
    server.use(
      http.post(`${BASE}/tasks/`, () => {
        posts += 1;
        return posts === 1
          ? HttpResponse.json(
              {
                detail: "Invalid input.",
                code: "validation_error",
                errors: { title: ["This field may not be blank."] },
              },
              { status: 400 },
            )
          : HttpResponse.json(DETAIL, { status: 201 });
      }),
    );
    await renderApp("/tasks/new");
    const user = userEvent.setup();
    const submit = await screen.findByRole("button", { name: /create task/i });
    await user.click(submit);
    expect(await screen.findByText(/may not be blank/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/title/i), "A task");
    await user.click(submit);
    await waitFor(() => expect(posts).toBe(2));
  });

  it("keeps the values it loaded when a focus refetch brings newer ones (D81)", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    let gets = 0;
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () => {
        gets += 1;
        return HttpResponse.json(gets === 1 ? DETAIL : { ...DETAIL, title: "Renamed elsewhere" });
      }),
    );
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByRole("button", { name: /save changes/i });
    try {
      // The test client's staleTime of 0 makes a focus event refetch the task.
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await waitFor(() => expect(gets).toBe(2));
      expect(screen.getByLabelText(/title/i)).toHaveValue("Review the brief");
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      await waitFor(() => expect(patches.bodies).toHaveLength(1));
      expect(patches.bodies[0]).toMatchObject({ title: "Review the brief" });
    } finally {
      // Restores the shared singleton (see the D40 test below).
      focusManager.setFocused(undefined);
    }
  });
```

Run: `npm test -- src/features/tasks/TaskForm.test.tsx`
Expected: PASS on the current form: its `useState` initialisers already act as a snapshot.

- [ ] **Step 2: Rewrite TaskForm on the app form**

Replace `src/features/tasks/components/TaskForm.tsx` entirely:

```tsx
import { useState } from "react";

import { Button } from "../../../components/Button";
import { useAppForm } from "../../../components/form/app-form";
import {
  clearServerErrors,
  serverMessage,
  setServerErrors,
  toServerErrors,
} from "../../../components/form/server-errors";
import { useFocusFirstError } from "../../../components/useFocusFirstError";
import { useAuth } from "../../auth/hooks/useAuth";
import { taskSnapshot, toTaskInput, type TaskFormValues } from "../task-form-values";
import type { TaskDetail, TaskStatus } from "../types";
import { AssigneeCombobox } from "./AssigneeCombobox";
import { STATUS_LABEL, StatusBadge } from "./StatusBadge";

/**
 * Display order only — Pending, In progress, Completed, Cancelled — taken from
 * the label map's declaration order. Which statuses are OFFERED is the API's
 * call (allowed_transitions, D39), never this list's.
 */
const STATUS_ORDER = Object.keys(STATUS_LABEL) as TaskStatus[];

interface TaskFormProps {
  /** Present in edit mode, absent when creating. */
  task?: TaskDetail;
  onSubmit: (values: TaskFormValues) => Promise<unknown>;
  onCancel: () => void;
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const { user } = useAuth();
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const isEdit = task !== undefined;
  // D15/D16: an Operator cannot choose an assignee — on create it defaults to
  // self, on update it is immutable. Rendering the field would offer a choice
  // that cannot work, so it is omitted rather than disabled.
  const canChooseAssignee = user?.role === "SUPERVISOR";
  // D40/D81: taken once, when the form opens. useForm re-applies changed
  // defaults to an untouched form on every render, so the live task must never
  // reach it — see taskSnapshot.
  const [snapshot] = useState(() => taskSnapshot(task));
  const { initialStatus, initialTransitions } = snapshot;
  const statusOptions = STATUS_ORDER.filter(
    (option) => option === initialStatus || initialTransitions.includes(option),
  ).map((option) => ({ value: option, label: STATUS_LABEL[option] }));

  const form = useAppForm({
    defaultValues: snapshot.defaults,
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(toTaskInput(value, { canChooseAssignee, isEdit, initialStatus }));
      } catch (caught) {
        setServerErrors(
          formApi,
          toServerErrors(caught, {
            renderedFields: canChooseAssignee
              ? ["title", "due_date", "assignee"]
              : ["title", "due_date"],
            // Distinguished by `code` alone, never by parsing `detail` — which is
            // exactly why spec §8.7 keeps the two assignee codes separate.
            codeToField: { assignee_not_assignable: "assignee" },
            fallback: "Could not save. Try again.",
          }),
        );
        signalFailure();
      }
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        // D80: a standing server error would make the form refuse this submit.
        clearServerErrors(form);
        void form.handleSubmit();
      }}
      noValidate
      aria-label={isEdit ? "Edit task" : "New task"}
    >
      <form.AppField name="title">
        {(field) => <field.TextField id="title" label="Title" required maxLength={200} />}
      </form.AppField>

      <form.AppField name="description">
        {(field) => <field.TextareaField id="description" label="Description" />}
      </form.AppField>

      <form.AppField name="due_date">
        {(field) => <field.TextField id="due_date" label="Due date" type="date" />}
      </form.AppField>

      {canChooseAssignee && (
        <form.AppField name="assignee">
          {(field) => (
            <AssigneeCombobox
              id="assignee"
              label="Assignee"
              value={field.state.value}
              onChange={field.handleChange}
              error={serverMessage(field.state.meta.errorMap)}
            />
          )}
        </form.AppField>
      )}

      {/* Edit mode only: TaskCreateSerializer accepts no status field. */}
      {isEdit && initialTransitions.length > 0 && (
        <form.AppField name="status">
          {(field) => <field.SelectField id="status" label="Status" options={statusOptions} />}
        </form.AppField>
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

      <form.AppForm>
        <form.ServerFormError />
        <div className="flex gap-2">
          <form.SubmitButton label={isEdit ? "Save changes" : "Create task"} pendingLabel="Saving…" />
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form.AppForm>
    </form>
  );
}
```

In `src/features/tasks/TaskFormPage.tsx`, replace line 5
`import { TaskForm, type TaskFormValues } from "./components/TaskForm";`
with `import { TaskForm } from "./components/TaskForm";`, and add
`import type { TaskFormValues } from "./task-form-values";`
after the `./hooks/useTasksBackSearch` import.

- [ ] **Step 3: Run the task form tests**

Run: `npm test -- src/features/tasks/TaskForm.test.tsx`
Expected: PASS — including "does not undo a status someone else changed while the form was open" (D40 refetch), "keeps Pending on offer after changing a pending task to In progress", "surfaces a 400 assignee_not_assignable against the assignee field", "surfaces a 409 invalid_status_transition as a form-level message", "shows the message in the alert, focused, when the errors name no rendered field (D75)", every combobox test, and both new ones.

- [ ] **Step 4: Prove the snapshot test guards D81**

Temporarily replace `const [snapshot] = useState(() => taskSnapshot(task));` with `const snapshot = taskSnapshot(task);`.
Run: `npm test -- src/features/tasks/TaskForm.test.tsx -t "focus refetch brings newer"`
Expected: FAIL — the Title input reads "Renamed elsewhere" (useForm re-applied the refetched defaults to the untouched form).
Restore the `useState` line; re-run: PASS.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/features/tasks/components/TaskForm.tsx src/features/tasks/TaskFormPage.tsx src/features/tasks/TaskForm.test.tsx
git commit -m "refactor: build the task form on the app form, from its snapshot (D79, D81)

The new refetch test fails with live defaults.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Phase 3 — Filters

### Task 13: `useUrlFieldSync` (D82)

**Files:**
- Create: `src/lib/useUrlFieldSync.ts`
- Test: `src/lib/useUrlFieldSync.test.ts`

The seven `useSearchParamDraft` cases move here unchanged in meaning; the draft now lives in a form field, which the tests stand in for with a `write` spy. `useSearchParamDraft` itself is removed in Task 15, once nothing imports it.

- [ ] **Step 1: Write the failing test**

`src/lib/useUrlFieldSync.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUrlFieldSync } from "./useUrlFieldSync";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** `write` stands in for the form field: it receives what the hook puts there. */
function setup<T>(initial: T, options: { delayMs?: number; equals?: (a: T, b: T) => boolean } = {}) {
  const commit = vi.fn<(value: T) => void>();
  const write = vi.fn<(value: T) => void>();
  const hook = renderHook(
    ({ committed, onCommit }: { committed: T; onCommit: (value: T) => void }) =>
      useUrlFieldSync({ committed, commit: onCommit, write, ...options }),
    { initialProps: { committed: initial, onCommit: commit } },
  );
  return { commit, write, hook };
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

describe("useUrlFieldSync: typed text, 300 ms", () => {
  it("leaves the field alone on mount: its default already is the URL value", () => {
    const { commit, write } = setup("omar");
    expect(write).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits once, 300 ms after the last change", () => {
    const { commit, hook } = setup("");
    act(() => hook.result.current.onChange("o"));
    act(() => vi.advanceTimersByTime(100));
    act(() => hook.result.current.onChange("om"));
    act(() => vi.advanceTimersByTime(299));
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(commit.mock.calls).toEqual([["om"]]);
  });

  it("ignores the echo of its own commit, even after more typing", () => {
    const { commit, write, hook } = setup("");
    act(() => hook.result.current.onChange("om"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith("om");
    act(() => hook.result.current.onChange("oma"));
    hook.rerender({ committed: "om", onCommit: commit });
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenLastCalledWith("oma");
  });

  it("takes a value it did not write, and drops its pending commit", () => {
    const { commit, write, hook } = setup("omar");
    act(() => hook.result.current.onChange("omar x"));
    hook.rerender({ committed: "", onCommit: commit });
    expect(write).toHaveBeenCalledWith("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("drops a pending commit on unmount", () => {
    const { commit, hook } = setup("");
    act(() => hook.result.current.onChange("x"));
    hook.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("cancel() drops a pending commit and puts the field back to the URL's value", () => {
    const { commit, write, hook } = setup("");
    act(() => hook.result.current.onChange("2026-10-06"));
    act(() => hook.result.current.cancel());
    expect(write).toHaveBeenCalledWith("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("calls the latest commit callback, not the one current when typing began", () => {
    const { commit, hook } = setup("");
    act(() => hook.result.current.onChange("x"));
    const later = vi.fn<(value: string) => void>();
    hook.rerender({ committed: "", onCommit: later });
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith("x");
  });
});

describe("useUrlFieldSync: immediate fields", () => {
  it("commits at once with delayMs 0", () => {
    const { commit, hook } = setup<string[]>([], { delayMs: 0, equals: sameList });
    act(() => hook.result.current.onChange(["PENDING"]));
    expect(commit).toHaveBeenCalledWith(["PENDING"]);
  });

  it("lets the first of two quick writes echo without reverting the second", () => {
    const { commit, write, hook } = setup<string[]>([], { delayMs: 0, equals: sameList });
    act(() => hook.result.current.onChange(["A"]));
    act(() => hook.result.current.onChange(["A", "B"]));
    hook.rerender({ committed: ["A"], onCommit: commit });
    hook.rerender({ committed: ["A", "B"], onCommit: commit });
    expect(write).not.toHaveBeenCalled();
  });

  it("treats an equal, rebuilt array as no change, and a different one as news", () => {
    const { commit, write, hook } = setup<string[]>(["A"], { delayMs: 0, equals: sameList });
    hook.rerender({ committed: ["A"], onCommit: commit });
    expect(write).not.toHaveBeenCalled();
    hook.rerender({ committed: ["B"], onCommit: commit });
    expect(write).toHaveBeenCalledWith(["B"]);
  });

  it("does not queue a write equal to the URL value, so it cannot hide a later change", () => {
    const { commit, write, hook } = setup("a", { delayMs: 0 });
    act(() => hook.result.current.onChange("a"));
    expect(commit).toHaveBeenCalledWith("a");
    hook.rerender({ committed: "b", onCommit: commit });
    hook.rerender({ committed: "a", onCommit: commit });
    expect(write.mock.calls).toEqual([["b"], ["a"]]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/lib/useUrlFieldSync.test.ts`
Expected: FAIL — `Failed to resolve import "./useUrlFieldSync"`.

- [ ] **Step 3: Implement**

`src/lib/useUrlFieldSync.ts`:

```ts
import { useCallback, useEffect, useRef } from "react";

export interface UrlFieldSync<TValue> {
  /** Call from the field's onChange listener: schedules (or makes) the URL write. */
  onChange: (value: TValue) => void;
  /** Drops a pending write and puts the field back to the URL's value. */
  cancel: () => void;
}

interface UrlFieldSyncOptions<TValue> {
  /** The URL's current value for this field. */
  committed: TValue;
  /** Writes a value to the URL. */
  commit: (value: TValue) => void;
  /** Puts a value into the field WITHOUT running its listeners. */
  write: (value: TValue) => void;
  /** The quiet period before a write; 0 writes at once (checkboxes, selects). */
  delayMs?: number;
  /** How two values compare; pass one for arrays. */
  equals?: (a: TValue, b: TValue) => boolean;
}

/**
 * Keeps one filter field and its URL search value in step (D50, D82).
 *
 * The router commits search changes in a React transition after an async load,
 * so a field bound straight to the URL is reverted mid-typing. The form field
 * holds the draft; this hook writes it to the URL — after `delayMs` of quiet for
 * typed text, at once for a checkbox — and carries changes made elsewhere (Back,
 * a nav link, Clear, a dashboard card) back into the field.
 *
 * Telling the two apart: every value written is queued until its echo arrives.
 * A URL value matching a queued write is our own echo — it and every write
 * queued before it are dropped, and the field is left alone, so an echo cannot
 * overwrite newer input. Any other URL value came from elsewhere: it replaces
 * the field and drops any pending write. A queue rather than one "last written"
 * value, because two quick checkbox clicks put two writes in flight.
 */
export function useUrlFieldSync<TValue>({
  committed,
  commit,
  write,
  delayMs = 300,
  equals = Object.is,
}: UrlFieldSyncOptions<TValue>): UrlFieldSync<TValue> {
  const latest = useRef({ committed, commit, write, delayMs, equals });
  const previous = useRef(committed);
  const unechoed = useRef<TValue[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = { committed, commit, write, delayMs, equals };
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    const { equals: same, write: toField } = latest.current;
    if (same(committed, previous.current)) return;
    previous.current = committed;
    const echo = unechoed.current.findIndex((value) => same(value, committed));
    if (echo !== -1) {
      unechoed.current = unechoed.current.slice(echo + 1);
      return;
    }
    unechoed.current = [];
    clearTimer();
    toField(committed);
  }, [committed, clearTimer]);

  // A late write after unmount would navigate back to a list the user left.
  useEffect(() => clearTimer, [clearTimer]);

  const send = useCallback((value: TValue) => {
    const { committed: current, commit: toUrl, equals: same } = latest.current;
    // An equal write leaves the URL as it is, so no echo would ever remove it.
    if (!same(value, current)) unechoed.current.push(value);
    toUrl(value);
  }, []);

  const onChange = useCallback(
    (value: TValue) => {
      clearTimer();
      const delay = latest.current.delayMs;
      if (delay <= 0) {
        send(value);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        send(value);
      }, delay);
    },
    [clearTimer, send],
  );

  const cancel = useCallback(() => {
    clearTimer();
    unechoed.current = [];
    latest.current.write(latest.current.committed);
  }, [clearTimer]);

  return { onChange, cancel };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- src/lib/useUrlFieldSync.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/lib/useUrlFieldSync.ts src/lib/useUrlFieldSync.test.ts
git commit -m "feat: add useUrlFieldSync, the form-field successor of useSearchParamDraft (D82)"
```

---

### Task 14: TaskFilters on the app form (D82)

**Files:**
- Modify: `src/features/tasks/components/TaskFilters.tsx`

- [ ] **Step 1: Rewrite TaskFilters**

Replace `src/features/tasks/components/TaskFilters.tsx` entirely:

```tsx
import { useSelector } from "@tanstack/react-form";
import { useId, useState } from "react";

import { Button } from "../../../components/Button";
import { useAppForm } from "../../../components/form/app-form";
import { useUrlFieldSync } from "../../../lib/useUrlFieldSync";
import { TASK_STATUSES, type TaskFilters as Filters, type TaskStatus } from "../types";
import { STATUS_LABEL } from "./StatusBadge";

/** What this panel edits. Paging and ordering belong to the list. */
export type FilterPatch = Partial<
  Pick<Filters, "status" | "due_date_after" | "due_date_before" | "overdue">
>;

interface TaskFiltersProps {
  filters: Filters;
  /** A patch, not a snapshot: a date commits up to 300 ms later (D46). */
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}

/** The panel's fields, shaped for its inputs. Dates are "yyyy-mm-dd" or "". */
type FilterDraft = {
  status: TaskStatus[];
  due_date_after: string;
  due_date_before: string;
  overdue: boolean;
};

const STATUS_OPTIONS = TASK_STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] }));
const NO_STATUSES: TaskStatus[] = [];

/** "" clears the bound; otherwise the day at `time`, in UTC, as before. */
function toBound(day: string, time: string): string | undefined {
  return day === "" ? undefined : new Date(`${day}T${time}Z`).toISOString();
}

function sameStatuses(a: TaskStatus[], b: TaskStatus[]): boolean {
  return a.length === b.length && a.every((status, index) => status === b[index]);
}

export function TaskFilters({ filters, onChange, onClear }: TaskFiltersProps) {
  const committed: FilterDraft = {
    status: filters.status ?? NO_STATUSES,
    due_date_after: filters.due_date_after?.slice(0, 10) ?? "",
    due_date_before: filters.due_date_before?.slice(0, 10) ?? "",
    overdue: filters.overdue === true,
  };
  // D81: the URL as it was on mount. After that, useUrlFieldSync carries every
  // URL change into the fields — one path, not two.
  const [defaults] = useState(() => committed);
  const form = useAppForm({ defaultValues: defaults });

  const status = useUrlFieldSync({
    committed: committed.status,
    commit: (next: TaskStatus[]) => onChange({ status: next.length === 0 ? undefined : next }),
    write: (value) => form.setFieldValue("status", value, { dontRunListeners: true }),
    delayMs: 0,
    equals: sameStatuses,
  });
  // Dates go through a 300 ms quiet period: a date typed digit by digit would
  // otherwise be reverted mid-entry by the router's transition (D50).
  const after = useUrlFieldSync({
    committed: committed.due_date_after,
    commit: (day: string) => onChange({ due_date_after: toBound(day, "00:00:00") }),
    write: (value) => form.setFieldValue("due_date_after", value, { dontRunListeners: true }),
  });
  const before = useUrlFieldSync({
    committed: committed.due_date_before,
    commit: (day: string) => onChange({ due_date_before: toBound(day, "23:59:59") }),
    write: (value) => form.setFieldValue("due_date_before", value, { dontRunListeners: true }),
  });
  const overdue = useUrlFieldSync({
    committed: committed.overdue,
    commit: (on: boolean) => onChange({ overdue: on ? true : undefined }),
    write: (value) => form.setFieldValue("overdue", value, { dontRunListeners: true }),
    delayMs: 0,
  });

  const afterDay = useSelector(form.store, (state) => state.values.due_date_after);
  const beforeDay = useSelector(form.store, (state) => state.values.due_date_before);
  // D78: explained, not prevented — the URL keeps what was entered (D45). ISO
  // days compare correctly as strings.
  const inverted = afterDay !== "" && beforeDay !== "" && afterDay > beforeDay;
  const rangeErrorId = useId();

  function clear() {
    // A pending date commit would otherwise land after the clear and bring the
    // date back.
    status.cancel();
    after.cancel();
    before.cancel();
    overdue.cancel();
    onClear();
  }

  return (
    <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <form.AppField name="status" listeners={{ onChange: ({ value }) => status.onChange(value) }}>
        {(field) => <field.CheckboxGroupField legend="Status" options={STATUS_OPTIONS} />}
      </form.AppField>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form.AppField
          name="due_date_after"
          listeners={{ onChange: ({ value }) => after.onChange(value) }}
        >
          {(field) => (
            <field.TextField
              id="due-after"
              label="Due after"
              type="date"
              density="compact"
              max={beforeDay || undefined}
              aria-describedby={inverted ? rangeErrorId : undefined}
            />
          )}
        </form.AppField>
        <form.AppField
          name="due_date_before"
          listeners={{ onChange: ({ value }) => before.onChange(value) }}
        >
          {(field) => (
            <field.TextField
              id="due-before"
              label="Due before"
              type="date"
              density="compact"
              min={afterDay || undefined}
              aria-invalid={inverted || undefined}
              aria-describedby={inverted ? rangeErrorId : undefined}
            />
          )}
        </form.AppField>
        <form.AppField name="overdue" listeners={{ onChange: ({ value }) => overdue.onChange(value) }}>
          {(field) => <field.CheckboxField label="Overdue only" density="compact" />}
        </form.AppField>
        <Button variant="secondary" onClick={clear} className="sm:ml-auto">
          Clear filters
        </Button>
      </div>
      {/* Always mounted: a live region is announced reliably only if it exists
          before its text changes. Not role="alert" (focus lookups use it). */}
      <p
        id={rangeErrorId}
        aria-live="polite"
        className={inverted ? "mt-2 text-sm text-status-overdue" : undefined}
      >
        {inverted ? (
          <>
            &ldquo;Due after&rdquo; is later than &ldquo;Due before&rdquo;, so no task can match.
          </>
        ) : null}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Run the list and dashboard tests**

Run: `npm test -- src/features/tasks/TaskListPage.test.tsx src/features/dashboard`
Expected: PASS — in particular "sends status as repeated query parameters for a multi-select", "sends overdue=true when the overdue filter is on", "resets to page 1 when a filter changes", "writes a filter to the URL in place, and goes back to page 1", "clears filters and ordering but keeps the page size", "commits a typed date once, after the typing stops", "does not bring a date back when Clear filters beats its commit", all four D78 range tests, and the dashboard drill-through tests (filters pre-checked from the URL).

- [ ] **Step 3: Gates, then commit**

```bash
git add src/features/tasks/components/TaskFilters.tsx
git commit -m "refactor: build the task filters on the app form, synced to the URL (D82)"
```

---

### Task 15: UserFilters on the app form, and `useSearchParamDraft` retired (D82)

**Files:**
- Create: `src/features/users/components/UserFilters.tsx`
- Modify: `src/features/users/UserListPage.tsx`, `src/lib/useDebouncedValue.ts:7-8`
- Delete: `src/lib/useSearchParamDraft.ts`, `src/lib/useSearchParamDraft.test.ts`

- [ ] **Step 1: Extract the filter panel**

`src/features/users/components/UserFilters.tsx`:

```tsx
import { useState } from "react";

import type { UserListSearch } from "../../../app/search-params";
import { useAppForm } from "../../../components/form/app-form";
import type { SelectOption } from "../../../components/form/fields/SelectField";
import { useUrlFieldSync } from "../../../lib/useUrlFieldSync";
import { ROLE_LABEL, ROLES, type Role } from "../../auth/types";

/** What this panel edits. Paging belongs to the list. */
export type UserFilterPatch = Partial<Pick<UserListSearch, "role" | "is_active" | "search">>;

/** The panel's fields, shaped for its inputs: "" is "All roles". */
type UserFilterDraft = { search: string; role: Role | ""; inactiveOnly: boolean };

const ROLE_OPTIONS: readonly SelectOption<Role | "">[] = [
  { value: "", label: "All roles" },
  ...ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
];

interface UserFiltersProps {
  filters: Pick<UserListSearch, "role" | "is_active" | "search">;
  /** A patch, not a snapshot: typed text commits up to 300 ms later (D46). */
  onChange: (patch: UserFilterPatch) => void;
}

export function UserFilters({ filters, onChange }: UserFiltersProps) {
  const committed: UserFilterDraft = {
    search: filters.search ?? "",
    role: filters.role ?? "",
    inactiveOnly: filters.is_active === false,
  };
  // D81: the URL as it was on mount. After that, useUrlFieldSync carries every
  // URL change into the fields.
  const [defaults] = useState(() => committed);
  const form = useAppForm({ defaultValues: defaults });

  // Typed text goes through a draft: the router's transition would revert a
  // controlled input bound straight to the URL (D50).
  const search = useUrlFieldSync({
    committed: committed.search,
    commit: (value: string) => onChange({ search: value === "" ? undefined : value }),
    write: (value) => form.setFieldValue("search", value, { dontRunListeners: true }),
  });
  const role = useUrlFieldSync({
    committed: committed.role,
    commit: (value: Role | "") => onChange({ role: value === "" ? undefined : value }),
    write: (value) => form.setFieldValue("role", value, { dontRunListeners: true }),
    delayMs: 0,
  });
  const inactiveOnly = useUrlFieldSync({
    committed: committed.inactiveOnly,
    commit: (on: boolean) => onChange({ is_active: on ? false : undefined }),
    write: (value) => form.setFieldValue("inactiveOnly", value, { dontRunListeners: true }),
    delayMs: 0,
  });

  return (
    <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form.AppField name="search" listeners={{ onChange: ({ value }) => search.onChange(value) }}>
          {(field) => <field.TextField id="search" label="Search" type="search" density="compact" />}
        </form.AppField>
        <form.AppField name="role" listeners={{ onChange: ({ value }) => role.onChange(value) }}>
          {(field) => (
            <field.SelectField id="role-filter" label="Role" options={ROLE_OPTIONS} density="compact" />
          )}
        </form.AppField>
        <form.AppField
          name="inactiveOnly"
          listeners={{ onChange: ({ value }) => inactiveOnly.onChange(value) }}
        >
          {(field) => <field.CheckboxField label="Inactive only" density="compact" />}
        </form.AppField>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: The page uses it**

Replace `src/features/users/UserListPage.tsx` entirely:

```tsx
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect } from "react";

import type { UserListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { Pagination } from "../../components/Pagination";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../lib/pagination";
import { DeleteUserDialog } from "./components/DeleteUserDialog";
import { UserCard } from "./components/UserCard";
import { UserFilters, type UserFilterPatch } from "./components/UserFilters";
import { UserTable } from "./components/UserTable";
import { useDeleteUser, useUsers } from "./hooks/useUsers";
import type { UserFilters as Filters } from "./types";
import { UserListProvider } from "./user-list-context";
import { initialUserListState, userListActions } from "./user-list-store";

type SearchUpdate = (prev: UserListSearch) => UserListSearch;

export function UserListPage() {
  // The URL is the list's only state (D45). Annotated because the router is
  // not type-registered, so useSearch returns any.
  const search: UserListSearch = useSearch({ from: "/shell/users" });
  // A path, not the route id useSearch takes: given the id, navigate warns.
  const navigate = useNavigate({ from: "/users" });
  const page = search.page ?? 1;
  const pageSize: PageSize = search.page_size ?? DEFAULT_PAGE_SIZE;
  const filters: Filters = {
    role: search.role,
    is_active: search.is_active,
    search: search.search,
    page,
    page_size: pageSize,
  };
  // The page's UI state (D87): one store per mount, so it starts clean on every visit.
  const store = useCreateStore(initialUserListState, userListActions);
  const pendingDelete = useSelector(store, (state) => state.delete.pending);
  const deleteError = useSelector(store, (state) => state.delete.error);

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

  async function confirmDelete() {
    const target = store.state.delete.pending;
    if (target === null) return;
    store.actions.clearDeleteError();
    try {
      await remove.mutateAsync(target.id);
      store.actions.cancelDelete();
    } catch (caught) {
      store.actions.failDelete(
        caught instanceof ApiError ? caught.message : "Could not deactivate that user.",
      );
    }
  }

  return (
    <UserListProvider value={{ store }}>
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <ButtonLink to="/users/new" className="ml-auto">
            New user
          </ButtonLink>
        </div>

        <UserFilters filters={search} onChange={applyFilters} />

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
              <UserTable users={data.results} />
            </div>
            <div className="md:hidden">
              {data.results.map((user) => (
                <UserCard key={user.id} user={user} />
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
            onCancel={store.actions.cancelDelete}
          />
        )}
      </section>
    </UserListProvider>
  );
}
```

- [ ] **Step 3: Retire the old draft hook**

Run: `git grep -n "useSearchParamDraft" -- src`
Expected: only `src/lib/useSearchParamDraft.ts`, its test, and the comment in `src/lib/useDebouncedValue.ts`.

Run: `git rm src/lib/useSearchParamDraft.ts src/lib/useSearchParamDraft.test.ts`

In `src/lib/useDebouncedValue.ts`, replace the comment lines
`For a value that only lives in component state. A value mirrored into the`
`URL needs useSearchParamDraft instead, which also handles outside changes.`
with
`For a value that only lives in component state. A form field mirrored into`
`the URL needs useUrlFieldSync instead, which also handles outside changes.`

- [ ] **Step 4: Run the user list tests**

Run: `npm test -- src/features/users/UserListPage.test.tsx`
Expected: PASS — in particular "filters by role and by inactive, and searches", "reads its filters, search and page size from the URL", "keeps a numeric search as text", "drops a role it does not know", "sends one request per pause in typing, not one per keystroke", "empties the search box when navigation clears a committed search".

- [ ] **Step 5: Gates, then commit**

Expected test files: the old draft-hook test is gone and `useUrlFieldSync.test.ts` replaces it.

```bash
git add -A src/features/users src/lib
git commit -m "refactor: build the user filters on the app form and retire useSearchParamDraft (D82)"
```

---

# Phase 4 — Tables

### Task 16: Ordering ↔ sorting mappers (D84)

**Files:**
- Modify: `src/features/tasks/sorting.ts`
- Test: `src/features/tasks/sorting.test.ts`

`nextOrdering` stays until Task 20, when the last caller (`TaskTable`) goes.

- [ ] **Step 1: Write the failing tests**

In `src/features/tasks/sorting.test.ts`, change the `./sorting` import to:

```ts
import {
  DEFAULT_ORDERING,
  SORT_FIELDS,
  SORT_LABEL,
  SORT_OPTIONS,
  isOrdering,
  nextOrdering,
  orderingToSorting,
  parseOrdering,
  sortingToOrdering,
} from "./sorting";
```

and append:

```ts
describe("orderingToSorting", () => {
  it("shows no ordering as the default, newest first, as an active sort (D48)", () => {
    expect(orderingToSorting(undefined)).toEqual([{ id: "created_at", desc: true }]);
  });

  it.each([
    ["due_date", "due_date", false],
    ["-due_date", "due_date", true],
    ["status", "status", false],
    ["-status", "status", true],
    ["created_at", "created_at", false],
  ])("reads %s", (ordering, id, desc) => {
    expect(orderingToSorting(ordering)).toEqual([{ id, desc }]);
  });

  it("treats an unknown ordering as the default", () => {
    expect(orderingToSorting("title")).toEqual([{ id: "created_at", desc: true }]);
  });
});

describe("sortingToOrdering", () => {
  it.each(["due_date", "-due_date", "status", "-status", "created_at"])("round-trips %s", (ordering) => {
    expect(sortingToOrdering(orderingToSorting(ordering))).toBe(ordering);
  });

  it("writes no ordering for the default, so the URL stays canonical (D48)", () => {
    expect(sortingToOrdering([{ id: "created_at", desc: true }])).toBeUndefined();
  });

  it("writes no ordering for an empty or unknown sort", () => {
    expect(sortingToOrdering([])).toBeUndefined();
    expect(sortingToOrdering([{ id: "title", desc: false }])).toBeUndefined();
  });
});

describe("SORT_LABEL", () => {
  it("labels every sortable field from the one sort model (D67)", () => {
    expect(SORT_LABEL).toEqual({ due_date: "Due date", status: "Status", created_at: "Created" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- src/features/tasks/sorting.test.ts`
Expected: FAIL — `orderingToSorting is not a function` (or the import is missing).

- [ ] **Step 3: Implement**

In `src/features/tasks/sorting.ts`, add as the first line:

```ts
import type { SortingState } from "@tanstack/react-table";
```

and append to the end of the file:

```ts
/** Each sortable column's header label, from the same list (D67). */
export const SORT_LABEL = Object.fromEntries(
  SORT_FIELDS.map(({ field, label }) => [field, label]),
) as Record<SortField, string>;

/**
 * The table's sort state for an ordering (D84). None, or anything unknown, is
 * shown as the default, as an active sort (D48).
 */
export function orderingToSorting(ordering: string | undefined): SortingState {
  const { field, direction } = parseOrdering(ordering);
  return [{ id: field, desc: direction === "descending" }];
}

/**
 * The ordering for the table's sort state (D84). Undefined for the default, so
 * the URL stays canonical (D48), and for anything the API does not accept.
 */
export function sortingToOrdering(sorting: SortingState): Ordering | undefined {
  const [first] = sorting;
  if (first === undefined) return undefined;
  const ordering = first.desc ? `-${first.id}` : first.id;
  return isOrdering(ordering) && ordering !== DEFAULT_ORDERING ? ordering : undefined;
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- src/features/tasks/sorting.test.ts`
Expected: PASS — the existing cases and 15 new ones.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/features/tasks/sorting.ts src/features/tasks/sorting.test.ts
git commit -m "feat: map the URL ordering to and from the table's sort state (D84)"
```

---

### Task 17: `routePaginationChange` (D85)

**Files:**
- Modify: `src/lib/pagination.ts`
- Test: `src/lib/pagination.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/pagination.test.ts`, change the imports to:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  isPageSize,
  pageWindow,
  routePaginationChange,
} from "./pagination";
```

and append:

```ts
describe("routePaginationChange (D85)", () => {
  const current = { pageIndex: 4, pageSize: 20 };

  function route(next: { pageIndex: number; pageSize: number }) {
    const to = { goToPage: vi.fn(), setPageSize: vi.fn() };
    routePaginationChange(next, current, to);
    return to;
  }

  it("turns a size change into setPageSize, ignoring the page index Table proposes", () => {
    const to = route({ pageIndex: 1, pageSize: 50 });
    expect(to.setPageSize).toHaveBeenCalledWith(50);
    expect(to.goToPage).not.toHaveBeenCalled();
  });

  it("turns a page move into goToPage, numbered from 1", () => {
    const to = route({ pageIndex: 5, pageSize: 20 });
    expect(to.goToPage).toHaveBeenCalledWith(6);
    expect(to.setPageSize).not.toHaveBeenCalled();
  });

  it("does nothing when nothing changed", () => {
    const to = route(current);
    expect(to.goToPage).not.toHaveBeenCalled();
    expect(to.setPageSize).not.toHaveBeenCalled();
  });

  it("ignores a page size the API does not offer", () => {
    const to = route({ pageIndex: 0, pageSize: 37 });
    expect(to.setPageSize).not.toHaveBeenCalled();
    expect(to.goToPage).not.toHaveBeenCalled();
  });

  it("accepts the updater-function form Table passes", () => {
    const to = { goToPage: vi.fn(), setPageSize: vi.fn() };
    routePaginationChange((old) => ({ ...old, pageIndex: 0 }), current, to);
    expect(to.goToPage).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- src/lib/pagination.test.ts`
Expected: FAIL — `routePaginationChange is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/pagination.ts`, add as the first line:

```ts
import { functionalUpdate, type PaginationState, type Updater } from "@tanstack/react-table";
```

and append:

```ts
/**
 * Turns the table's proposed pagination into a navigation (D85). A page-size
 * change replaces history and returns to page 1 (D47): the page index Table
 * computes to keep the top row in view is ignored. A page move pushes, so Back
 * returns to the previous page.
 */
export function routePaginationChange(
  updater: Updater<PaginationState>,
  current: PaginationState,
  to: { goToPage: (page: number) => void; setPageSize: (size: PageSize) => void },
): void {
  const next = functionalUpdate(updater, current);
  if (next.pageSize !== current.pageSize) {
    if (isPageSize(next.pageSize)) to.setPageSize(next.pageSize);
    return;
  }
  if (next.pageIndex !== current.pageIndex) to.goToPage(next.pageIndex + 1);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npm test -- src/lib/pagination.test.ts`
Expected: PASS — the existing cases and 5 new ones.

- [ ] **Step 5: Gates, then commit**

```bash
git add src/lib/pagination.ts src/lib/pagination.test.ts
git commit -m "feat: route the table's pagination changes to push or replace navigations (D85)"
```

---

### Task 18: The app table: features, contexts, TableView, SortHeader, Pagination (D83, D85)

**Files:**
- Create: `src/components/table/table-features.ts`, `src/components/table/table-contexts.ts`, `src/components/table/SortHeader.tsx`, `src/components/table/TableView.tsx`, `src/components/table/Pagination.tsx`, `src/components/table/app-table.ts`
- Test: `src/components/table/Pagination.test.tsx`

The old `src/components/Pagination.tsx` and its test stay until Task 20; both lists still use it until they move.

- [ ] **Step 1: Write the failing test**

`src/components/table/Pagination.test.tsx` — the same assertions as `src/components/Pagination.test.tsx`, through a table:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { routePaginationChange, type PageSize } from "../../lib/pagination";
import { useAppTable } from "./app-table";

const NO_ROWS: { id: string }[] = [];

interface HarnessProps {
  count: number;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

/** A table with no columns: only its pagination model, wired as the lists wire it. */
function Harness({ count, page, pageSize, onPageChange, onPageSizeChange }: HarnessProps) {
  const pagination = { pageIndex: page - 1, pageSize };
  const table = useAppTable({
    columns: [],
    data: NO_ROWS,
    rowCount: count,
    state: { pagination },
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, {
        goToPage: onPageChange,
        setPageSize: onPageSizeChange,
      }),
  });
  return (
    <table.AppTable>
      <table.Pagination />
    </table.AppTable>
  );
}

/** 187 rows at 20 a page is ten pages; page 5 shows rows 81–100. */
function renderPager(props: Partial<Pick<HarnessProps, "count" | "page" | "pageSize">> = {}) {
  const onPageChange = vi.fn();
  const onPageSizeChange = vi.fn();
  render(
    <Harness
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

describe("Pagination (through the table)", () => {
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

  it("offers exactly the page sizes the API allows, and a change goes back to page 1", async () => {
    const { onPageChange, onPageSizeChange } = renderPager();
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
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("states the range, and the page count that replaces the numbers below sm", () => {
    renderPager();
    expect(screen.getByText("81–100 of 187")).toBeInTheDocument();
    expect(screen.getByText("Page 5 of 10")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- src/components/table/Pagination.test.tsx`
Expected: FAIL — `Failed to resolve import "./app-table"`.

- [ ] **Step 3: Features and contexts**

`src/components/table/table-features.ts`:

```ts
import {
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Every table's features (D83). No row models: the server sorts and pages, so
 * the table only keeps the state and the column APIs.
 */
export const appTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  /** Type-only: what a column may carry in `meta`. */
  columnMeta: {} as { cellClassName?: string },
});

export type AppTableFeatures = typeof appTableFeatures;
```

`src/components/table/table-contexts.ts`:

```ts
import { createTableHookContexts } from "@tanstack/react-table";

import type { AppTableFeatures } from "./table-features";

/**
 * The table contexts (D83). A module of its own: TableView and Pagination
 * import their hook from here, never from app-table.ts, which imports them —
 * Table's docs warn that such a cycle breaks Vite HMR.
 */
export const { tableContext, cellContext, headerContext, useTableContext } =
  createTableHookContexts<AppTableFeatures>();
```

- [ ] **Step 4: SortHeader and TableView**

`src/components/table/SortHeader.tsx`:

```tsx
import clsx from "clsx";

/** The two column methods a sort button needs; every sortable column has them. */
export interface SortableColumn {
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => undefined | ((event: unknown) => void);
}

/**
 * A sortable column's header button (D68): the plain label as its accessible
 * name, a ▲/▼ glyph and stronger weight on the active column, a faint ↕ on the
 * others. The state itself is announced by the <th>'s aria-sort (TableView).
 */
export function SortHeader({ column, label }: { column: SortableColumn; label: string }) {
  const sorted = column.getIsSorted();
  const active = sorted !== false;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={clsx(
        "inline-flex items-center gap-1 underline-offset-2 hover:underline",
        active ? "font-semibold text-slate-900" : "font-medium text-slate-700",
      )}
    >
      {label}
      <span aria-hidden="true" className={active ? undefined : "text-slate-300"}>
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
      </span>
    </button>
  );
}
```

`src/components/table/TableView.tsx`:

```tsx
import { useTableContext } from "./table-contexts";

function ariaSort(sorted: false | "asc" | "desc") {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

/** The app's table markup (D83): the header groups and rows of the table in context. */
export function TableView() {
  const table = useTableContext();
  return (
    <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id} className="border-b border-slate-200">
            {group.headers.map((header) => (
              <th
                key={header.id}
                scope="col"
                // D68: only a sortable column announces a sort state.
                aria-sort={header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined}
                className="p-3 font-medium text-slate-700"
              >
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b border-slate-100">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className={cell.column.columnDef.meta?.cellClassName ?? "p-3"}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Pagination on the table**

`src/components/table/Pagination.tsx`:

```tsx
import { useId } from "react";

import { PAGE_SIZES, pageWindow } from "../../lib/pagination";
import { Button } from "../Button";
import { useTableContext } from "./table-contexts";

/**
 * The pager, reading the table's pagination model (D85). Numbered pages need
 * the row count, which the API's `count` gives (D52). Every move goes through
 * the table, whose onPaginationChange decides push or replace (D47).
 */
export function Pagination() {
  const table = useTableContext();
  const sizeId = useId();
  const { pageIndex, pageSize } = table.state.pagination;
  const count = table.getRowCount();
  const totalPages = Math.max(1, table.getPageCount());
  const current = Math.min(Math.max(pageIndex + 1, 1), totalPages);
  const first = count === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, count);
  const atStart = !table.getCanPreviousPage();
  const atEnd = !table.getCanNextPage();

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={atStart}
          onClick={() => table.firstPage()}
          aria-label="First page"
        >
          « <span className="hidden sm:inline">First</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={atStart}
          onClick={() => table.previousPage()}
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
                    if (item !== current) table.setPageIndex(item - 1);
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
          onClick={() => table.nextPage()}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span> ›
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={atEnd}
          onClick={() => table.lastPage()}
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
          onChange={(event) => table.setPageSize(Number(event.target.value))}
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

- [ ] **Step 6: The hook**

`src/components/table/app-table.ts`:

```ts
import { createTableHook } from "@tanstack/react-table";

import { Pagination } from "./Pagination";
import { TableView } from "./TableView";
import { cellContext, headerContext, tableContext } from "./table-contexts";
import { appTableFeatures } from "./table-features";

/**
 * Every table's shared setup (D83, D84). The server sorts and pages; one sort at
 * a time, and a click on the active column flips it rather than removing it;
 * rows are keyed by id. A table owns no state: each page passes `state` from the
 * URL and writes changes back with `navigate`.
 */
export const { useAppTable, createAppColumnHelper } = createTableHook({
  features: appTableFeatures,
  getRowId: (row: { id: string }) => row.id,
  manualSorting: true,
  manualPagination: true,
  autoResetPageIndex: false,
  enableMultiSort: false,
  enableSortingRemoval: false,
  sortDescFirst: false,
  tableContext,
  cellContext,
  headerContext,
  tableComponents: { TableView, Pagination },
});
```

- [ ] **Step 7: Run it to see it pass**

Run: `npm test -- src/components/table`
Expected: PASS, 9 tests.

- [ ] **Step 8: Gates, then commit**

```bash
git add src/components/table
git commit -m "feat: add the app table: TableView, SortHeader and a pager on the table model (D83, D85)"
```

---

### Task 19: The user list on the app table (D83)

**Files:**
- Create: `src/features/users/user-columns.tsx`
- Modify: `src/features/users/UserListPage.tsx`
- Delete: `src/features/users/components/UserTable.tsx`

- [ ] **Step 1: The columns**

`src/features/users/user-columns.tsx`:

```tsx
import { createAppColumnHelper } from "../../components/table/app-table";
import { ROLE_LABEL } from "../auth/types";
import { UserRowActions } from "./components/UserRowActions";
import type { UserDetail } from "./types";

const columnHelper = createAppColumnHelper<UserDetail>();
const MUTED = { cellClassName: "p-3 text-slate-600" };

/**
 * The ≥md user table's columns (D83), at module scope so the table's inputs
 * stay stable. Nothing sorts: the API offers no ordering for users.
 */
export const userColumns = columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => `${row.original.first_name} ${row.original.last_name}`,
  }),
  columnHelper.accessor("email", { header: "Email", cell: (info) => info.getValue(), meta: MUTED }),
  columnHelper.accessor("role", {
    header: "Role",
    // F13: the label, never the stored value.
    cell: (info) => ROLE_LABEL[info.getValue()],
    meta: MUTED,
  }),
  columnHelper.accessor("is_active", {
    header: "Active",
    cell: (info) => (info.getValue() ? "Yes" : "No"),
    meta: MUTED,
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <UserRowActions user={row.original} />,
  }),
]);
```

- [ ] **Step 2: The page renders the table, the cards and the pager from one table**

In `src/features/users/UserListPage.tsx`:

1. Replace `import { useEffect } from "react";` with `import { useEffect, useMemo } from "react";`.
2. Remove `import { Pagination } from "../../components/Pagination";` and `import { UserTable } from "./components/UserTable";`.
3. Add `import { useAppTable } from "../../components/table/app-table";` after the `ButtonLink` import, change the pagination import to `import { DEFAULT_PAGE_SIZE, routePaginationChange, type PageSize } from "../../lib/pagination";`, change `import type { UserFilters as Filters } from "./types";` to `import type { UserDetail, UserFilters as Filters } from "./types";`, and add `import { userColumns } from "./user-columns";` after the `user-list-context` import.
4. Below `type SearchUpdate = …;`, add:

```tsx
const NO_USERS: UserDetail[] = [];
```

5. After the `goToPage` function, add:

```tsx
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize }), [page, pageSize]);
  // The table owns no state: the URL's page and size go in, changes go back out
  // as navigations (D83, D85).
  const table = useAppTable({
    columns: userColumns,
    data: data?.results ?? NO_USERS,
    rowCount: data?.count ?? 0,
    enableSorting: false,
    state: { pagination },
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, { goToPage, setPageSize }),
  });
```

6. Replace the inside of the results `<div aria-busy=…>` (the table div, the cards div and `<Pagination …/>`) with:

```tsx
            <table.AppTable>
              {/* The table collapses to stacked cards below md (spec §5.2). */}
              <div className="hidden overflow-x-auto md:block">
                <table.TableView />
              </div>
              <div className="md:hidden">
                {table.getRowModel().rows.map((row) => (
                  <UserCard key={row.id} user={row.original} />
                ))}
              </div>
              <table.Pagination />
            </table.AppTable>
```

7. `git rm src/features/users/components/UserTable.tsx`

- [ ] **Step 3: Run the user list tests**

Run: `npm test -- src/features/users/UserListPage.test.tsx`
Expected: PASS — including "shows roles by their label, never the stored value (F13)", "renders a card per user for narrow viewports", "never offers the signed-in Admin a Deactivate for their own account (D66)", "lands on page 1, without an error, when the URL's page no longer exists", and the deactivate-dialog tests.

- [ ] **Step 4: Gates, then commit**

```bash
git add -A src/features/users
git commit -m "refactor: render the user list from the app table (D83)"
```

---

### Task 20: The task list on the app table, and the old pieces removed (D83, D84)

**Files:**
- Create: `src/features/tasks/components/TaskTitleLink.tsx`, `src/features/tasks/task-columns.tsx`
- Modify: `src/features/tasks/TaskListPage.tsx`, `src/features/tasks/components/TaskCard.tsx`, `src/features/tasks/sorting.ts`, `src/features/tasks/sorting.test.ts`
- Delete: `src/features/tasks/components/TaskTable.tsx`, `src/components/Pagination.tsx`, `src/components/Pagination.test.tsx`

- [ ] **Step 1: The title link reads the list search itself**

`src/features/tasks/components/TaskTitleLink.tsx`:

```tsx
import { Link, useSearch } from "@tanstack/react-router";

import type { TaskListSearch } from "../../../app/search-params";
import type { TaskListItem } from "../types";

/**
 * A task's title, linking to its detail. It leaves the list's search in history
 * state, so the detail can return to the same filtered, paged, sorted list (D70).
 */
export function TaskTitleLink({ task, className }: { task: TaskListItem; className: string }) {
  // Annotated because the router is not type-registered, so useSearch returns any.
  const listSearch: TaskListSearch = useSearch({ from: "/shell/tasks" });
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      state={{ tasksSearch: listSearch }}
      className={className}
    >
      {task.title}
    </Link>
  );
}
```

Replace `src/features/tasks/components/TaskCard.tsx` entirely:

```tsx
import { formatDueDate } from "../../../lib/dates";
import type { TaskListItem } from "../types";
import { OverdueBadge, StatusBadge } from "./StatusBadge";
import { TaskRowActions } from "./TaskRowActions";
import { TaskTitleLink } from "./TaskTitleLink";

interface TaskCardProps {
  task: TaskListItem;
  showAssignee: boolean;
}

/**
 * The below-`lg` presentation (D69) of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader (spec §11.6).
 */
export function TaskCard({ task, showAssignee }: TaskCardProps) {
  return (
    <article className="mb-3 rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-medium">
        <TaskTitleLink task={task} className="text-status-progress" />
        {task.is_overdue && <OverdueBadge />}
      </h3>
      <dl className="mb-3 grid grid-cols-2 gap-1 text-sm text-slate-600">
        <dt className="font-medium">Status</dt>
        <dd>
          <StatusBadge status={task.status} />
        </dd>
        <dt className="font-medium">Due</dt>
        <dd>{task.due_date === null ? "—" : formatDueDate(task.due_date)}</dd>
        {showAssignee && (
          <>
            <dt className="font-medium">Assignee</dt>
            <dd>
              {task.assignee === null
                ? "Unassigned"
                : `${task.assignee.first_name} ${task.assignee.last_name}`}
            </dd>
          </>
        )}
      </dl>
      <TaskRowActions task={task} />
    </article>
  );
}
```

- [ ] **Step 2: The columns**

`src/features/tasks/task-columns.tsx`:

```tsx
import { createAppColumnHelper } from "../../components/table/app-table";
import { SortHeader } from "../../components/table/SortHeader";
import { formatDueDate } from "../../lib/dates";
import { OverdueBadge, StatusBadge } from "./components/StatusBadge";
import { TaskRowActions } from "./components/TaskRowActions";
import { TaskTitleLink } from "./components/TaskTitleLink";
import { SORT_LABEL } from "./sorting";
import type { TaskListItem } from "./types";

const columnHelper = createAppColumnHelper<TaskListItem>();
const MUTED = { cellClassName: "p-3 text-slate-600" };

/**
 * The ≥lg task table's columns (D83, D84), at module scope so the table's inputs
 * stay stable. The sortable columns' ids are the API's ordering fields, so a
 * column's sort maps straight to `ordering`. An accessor column sorts unless it
 * opts out, so Title and Assignee set enableSorting: false — otherwise they
 * would announce aria-sort="none" (D68).
 */
export const taskColumns = columnHelper.columns([
  columnHelper.accessor("title", {
    header: "Title",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <TaskTitleLink
          task={row.original}
          className="text-status-progress underline-offset-2 hover:underline"
        />
        {row.original.is_overdue && <OverdueBadge />}
      </>
    ),
  }),
  columnHelper.accessor("due_date", {
    header: ({ column }) => <SortHeader column={column} label={SORT_LABEL.due_date} />,
    cell: (info) => {
      const due = info.getValue();
      return due === null ? "—" : formatDueDate(due);
    },
    meta: MUTED,
  }),
  columnHelper.accessor("status", {
    header: ({ column }) => <SortHeader column={column} label={SORT_LABEL.status} />,
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("created_at", {
    header: ({ column }) => <SortHeader column={column} label={SORT_LABEL.created_at} />,
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
    meta: MUTED,
  }),
  columnHelper.accessor("assignee", {
    header: "Assignee",
    enableSorting: false,
    cell: (info) => {
      const assignee = info.getValue();
      return assignee === null ? "Unassigned" : `${assignee.first_name} ${assignee.last_name}`;
    },
    meta: MUTED,
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <TaskRowActions task={row.original} />,
  }),
]);
```

- [ ] **Step 3: The page drives the table from the URL**

Replace `src/features/tasks/TaskListPage.tsx` entirely:

```tsx
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { functionalUpdate } from "@tanstack/react-table";
import clsx from "clsx";
import { useEffect, useMemo } from "react";

import type { TaskListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { useAppTable } from "../../components/table/app-table";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, routePaginationChange, type PageSize } from "../../lib/pagination";
import { useAuth } from "../auth/hooks/useAuth";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { TaskCard } from "./components/TaskCard";
import { TaskFilters, type FilterPatch } from "./components/TaskFilters";
import { TaskSortSelect } from "./components/TaskSortSelect";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTasks } from "./hooks/useTasks";
import { orderingToSorting, sortingToOrdering, type Ordering } from "./sorting";
import { TaskActionsProvider } from "./task-actions-context";
import { initialTaskActionsState, taskActions } from "./task-actions-store";
import { taskColumns } from "./task-columns";
import type { TaskFilters as Filters, TaskListItem } from "./types";

type SearchUpdate = (prev: TaskListSearch) => TaskListSearch;

const NO_TASKS: TaskListItem[] = [];

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
    status: search.status,
    due_date_after: search.due_date_after,
    due_date_before: search.due_date_before,
    overdue: search.overdue,
    ordering: search.ordering,
    page,
    page_size: pageSize,
  };
  // An Operator's list is already scoped to themselves, so the column is noise.
  const showAssignee = user?.role === "SUPERVISOR";
  // The page's UI state (D87): one store per mount, so it starts clean on every visit.
  const store = useCreateStore(initialTaskActionsState, taskActions);
  const actions = useTaskActions(store);
  const actionError = useSelector(store, (state) => state.actionError);
  const pendingDelete = useSelector(store, (state) => state.delete.pending);
  const deleteError = useSelector(store, (state) => state.delete.error);

  const { data, isPending, isError, error, isPlaceholderData } = useTasks(filters);

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

  /** A sort change is an edit, like a filter: replace, keep scroll, page 1 (D47). */
  function setOrdering(ordering: Ordering | undefined) {
    editSearch((prev) => ({ ...prev, ordering, page: undefined }));
  }

  function goToPage(next: number) {
    void navigate({ search: (prev: TaskListSearch) => ({ ...prev, page: next }) });
  }

  const sorting = useMemo(() => orderingToSorting(search.ordering), [search.ordering]);
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize }), [page, pageSize]);
  const columnVisibility = useMemo(() => ({ assignee: showAssignee }), [showAssignee]);
  // The table owns no state: the URL's sort, page and size go in, and every
  // change goes back out as a navigation (D83–D85).
  const table = useAppTable({
    columns: taskColumns,
    data: data?.results ?? NO_TASKS,
    rowCount: data?.count ?? 0,
    state: { sorting, pagination, columnVisibility },
    onSortingChange: (updater) => setOrdering(sortingToOrdering(functionalUpdate(updater, sorting))),
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, { goToPage, setPageSize }),
  });

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

  return (
    <TaskActionsProvider value={{ store, actions }}>
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
          <ButtonLink to="/tasks/new" state={{ tasksSearch: search }} className="ml-auto">
            New task
          </ButtonLink>
        </div>

        <TaskFilters filters={filters} onChange={applyFilters} onClear={clearFilters} />
        <FormError message={actionError} />
        {/* Outside the results, so it survives an empty result (spec §4.3). */}
        <TaskSortSelect ordering={filters.ordering} onChange={setOrdering} className="lg:hidden" />

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
            <table.AppTable>
              {/* Cards below lg, not md (D69): at md the table's six columns and two
                  action buttons do not fit, so badges and actions wrapped. */}
              <div className="hidden overflow-x-auto lg:block">
                <table.TableView />
              </div>
              <div className="lg:hidden">
                {table.getRowModel().rows.map((row) => (
                  <TaskCard key={row.id} task={row.original} showAssignee={showAssignee} />
                ))}
              </div>
              <table.Pagination />
            </table.AppTable>
          </div>
        )}

        {pendingDelete !== null && (
          <DeleteTaskDialog
            task={pendingDelete}
            error={deleteError}
            isDeleting={actions.isDeleting}
            onConfirm={() => void actions.confirmDelete()}
            onCancel={actions.cancelDelete}
          />
        )}
      </section>
    </TaskActionsProvider>
  );
}
```

- [ ] **Step 4: Remove what nothing uses any more**

Run: `git rm src/features/tasks/components/TaskTable.tsx src/components/Pagination.tsx src/components/Pagination.test.tsx`

In `src/features/tasks/sorting.ts`, delete the `nextOrdering` function and its doc comment. In `src/features/tasks/sorting.test.ts`, delete the whole `describe("nextOrdering", …)` block and remove `nextOrdering` from the import. (Its four cases are covered by Table's cycle — verified for this plan — and by `TaskListPage.test.tsx`'s "sort state in the table header (F6)" tests, which click the real headers.)

Run: `git grep -n -e "nextOrdering" -e "TaskTable" -e "UserTable" -e "components/Pagination\"" -e "listSearch=" -- src`
Expected: no matches.

- [ ] **Step 5: Run the task list tests**

Run: `npm test -- src/features/tasks`
Expected: PASS — in particular the "sort state in the table header (F6)" group (Created `aria-sort="descending"` by default; a click writes `?ordering=due_date` then `-due_date`; Created clicked back to newest first leaves no `ordering`), "hides the assignee column for an Operator", "also renders a stacked card per task for narrow viewports", "adds a history entry for a page move, so Back returns to the previous page", "goes back to page 1 when the page size changes, and keeps the size in the URL", "keeps the current page on screen while the next one loads" (D53 `aria-busy`), and the whole "returning to the list (F5, D70)" group, including the card link.

- [ ] **Step 6: Gates, then commit**

Expected: lint shows the 4 baseline warnings and no new one.

```bash
git add -A src
git commit -m "refactor: render the task list from the app table; drop TaskTable, the old pager and nextOrdering (D83, D84)"
```

---

# Phase 5 — Documentation

### Task 21: Decisions, architecture and the other docs (spec §9.2)

**Files** (repository root of the worktree; `main` reorganised the docs, so the decisions no longer live in `README.md`):
- Modify: `docs/TECHNICAL-DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/GENAI-WORKFLOW.md`, `frontend/README.md`, `README.md`, `SUMMARY.md`, `docs-external/PROMPT-LOGS.md`

- [ ] **Step 0: Take any newer `main`**

Run: `git log --oneline HEAD..main`
Expected: empty. If not, run `git merge --no-edit main`; on a conflict in a doc, keep `main`'s structure and re-apply this branch's lines; then re-run the frontend gates.

- [ ] **Step 1: Measure the bundle and the coverage after the refactor**

Run (from `frontend/`): `npm run build` — note the gzip size of the `dist/assets/index-*.js` line. The "before" figure is in Task 1's commit: `git log --grep "Bundle baseline" --format=%B -n 1`.
Run (from `frontend/`): `npm test -- --coverage` — note the file and test counts and the "All files" statements / branches / lines percentages.

- [ ] **Step 2: `docs/TECHNICAL-DECISIONS.md` — header and counts**

Both replacements below are **substring** replacements: the last quoted line of each continues in the file ("Each decision's full design context…", "The numbered log is mostly…"), and that rest of the line must stay.

Replace

```
Every implementation decision in this project (D1–D78 and D89–D93), why it was made, and who
made it. D79–D88 are reserved by the TanStack refactor design on its own branch. The
[README](../README.md) lists only the headline ones.
```

with

```
Every implementation decision in this project (D1–D93), why it was made, and who made it. The
[README](../README.md) lists only the headline ones.
```

Replace

```
Of the 84 numbered decisions (D1–D78, D89–D93 and D8a), 10 are **Engineer**, 24
**Engineer + AI** and 50 **AI**.
```

with

```
Of the 94 numbered decisions (D1–D93 and D8a), 10 are **Engineer**, 30
**Engineer + AI** and 54 **AI**.
```

In the frontend conventions table, replace A43's last cell `As written, plus the URL for list state, which is an override` with `Query for server state; the URL for list state; Form for drafts; Store for the session and each page's UI state — an override`.

- [ ] **Step 3: `docs/TECHNICAL-DECISIONS.md` — the decision log**

Insert immediately before `## Deliberate overrides of AGENTS.md` (after the "Structured logging (iteration 6)" table):

```markdown
### TanStack Form, Table and Store (iteration 7)

From the [TanStack refactor design](superpowers/specs/2026-10-07-tanstack-form-table-store-design.md).
The engineer chose the scope (forms, tables and component state), a mergeable migration with no
change in behaviour, stores for component state rather than for shared state only, pagination
through the table, and the form components in the filter panels.

| # | Decision | Why | Origin |
|---|---|---|---|
| D79 | Every form draft is a TanStack Form; validation stays server-only | The engineer asked for TanStack Form in place of the hand-written forms. Three forms repeated one submit-and-error lifecycle, and frontend checks stay UX only (frontend §8). | Engineer + AI |
| D80 | Server errors live in Form's `onServer` slot, routed only to fields that show one, and cleared before every submit | One mapper replaces three. A standing `onServer` error makes Form refuse to submit, and Form writes the error map to every registered field. | AI |
| D81 | Every form's defaults are a mount-time snapshot | `useForm` re-applies changed defaults to an untouched form, and the detail queries refetch on focus. D40 depends on the snapshot. | AI |
| D82 | The filter panels are Forms, kept in step with the URL by `useUrlFieldSync` | The engineer asked for the form components in the filters, for one visual identity. Form's own debounce cannot be cancelled, and D50's echo rules had to stay. | Engineer + AI |
| D83 | Tables are built with `createTableHook` and own no state; the URL drives them | The engineer asked for TanStack Table in place of the hand-built tables. The URL stays the only copy of list state (D45). | Engineer + AI |
| D84 | Table drives the sort cycle; two mappers replace `nextOrdering` | With removal off and ascending first, Table's cycle is exactly D67's. Columns that do not sort opt out, or they would announce `aria-sort`. | AI |
| D85 | Pagination goes through the table; one handler chooses push or replace | The engineer chose one pagination model over the old props. Table's `setPageSize` keeps the top row in view, which is not D47's page-1 reset. | Engineer + AI |
| D86 | One session store per app replaces `AuthContext`; `useAuth()` keeps its shape | Shared client state with selector reads. One store per mount keeps tests isolated, and no caller of `useAuth()` changes. | Engineer + AI |
| D87 | Each page's UI state lives in a per-mount store; a row selects its own busy flag | The engineer chose stores for component state over `useState`, a broader override of frontend §4. One store per mount keeps `useState`'s lifetime. | Engineer + AI |
| D88 | DOM and timing primitives keep their internal React state | A store would add indirection with no second reader. | AI |
```

- [ ] **Step 4: `docs/TECHNICAL-DECISIONS.md` — override, sources, rationale, risks**

In "Deliberate overrides of AGENTS.md", replace the whole row that starts with `| **A fourth kind of state** |` with:

```markdown
| **State ownership** | frontend §4 (A43): three kinds of state — server state in TanStack Query, shared client state in Context, local UI state in `useState` | Server state in TanStack Query. List view state (filters, sort, page, page size) in the URL, owned by the router. Form drafts in TanStack Form. The session, and each page's UI state, in TanStack Store, one store per page mount. `useState` only inside DOM and timing primitives | A list's view must survive refresh, Back and a shared link, and the dashboard's cards must be able to open it; only the URL does all four (D45). Form and Store replaced three copies of one submit-and-error lifecycle and the per-component flags (D79–D88), and per-mount stores keep `useState`'s lifetime while letting a row select only what it renders. Typed text keeps a short-lived draft in its form field (D82). | Engineer + AI |
```

In "Sources", delete the row `| — | D79–D88 | Reserved by the TanStack Form, Table and Store refactor design, on branch …; not yet merged | — |`, and add this row **after** the `| 6. Structured logging | …` row, so the iterations stay in order:

```markdown
| 7. TanStack Form, Table and Store | D79–D88 | [tanstack-form-table-store-design](superpowers/specs/2026-10-07-tanstack-form-table-store-design.md) | [plan](superpowers/plans/2026-10-07-tanstack-form-table-store.md) |
```

Insert immediately before `## Known limitations and exit criteria` (after "Structured logs and the request id (D89–D93)"), replacing `<before>` and `<after>` with the Step 1 gzip figures:

```markdown
### TanStack Form, Table and Store (D79–D88)

The hand-written forms, tables and component state moved to TanStack Form 1.33, TanStack
Table 9.2 and TanStack Store 0.11, with no change in behaviour: the existing tests pass
unchanged apart from the three that tested replaced code directly (the URL draft hook, the
pager, `nextOrdering`). Form and Table both run on Store, so all three share one
`@tanstack/store` copy.

- **Every form draft is a TanStack Form (D79).** The sign-in, task and user forms and both
  filter panels use one set of bound field components (`src/components/form/`), so they share
  one look and one error display. Validation stays on the server.
- **Server errors live in Form's `onServer` slot (D80).** One mapper, `toServerErrors`,
  replaces three copies of the same branching. It routes only the keys a form renders an
  error for: Form writes the error map to every registered field, so an error keyed on
  `description` would otherwise appear under a textarea that never showed one. The slot is
  cleared before every submit, form and fields: while an `onServer` error stands, Form
  refuses to submit, so a second attempt would silently do nothing.
- **Form defaults are a snapshot (D81).** `useForm` re-applies changed `defaultValues` to an
  untouched form on every render, and the detail queries refetch on window focus. The task
  and user edit forms therefore take their defaults once, as the `useState` initialisers they
  replaced did, so D40 still holds; the filter panels take theirs from the URL once.
- **The filter panels are Forms, kept in step with the URL by `useUrlFieldSync` (D82).** It
  replaces `useSearchParamDraft` with the same rules (D46, D50) plus a queue of writes not
  yet echoed: two quick checkbox clicks put two navigations in flight, and the first echo must
  not revert the second. It owns its timer because Form's debounce cannot be cancelled, and
  Clear must cancel a pending date.
- **Tables own no state (D83–D85).** `createTableHook` sets up server-side sorting and paging
  once; each list passes `sorting`, `pagination` and column visibility from the URL and
  writes every change back through `navigate`. Table's own click cycle replaced
  `nextOrdering`. The pager is a registered table component reading the table's pagination
  model; one handler turns a proposed change into a push (a page move) or a replace back to
  page 1 (a size change, D47), ignoring the page index Table computes to keep the top row in
  view.
- **The session and each page's UI state live in stores (D86–D88).** `SessionProvider`
  creates the one session store, and `useAuth()` keeps its shape. Each list or detail page
  creates its own store on mount, so its dialog and busy state start clean on every visit, as
  `useState` did, and a row selects only its own busy flag. DOM and timing primitives
  (`useFocusFirstError`, `useModalDialog`, `useDebouncedValue`, `useUrlFieldSync`) keep their
  internal React state.
- **Bundle size:** the production JS went from <before> kB to <after> kB gzip.
```

In "Accepted risks", add at the end of the table:

```markdown
| **TanStack Store is pre-1.0** | The session and page stores use `createStore`, `useCreateStore`, `createStoreContext` and `useSelector` from `@tanstack/react-store` 0.11, and Form and Table depend on the same package. A 0.x minor release may change those APIs. | The `^0.11.2` range admits patch releases only, and Form and Table resolve to the same copy. See the exit criterion. |
```

In "Exit criteria", add before the struck-through drf-spectacular row:

```markdown
| TanStack Store is pre-1.0 (D86–D88) | Store 1.0 ships: re-check `createStore`, `useCreateStore`, `createStoreContext` and `useSelector`, widen the range, and remove the accepted risk. |
```

- [ ] **Step 5: `docs/ARCHITECTURE.md` — the frontend section**

In the mermaid diagram under `## Frontend`, replace
`        COMP["components/<br/>TaskTable, TaskForm, ..."]` with
`        COMP["components/<br/>TaskForm, TaskFilters, TaskCard, ..."]`
and
`    AUTH["features/auth/AuthContext<br/>current user"]` with
`    AUTH["features/auth/SessionProvider<br/>session store: current user"]`.

Replace the state table that follows "Each kind of state has exactly one home:" with:

```markdown
| Kind | Home | Examples |
|---|---|---|
| Server state | TanStack Query | task list, task detail, user list, stats |
| Session | TanStack Store, one session store from `SessionProvider` (D86) | the signed-in user |
| List view state | the URL, owned by the router (D45) | filters, sort, page, page size |
| Form drafts | TanStack Form (D79, D81) | the sign-in, task and user forms; the filter panels' fields, kept in step with the URL (D82) |
| Table model | TanStack Table, controlled from the URL (D83–D85) | rows, sort display, page count |
| Page UI state | TanStack Store, one store per page mount (D87) | the delete dialog's target and error, the busy row, the combobox's open state |
| Access token | `lib/api-client.ts` module memory | never `localStorage` or `sessionStorage` |
```

Two more lines in the same file:
- near the top, replace `(D1–D78 and D89–D93).` with `(D1–D93).`;
- in the containers diagram, replace `        UI["React SPA<br/>TanStack Router + Query"]` with `        UI["React SPA<br/>TanStack Router, Query, Form, Table and Store"]`.

- [ ] **Step 6: `frontend/README.md` — the layout**

In the `src/` tree, replace the `components/` line with
`├── components/   shared primitives (Button, ButtonLink, form error, focus helpers); form/ — the app form and its fields; table/ — the app table, TableView, Pagination`,
the `auth/` line with
`│   ├── auth/       sign-in page, session store and SessionProvider, auth service`,
and the `lib/` line with
`├── lib/          API client (token in memory, single-flight refresh), API errors, dates, pagination, URL field sync, store helpers`.

- [ ] **Step 7: `README.md` and `SUMMARY.md`**

`README.md`, "Key implementation decisions": after the bullet that starts `- **The URL holds list state (D45).**`, add:

```markdown
- **TanStack Form, Table and Store (D79–D88).** Every form and filter panel is a TanStack Form
  built from shared field components; the tables are TanStack Tables that own no state and
  are driven from the URL; the session and each page's UI state live in TanStack Stores.
```

In the same file:
- replace `all 84 numbered decisions` with `all 94 numbered decisions`;
- in the "Documentation" table, replace `every decision (D1–D78 and D89–D93)` with `every decision (D1–D93)`;
- in "Tech stack", replace `| Frontend | React 19, TypeScript, Vite, TanStack Router and TanStack Query, Tailwind CSS |` with `| Frontend | React 19, TypeScript, Vite, TanStack Router, Query, Form, Table and Store, Tailwind CSS |`;
- in "Running the tests and checks", replace `303 tests pass.` with the Step 1 count (`<N> tests pass.`).

`SUMMARY.md`:
- line 27: replace `decisions D1–D78 and D89–D93` with `decisions D1–D93`;
- line 31: replace `of each of the first five iterations (iteration 6 went straight to tests and is recorded in the decision log)` with `of each iteration except the sixth (iteration 6 went straight to tests and is recorded in the decision log)`;
- "Requirements checklist": replace `React 19, TanStack Router and Query` with `React 19, TanStack Router, Query, Form, Table and Store`;
- "Frontend best practices", State bullet — the text is wrapped over two lines in the file:

  ```
  - **State:** server state in TanStack Query, list state in the URL, the user in Context, and the
    token in module memory ([table](docs/ARCHITECTURE.md#frontend)).
  ```

  Replace those two lines with:

  ```
  - **State:** server state in TanStack Query, list state in the URL, form drafts in TanStack
    Form, the session and each page's UI state in TanStack Store, and the token in module memory
    ([table](docs/ARCHITECTURE.md#frontend)).
  ```
- "Key numbers": the paragraph above the table is wrapped over three lines:

  ```
  These were measured on 2026-10-07. The backend figures include iteration 6 (structured
  logging); the frontend figures are from `main` at `59ce235`, and the frontend has not changed
  since.
  ```

  Replace it with:

  ```
  These were measured on 2026-10-07. The backend figures include iteration 6 (structured
  logging); the frontend figures are from the TanStack refactor (iteration 7).
  ```

  Then set the Frontend tests row to the Step 1 counts and coverage; in the Static checks row replace `oxlint at its baseline of 5 warnings` with `oxlint at its baseline of 4 warnings`; set the Decisions row to `94: 10 Engineer, 30 Engineer + AI, 54 AI`; and in the Delivery row replace `6 iterations` with `7 iterations` and append `; 23 planned tasks in iteration 7`;
- "GenAI fluency", last bullet: replace `**The scale of the loop:** 6 iterations.` with `**The scale of the loop:** 7 iterations.`

- [ ] **Step 8: `docs/GENAI-WORKFLOW.md`**

In "How the output was validated", the current results are wrapped over two lines:

```
Current results: backend **432 tests, 100% coverage** (gate 80%); frontend **303 tests**,
94.75% statement coverage; typecheck clean; lint at its 5-warning baseline.
```

Replace the frontend figures with Step 1's (test count and statement coverage) and `5-warning` with `4-warning`; keep the backend figures.

In "The prompts" table, add after the iteration 6 row:

```markdown
| 7. TanStack refactor | TanStack Form, Table and Store in place of the hand-written forms, tables and component state. The engineer chose a mergeable migration, stores for component state, pagination through the table, the form components in the filters, and a full browser QA re-test | A spec and a 23-task plan, both checked against the installed libraries with a typechecked prototype run under Node and jsdom; then execution in a git worktree and a Playwright re-test | D79–D88 |
```

At the end of "What the generated output got wrong", append:

```markdown
**TanStack refactor (iteration 7).** The design was checked against the installed packages
before the plan was written: a prototype was typechecked and run under Node and jsdom. That
caught four things the library documentation does not say plainly, each now a decision with a
test that fails without it:
- Form refuses to submit while a server error stands in its `onServer` slot, and clearing that
  slot with `{ onServer: undefined }` leaves every field's error in place (D80).
- `useForm` re-applies changed `defaultValues` to an untouched form on every render (D81).
- Form writes a server error map to every registered field, so a generic mapper would have
  shown errors under fields that never displayed one (D80).
- A Table accessor column is sortable unless it opts out, which would have given Title and
  Assignee `aria-sort="none"` (D84).

The spec review then found the user form's missing snapshot and a store-creation pattern that
`useCreateStore` cannot express. The plan review found a "prove it red" step that could not go
red — the existing D40 test passes even without the snapshot, because both sides of its
comparison follow the refetch — and that `main` had moved on under the branch with a docs
reorganisation.
```

If execution or the browser re-test (Task 22) found anything the plan got wrong, add one bullet per item to that paragraph: what was claimed, what was true, and how it was verified.

- [ ] **Step 9: `docs-external/PROMPT-LOGS.md`**

Under `## Refactors`, immediately after the first block (the TanStack prompt that begins `using a worktree and superpowers brainstorming`), insert the two follow-up prompts, verbatim:

````markdown
```
apply 2 and 3, Rooute pagination via table to avoid reinventing the component for pagination and page size, and use the new form components in filters to keep visual identify
```

```
approved but since its a big change its worth to run again the qa report analysis to update results and check ui with playwrigth
```
````

- [ ] **Step 10: Check for stale references**

Run: `git grep -n -e AuthContext -e TaskTable -e UserTable -e useSearchParamDraft -e nextOrdering -e "D79–D88 are reserved" -e "84 numbered" -- README.md SUMMARY.md docs/ARCHITECTURE.md frontend/README.md docs/TECHNICAL-DECISIONS.md docs/GENAI-WORKFLOW.md`
Expected: matches only where the old names are history — the earlier iterations' decision entries and rationale (D45–D78) and the new D79–D88 text, which names what it replaced. `ARCHITECTURE.md`, `frontend/README.md`, `README.md` and `SUMMARY.md` have none.

- [ ] **Step 11: Commit**

```bash
git add README.md SUMMARY.md docs/TECHNICAL-DECISIONS.md docs/ARCHITECTURE.md docs/GENAI-WORKFLOW.md frontend/README.md docs-external/PROMPT-LOGS.md
git commit -m "docs: record the TanStack Form, Table and Store refactor (D79-D88)"
```

---

# Phase 6 — Browser QA re-test

### Task 22: Re-run the QA report matrix in the browser (spec §8)

**Files:**
- Modify: `docs/qa/2026-10-07-frontend-qa-report.md` (new section 8)
- Create: `docs/qa/screenshots/tanstack-baseline-*.png`, `docs/qa/screenshots/tanstack-*.png`

Use the Playwright MCP browser tools (`mcp__playwright__*`). Read `docs/qa/2026-10-07-frontend-qa-report.md` §3 and §7 first: they are the checklist and the format. Demo accounts: README "Demo credentials" (password `DemoPass!2026`).

- [ ] **Step 1: Check the stack, and that Compose serves `main`**

Run: `docker compose --project-directory D:/VirtualWrapper/code/TaskManagementSystem ps`
Expected: `backend`, `worker`, `beat`, `db`, `redis`, `mailhog` and `frontend` running. If not, run `docker compose --project-directory D:/VirtualWrapper/code/TaskManagementSystem up -d` and re-check.

Run: `git -C D:/VirtualWrapper/code/TaskManagementSystem rev-parse --abbrev-ref HEAD`
Expected: `main` (the main checkout, which the Compose `frontend` service bind-mounts).

Run: `git -C D:/VirtualWrapper/code/TaskManagementSystem diff --stat 59ce235 HEAD -- frontend/src`
Expected: empty — `main`'s frontend is the one this refactor started from, so it is a valid baseline. (If not, note the commit and what changed in §8's metadata.)

- [ ] **Step 2: Take the baseline from `main` (spec §8 step 1)**

With the browser on `http://localhost:5173` (still `main`), at widths 360, 768 and 1280 (`browser_resize`), take full-page screenshots of:
- `/login`;
- as Supervisor: `/tasks` (filters, list or cards, pager), `/tasks/new`, the edit page of one task (`/tasks/<id>/edit`);
- as Admin: `/users`, `/users/new`, the edit page of one Operator.

Save them as `docs/qa/screenshots/tanstack-baseline-<page>-<width>.png` in the **worktree** (copy them there if the tool writes elsewhere). Note the task and user ids used, for Step 5.

- [ ] **Step 3: Serve the branch instead**

Run: `docker compose --project-directory D:/VirtualWrapper/code/TaskManagementSystem stop frontend`

Start Vite from the worktree, in the background (Bash `run_in_background: true`), from `frontend/`: `npm run dev`

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`
Expected: `200`. (`:5173` is the only origin `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` allow; the API base URL defaults to `http://localhost:8000`.)

- [ ] **Step 4: Run the QA report matrix**

Against the branch, repeat every check in the QA report's §3: A1–A11, R1–R10, D1–D5, L1–L20, T1–T20, U1–U16; §3.7 responsive at 360, 768, 1024 and 1280 (`document.documentElement.scrollWidth > clientWidth`, and no element past the right edge, as before); §3.8 console hygiene (`browser_console_messages`); and the F1–F14 evidence checks of §7.1. Every row is expected to pass, as it did after iteration 5. Follow §7.4's rules on side effects: no destructive change to seeded data unless a check needs it, and restore what you change.

- [ ] **Step 5: Run the refactor-specific checks**

| ID | How |
|---|---|
| Q1 | Sign in with a wrong password, then the right one: the second attempt lands on the dashboard. On a task's edit page, clear the title and save (400, error under Title), retype the title and save: it saves. Same on a user's edit page with First name. These saves send unchanged values |
| Q2 | Screenshot the same pages as Step 2 at 360, 768 and 1280 as `docs/qa/screenshots/tanstack-<page>-<width>.png` and compare with the baseline: same layout, spacing and controls. On `/tasks`, type a Due after date and click Clear filters within 300 ms: the date does not come back |
| Q3 | On `/tasks` (≥ 21 rows), click Page 2: URL `?page=2`, focus stays on the Page 2 button, browser Back returns to page 1. Change Rows per page to 50: URL `page_size=50`, no `page`, and Back does not step through the size change |
| Q4 | Open a task's Delete dialog, navigate to Dashboard with the header link, come back to Tasks: no dialog |
| Q5 | In tab 1 open the edit page of the Step 2 task, untouched. In tab 2 (`browser_tabs`) change that task's title and save. Return to tab 1 (the focus refetch runs): its Title still shows the old value; press Cancel. Repeat with tab 1 having changed the Status select first: the chosen status survives the return. Do the untouched case for a user's First name too. Restore every changed value afterwards and list them under side effects |
| Q6 | `browser_console_messages` across Steps 4–5: no JavaScript errors and no React warnings; only Chromium's network lines for deliberate 4xx responses |

- [ ] **Step 6: Fix anything that regressed**

For each failing row, use @superpowers-extended-cc:systematic-debugging: reproduce it, write a test that fails, fix it on the branch, run the gates, and commit (`fix: …`). Then re-check the row in the browser. Each one goes in the report as found and fixed.

- [ ] **Step 7: Run the gates for the report**

Run: `bash D:/VirtualWrapper/code/TaskManagementSystem/scripts/run-backend-tests.sh` (the backend is unchanged; this is the §7.2 gates table's first row).
Run: `git diff --stat main -- ../backend` — expected: empty. The branch merged `main` (Task 21 Step 0) and changes no backend file, so the Compose backend, which runs `main`'s code, is the branch's backend too.
Run from `frontend/`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Record the counts: test files and tests, lint warnings, gzip size.

- [ ] **Step 8: Write section 8 of the QA report**

Append to `docs/qa/2026-10-07-frontend-qa-report.md`, in §7's format:

```markdown
## 8. Re-test (TanStack refactor)

| | |
|---|---|
| **Commit** | `<short sha of the branch HEAD>` (`refactor/tanstack-form-table-store`) |
| **Environment** | Compose stack for the API, worker and database; the SPA served by native Vite from the refactor worktree, the Compose `frontend` stopped |
| **Browser** | Chromium via Playwright MCP, 1280 px unless stated |
| **Roles exercised** | Admin, Supervisor, Operator, anonymous |

### 8.1 Matrix

| Area | Checks | Pass | Notes |
|---|---|---|---|
| Authentication & session (A1–A11) | … | … | … |
| Role gating (R1–R10) | … | … | … |
| Dashboard (D1–D5) | … | … | … |
| Task list (L1–L20) | … | … | … |
| Task create / edit / detail / delete (T1–T20) | … | … | … |
| Users (U1–U16) | … | … | … |
| Responsive (§3.7, 4 widths) | … | … | … |
| Console hygiene (§3.8) | … | … | … |

### 8.2 Findings F1–F14, re-checked

| ID | Still fixed | Evidence |
|---|---|---|

### 8.3 Refactor checks

| ID | Result | Evidence |
|---|---|---|
| Q1 | … | … |
| Q2 | … | … |
| Q3 | … | … |
| Q4 | … | … |
| Q5 | … | … |
| Q6 | … | … |

### 8.4 Found and fixed

(One row per regression found in Step 6 — finding, cause, fix commit. "None" if none.)

### 8.5 Gates

| Gate | Result |
|---|---|

### 8.6 Screenshots

| File | Shows |
|---|---|

### 8.7 Side effects and observations
```

Fill every `…` and table with what was observed: counts, URLs, attribute values, the same level of evidence as §7.1. A row that did not pass says so and points at §8.4.

- [ ] **Step 9: Restore the environment**

Stop the background `npm run dev` (TaskStop on its task, or end the process). Then:
Run: `docker compose --project-directory D:/VirtualWrapper/code/TaskManagementSystem start frontend`

- [ ] **Step 10: Commit**

```bash
git add docs/qa
git commit -m "docs: re-test the QA report matrix after the TanStack refactor"
```

---

### Task 23: Persist insights to claude-insights

**Files:**
- Modify: `D:/VirtualWrapper/code/claude-insights/projects/task-management-system.md` (outside the repository; not committed with the branch)

- [ ] **Step 1: Read the existing file**

Read `D:/VirtualWrapper/code/claude-insights/projects/task-management-system.md` and check whether it already has a frontend-state or TanStack section; update it rather than duplicating.

- [ ] **Step 2: Add what this work established**

Add a section "TanStack Form / Table / Store (D79–D88)" with:
- **The state model:** URL for list state; Form for drafts; one session store from `SessionProvider`; a per-page store via `useCreateStore` + `createStoreContext`; `useState` only in DOM and timing primitives.
- **The verified library gotchas**, with versions:
  - Form 1.33: an `onServer` error blocks `handleSubmit`; clear it with `{ onServer: { form: undefined, fields: {} } }`.
  - Form 1.33: `setErrorMap` writes to every registered field.
  - Form 1.33: `FormApi.update` rewrites an untouched form's values when `defaultValues` change.
  - Form 1.33: field debounce timers cannot be cancelled.
  - Table 9.2: accessor columns are sortable by default.
  - Table 9.2: `setPageSize` keeps the top row in view.
  - Table 9.2: controlled `state` is reflected in the same render.
  - Store 0.11: `useCreateStore(fn)` creates a read-only store, and actions must be a `type`, not an `interface`.
- **Where things live:** `src/components/form/`, `src/components/table/`, `src/lib/useUrlFieldSync.ts`, `src/lib/delete-flow.ts`.
- **Links:** the spec, this plan, and §8 of the QA report.

- [ ] **Step 3: Done**

No commit: the insights directory is outside the repository.
