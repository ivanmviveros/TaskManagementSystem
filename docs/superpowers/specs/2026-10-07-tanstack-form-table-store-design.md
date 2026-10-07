# TanStack Form, Table and Store — Design Specification

**Date:** 2026-10-07
**Builds on:** iteration 5 (D66–D78) and
[2026-10-07-qa-fixes-iteration-5-design.md](2026-10-07-qa-fixes-iteration-5-design.md); the list
navigation design (D45–D56), all recorded in `README.md`
**Branch:** `refactor/tanstack-form-table-store`, off `main` at `59ce235`, in the worktree
`.worktrees/refactor-tanstack`; `main` merged in at `607262f` (docs reorganisation and
structured logging, no `frontend/src` change)
**Status:** approved in brainstorming. Pending written-spec review.

---

## 1. Scope

Replace the frontend's hand-written forms, tables and component-local state with TanStack Form,
TanStack Table and TanStack Store. **Behaviour does not change**: every screen, URL, request,
message, focus move and ARIA attribute stays as it is today. The backend is not touched.

| Area | Today | After |
|---|---|---|
| Forms | `LoginPage` (5 `useState`), `TaskForm` (10), `UserForm` (9). Each repeats `fieldErrors` / `formError` / `isSubmitting` and its own `ApiError` → field mapping | `useAppForm` with bound field components and one server-error mapper (§5) |
| Filter panels | `TaskFilters`, and the filter `<section>` inline in `UserListPage`. Checkboxes and selects write the URL directly; typed text goes through `useSearchParamDraft` | `useAppForm` with the same field components in a compact density, and `useUrlFieldSync` (§5.6) |
| Tables | `TaskTable` (sort buttons through `sorting.ts`) and `UserTable`, hand-built. Cards render separately. `Pagination` takes `count` / `page` / `pageSize` and two callbacks | `useAppTable`, controlled from the URL. `TableView`, `SortHeader` and `Pagination` are registered table components. Cards render from the same row model (§6) |
| Component state | `TaskListPage` (4 `useState`), `TaskDetailPage` (3), `UserListPage` (2), `AssigneeCombobox` (3), `AuthContext` (2) | One session store. Per-mount feature stores (§4) |
| Dead code | `src/App.tsx`, the Vite template's counter, imported nowhere, and the files only it uses: `src/App.css`, `src/assets/hero.png`, `react.svg`, `vite.svg` | Deleted |

### 1.1 Choices made by the project owner

- **Outcome: a full, mergeable migration.** Behaviour unchanged, with the existing tests as the
  regression net and the README updated.
- **Store scope: broad.** Feature UI state (delete target and error, busy row, action error,
  combobox state) moves into per-feature stores, not only the shared session. This deliberately
  overrides frontend `AGENTS.md` §4 ("local UI state → `useState`"), recorded in the README (§9.2).
- **Approach: each library's own composition API** (`createFormHook`, `createTableHook`,
  `useCreateStore` + `createStoreContext`) with thin project glue. Calling the libraries inline
  and wrapping them in a project kit were both rejected (§10).
- **Pagination goes through Table**, so the pager and the page-size control use the table's
  pagination model instead of a parallel one.
- **The filter panels use the new form field components**, so filters and forms share one visual
  identity.
- **A browser QA re-test** of the whole QA report matrix follows the implementation (§8).

### 1.2 Library versions

Verified on 2026-10-07 against the npm registry and each package's type declarations.

| Package | Range | Note |
|---|---|---|
| `@tanstack/react-form` | `^1.33.5` | Depends on `@tanstack/react-store ^0.11.0` |
| `@tanstack/react-table` | `^9.2.6` | v9 is the `latest` dist-tag. Its state is built on Store atoms; depends on `@tanstack/react-store ^0.11.2` |
| `@tanstack/react-store` | `^0.11.2` | Pre-1.0. Imported directly by this code, and the same copy Form and Table use |

`npm ls @tanstack/store` must show one deduplicated version. No validation library (Zod,
Valibot) is added (D79).

---

## 2. Decision log

Continues from D78.

| # | Decision | Rationale |
|---|---|---|
| D79 | **TanStack Form owns every form draft** (Login, Task, User) and both filter panels. Validation stays server-only: `noValidate`, no client validators, no schema library. | Removes three copies of the same submit and error state. `AGENTS.md` treats frontend checks as UX only, and a migration adds no rules. |
| D80 | **Server errors live in Form's `onServer` error slot.** A pure `toServerErrors` maps an error to `{ form, fields }`, routing to `fields` **only** the keys the form renders an error for; `setServerErrors` writes the slot; `clearServerErrors` empties it, form and every field, **before every submit**. | One mapper replaces three. Clearing first is required: an `onServer` error leaves the form invalid, and form-core 1.33.5's `_handleSubmit` then silently refuses the next submit (`canSubmit` is false, and `validate("submit")` keeps `isValid` false). Routing only rendered keys keeps today's behaviour: `setErrorMap` writes to **every** registered field, so an error keyed on `description` would otherwise appear under a textarea that shows no error today, and D75 would focus it instead of the alert. |
| D81 | **Every form's default values are a mount-time snapshot**, taken once with a lazy initializer: the task and user edit forms (from the detail query) and the two filter panels (from the URL). D40's status options, read-only switch and "did it change?" check read the task snapshot. | `useForm` calls `FormApi.update` on every render, and `update` replaces an untouched form's values whenever `defaultValues` change deeply. The detail queries refetch on window focus, so passing them live would let a refetch rewrite an open form, which today's `useState` initialisers never do and D40 forbids. For the filters, the snapshot leaves `useUrlFieldSync` (D82) as the one path from the URL into the fields. |
| D82 | **The filter panels are Forms without a `<form>` element.** `useUrlFieldSync` replaces `useSearchParamDraft`, with the same echo, cancel and unmount rules (D46, D50). It owns a cancellable timer, tracks every write not yet echoed (a queue, not a single value), and also handles fields that commit immediately. | One visual identity (owner's choice). Form's own `onChangeDebounceMs` timer cannot be cancelled, and Clear must cancel a pending date. Form also does not solve the echo: our own commit landing in the URL must not overwrite newer typing. Keeping `<section aria-label="Filters">` keeps Enter inert and the region role the tests query. |
| D83 | **Tables are built with `createTableHook` and own no state.** Sorting, pagination and column visibility are controlled from the URL (`manualSorting`, `manualPagination`, `autoResetPageIndex: false`); no client row models are registered. | D45: the URL is the only copy of list state. The `manual*` flags only bypass client processing; the server already sorts and pages. |
| D84 | **Table drives the sort cycle:** `enableMultiSort: false`, `enableSortingRemoval: false`, `sortDescFirst: false`. `orderingToSorting` and `sortingToOrdering` replace `nextOrdering`. The default ordering maps to `undefined` (D48). | Verified in table-core 9.2.6 (`column_getNextSortingOrder`, `column_getFirstSortDir`): inactive → ascending → descending → ascending, the cycle D67 specifies. Column ids equal the API's ordering fields, so the mapping is direct. |
| D85 | **Pagination goes through Table.** `Pagination` is a registered table component reading the table's pagination model. One change handler routes the result: a page-size change replaces history and returns to page 1; a page move pushes (D47). | Owner's choice: no parallel pager model. Table's own `setPageSize` keeps the top row visible (`floor(pageSize × pageIndex / newSize)`), which is not D47's page-1 reset, so the handler, not Table, decides the navigation. |
| D86 | **One session store per app replaces `AuthContext`.** `SessionProvider` creates it once per mount with `useCreateStore(initialSessionState, sessionActions)` and shares it through `createStoreContext`. `useAuth()` keeps its return shape. | Shared client state (frontend §4) with selector reads and no Provider value object. One instance per mount gives every test render a fresh session. The unchanged hook leaves `router.tsx`, `useRouterAuthSync` and every consumer untouched. |
| D87 | **Feature UI state lives in per-mount feature stores** (`useCreateStore` + `createStoreContext`). A generic delete-flow slice is shared by the task list, task detail and user list. Rows read their own busy state by selector and call `useTaskActions()` directly. | Owner's broad scope. Per mount means the same lifetime the replaced `useState` had: fresh on every visit, no reset code, no leakage between tests. Selector reads re-render only the busy row; the row components stop receiving `onComplete` / `onDelete` / `busyId` / `isBusy` / `currentUserId` props. |
| D88 | **Reusable primitives keep their internal React state:** `useUrlFieldSync`, `useDebouncedValue`, `useFocusFirstError`, `useModalDialog`, the router's create-once initializer and D81's default-value snapshots. | These are DOM and timing mechanics, not feature state. Each has exactly one reader, so a store would add indirection and no second consumer. |

---

## 3. State ownership after the refactor

| State | Owner | Change |
|---|---|---|
| Server data and mutations | TanStack Query | None |
| List view: filters, ordering, page, page size | The URL, through the router (D45) | None. Table reads it and writes it through `navigate`; it never keeps a copy |
| Form drafts: Login, Task, User | TanStack Form | New (D79) |
| Filter-panel field values | TanStack Form, synced to the URL by `useUrlFieldSync` | New (D82) |
| Table model: rows, columns, sort display, page count | TanStack Table, controlled from the URL | New (D83) |
| Session: `user`, `isLoading` | The session store | New (D86), replaces `AuthContext` |
| Feature UI state: delete target and error, busy row, action error, combobox open / query / active option | Per-mount feature stores | New (D87), replaces `useState` |

After the refactor no feature component (`features/**`) calls `useState`. The exceptions are the
primitives listed in D88.

---

## 4. Store layer (D86, D87)

### 4.0 How every store is made

Every store module exports **two things**: its initial state and its actions factory. A component
creates the store once per mount with `useCreateStore(initialState, actions)`, which returns a
writable `Store<T, TActions>`. Where a unit test or a context's type needs it, the module also
exports `createXStore = () => createStore(initialState, actions)`; no component calls it. (The
combobox store, which has neither, does not.)

Two rules follow from Store 0.11.2's types:

- `useCreateStore(getter)` with a function argument creates a **read-only** derived store, so a
  ready-made store can never be passed to it. Always pass the initial state and the actions
  factory separately.
- `TActions extends Record<string, StoreAction>`. Declare the actions with `type`, not
  `interface`: an interface has no implicit index signature and fails that constraint.

### 4.1 Session store — `features/auth/session-store.ts`

```ts
export type SessionState = {
  user: CurrentUser | null;
  /** True until the initial "who am I?" probe settles, so guards can wait. */
  isLoading: boolean;
};

export const initialSessionState: SessionState = { user: null, isLoading: true };

export const sessionActions = ({ setState }: StoreActionsArgs<SessionState>) => ({
  settle: (user: CurrentUser | null) => setState(() => ({ user, isLoading: false })),
  signIn: async (email: string, password: string) => { /* login, setAccessToken, set user; returns user */ },
  signOut: async () => { /* never rejects; clears the token and the user in `finally` */ },
  expire: () => setState((s) => ({ ...s, user: null })),
});

export const createSessionStore = () => createStore(initialSessionState, sessionActions); // tests only
```

`StoreActionsArgs` is shorthand in this sketch for the `{ setState, get }` argument of Store's
`StoreActionsFactory`; the plan settles the exact type.

- **`SessionProvider`** (`features/auth/SessionProvider.tsx`) creates the store once per mount
  with `useCreateStore(initialSessionState, sessionActions)`, shares it through
  `createStoreContext`, and runs today's bootstrap effect unchanged: refresh
  first (D35), the same cancellation guard, and `settle()` instead of two setters. It registers
  `apiClient.onSessionExpired(store.actions.expire)`. The bootstrap issues exactly as many
  requests as today; the existing test that counts them must pass unchanged.
- **`useAuth()`** returns `{ user, isLoading, signIn, signOut }`, with the same `AuthState` type
  name, built from `useSelector(store, …, { compare: shallow })` plus the stable actions.
  `router.tsx`, `useRouterAuthSync`, `RoutedApp` and every caller are unchanged. Only the
  `AuthState` import path moves.
- `AuthContext.tsx` is deleted; `Providers` renders `SessionProvider` in its place, and so does
  the test harness `src/test/render-app.tsx`, which imports `AuthProvider` today (§7.2).
- `signIn` and `signOut` keep today's contracts and comments: the sign-out is authoritative
  locally and never rejects.

### 4.2 Feature stores

Each module exports its initial state and actions factory (§4.0). A page creates its store with
`useCreateStore` and shares it through a `createStoreContext` provider. Nothing is a module
singleton.

| Module | State | Actions | Created by |
|---|---|---|---|
| `lib/delete-flow.ts` (generic slice) | `{ pending: T \| null; error: string \| null }` | `begin(target)`, `cancel()`, `fail(message)` | Composed into the stores below; under §4.0 its actions are written over the containing store's state, and the plan settles how |
| `features/tasks/task-actions-store.ts` | delete flow over the task, plus `busyId: string \| null`, `actionError: string \| null` | the delete-flow actions, `startAction(id)`, `failAction(message)`, `endAction()` | `TaskListPage` and `TaskDetailPage`, one each |
| `features/users/user-list-store.ts` | delete flow over `UserDetail` | the delete-flow actions | `UserListPage` |
| `AssigneeCombobox` (per instance, no context) | `{ open, query: string \| null, activeIndex }` | `openAt(index)`, `close()`, `type(query)`, `moveTo(index)` | `AssigneeCombobox` |

- **`useTaskActions()`** (`features/tasks/hooks/useTaskActions.ts`) combines the task-actions
  store with `useCompleteTask` and `useDeleteTask`. It exposes `complete(task)`,
  `beginDelete(task)`, `cancelDelete()` and `confirmDelete({ onDeleted? })`. The detail page
  passes `onDeleted` to navigate back with D70's search. Error copy is unchanged ("Something
  went wrong. Try again.", "Could not delete that task."). The user list keeps its own
  "Could not deactivate that user." in its confirm handler.
- **The delete target is the object, not an id.** Rows pass their own task or user to
  `beginDelete`, so a refetch while the dialog is open cannot make the target disappear. That is
  the same guarantee `beginDelete` gives today by looking the task up at click time.
- **Rows read the store themselves.** `TaskRowActions` and `TaskCard` select their busy flag
  with `useSelector(store, (s) => s.busyId === task.id)` and call `useTaskActions()`. Their
  `onComplete`, `onDelete`, `busyId` and `isBusy` props are removed.
  `UserRowActions` (new: the user table's actions cell, which `UserCard` also renders) has no busy
  flag, since the user list tracks none. It calls the user-list store's `beginDelete(user)` and
  reads `useAuth()` for D66; `UserTable`'s and `UserCard`'s `onDelete` and `currentUserId` props
  are removed.
- **The detail page keeps today's behaviour.** It tracks no busy state; "Mark complete" is not
  disabled while in flight, exactly as now.
- **The combobox keeps its contract.** The WAI-ARIA pattern, `aria-activedescendant`,
  load-more triggers and every D64 behaviour are unchanged; only the three `useState` calls
  become one per-instance store.

---

## 5. Form layer (D79–D82)

### 5.1 Infrastructure — `components/form/`

| Module | Contents |
|---|---|
| `form-contexts.ts` | `createFormHookContexts()` → `fieldContext`, `formContext`, `useFieldContext`, `useFormContext`. A module of its own, so the hook factory and the field components do not import each other |
| `fields/TextField.tsx`, `TextareaField.tsx`, `SelectField.tsx`, `CheckboxField.tsx`, `CheckboxGroupField.tsx` | Bound field components. Each reads `useFieldContext()` and renders today's markup |
| `SubmitButton.tsx`, `FormError.tsx` | Form components. `SubmitButton` subscribes to `isSubmitting` (disabled, `label` / `pendingLabel`); `FormError` renders the form-level `onServer` message through the existing `components/FormError.tsx` |
| `app-form.ts` | `createFormHook({ fieldContext, formContext, fieldComponents, formComponents })` → `useAppForm`, `withForm` |
| `server-errors.ts` | `toServerErrors`, `setServerErrors`, `clearServerErrors` (§5.2) |

**Field markup is the contract.** The bound fields keep today's ids, labels,
`aria-invalid="true"` only when there is an error, `aria-describedby` → `${id}-error`, and
`<p id="${id}-error">` for the message. Each field shows its `onServer` error when it has one.
Only the fields that show an error today ever receive one, because `toServerErrors` routes only
`renderedFields` (§5.2). The task form's description and status and the user form's role and
Active checkbox never get one. The fields:

- accept the input attributes the forms use today (`type`, `required`, `maxLength`, `readOnly`,
  `autoComplete`, `name`, `min`, `max`);
- accept `aria-invalid` and `aria-describedby` overrides, for D78's cross-field message;
- take a `density` of `"default"` or `"compact"`. `"default"` is today's form markup (`mb-4`
  wrapper, `w-full` input). `"compact"` is today's filter markup (`text-sm`, auto width, no
  bottom margin), so the filter bar keeps its inline layout at `sm` and up.

The presentational `components/TextField.tsx` stays the rendering primitive behind the bound
`TextField`.

### 5.2 Server errors (D80)

```ts
export interface ServerErrors {
  form?: string;
  fields: Record<string, string>;
}

export function toServerErrors(
  error: unknown,
  options: {
    renderedFields: readonly string[];
    codeToField?: Readonly<Record<string, string>>;
    fallback: string;
  },
): ServerErrors;
```

The rules are today's, moved into one place:

1. `ApiError` with `code === "validation_error"`: each key **in `renderedFields`** gets its first
   message in `fields`. Keys outside `renderedFields` are never put in `fields`. The form message
   is set **only** when none of `renderedFields` has an error, so an error keyed on a field the
   form does not render reaches the user through the alert, which D75 then focuses.
2. `ApiError` whose `code` is in `codeToField`, and that field is in `renderedFields`: that field
   gets `error.message`. This is decided by `code`, never by parsing `detail`. If the field is not
   rendered, the message goes to the alert instead (D75).
3. Any other `ApiError`: the form message is `error.message`.
4. Anything else: the form message is `fallback`.

**Writing and clearing.** `setServerErrors(form, { form, fields })` calls
`form.setErrorMap({ onServer: { form, fields } })`. That call writes `fields[name]` to every
registered field, so fields not listed are set to `undefined`. `clearServerErrors(form)` calls
`form.setErrorMap({ onServer: { form: undefined, fields: {} } })`. The `fields` key is required:
form-core treats a value as form-and-fields only when it has one (`isGlobalFormValidationError`),
and `{ onServer: undefined }` alone would clear the form-level message but leave every field
error in place, still blocking the next submit.

**Submit wiring, identical in all three forms:**

```tsx
<form
  ref={formRef}
  noValidate
  aria-label={…}
  onSubmit={(event) => {
    event.preventDefault();
    clearServerErrors(form); // D80: a stale onServer error would block this submit
    void form.handleSubmit();
  }}
>
```

The form's `onSubmit` awaits the page-level `onSubmit(values) => Promise` prop. That contract
does not change, so `TaskFormPage`, `TaskEditPage` and `UserFormPage` keep their mutation code.
On failure it calls `setServerErrors(form, toServerErrors(caught, …))` and then
`signalFailure()` (D75, `useFocusFirstError` unchanged). Errors persist until the next submit,
as today; editing a field does not clear its error.

### 5.3 `LoginPage`

- Fields: `email` (`type="email"`, `autoComplete="username"`, `name="email"`) and `password`
  (`autoComplete="current-password"`, `name="password"`).
- Its own small mapper, because login's rules differ from the shared one: status **429** →
  "Too many attempts. Wait a minute and try again."; any other `ApiError` → the form message
  **and** every field error (F3); anything else → "Could not reach the server. Try again."
- Submit button: "Sign in" / "Signing in…", full width.

### 5.4 `UserForm`

- **Snapshot (D81).** `UserEditPage` passes the live `useUser` result, which refetches on focus,
  so the defaults are taken once: `const [defaults] = useState(() => userDefaults(user))`, the
  same allowed initializer as the task form (D88). Today's `useState` initialisers behave this
  way already.
- `renderedFields: ["email", "first_name", "last_name", "password"]`,
  `codeToField: { email_already_in_use: "email" }`, `fallback: "Could not save. Try again."`.
- Email is read-only in edit mode. The password label and `required` depend on the mode.
- D66's self branch is unchanged: for the actor's own account the Role is read-only text with
  the explanation and there is no Active checkbox. `role` and `is_active` are still submitted,
  unchanged.

### 5.5 `TaskForm` (D81, D32, D40)

- **Snapshot.** `const [snapshot] = useState(() => taskSnapshot(task))`, an allowed lazy
  initializer (D88). It yields the default values
  `{ title, description, due_date: "yyyy-mm-dd" | "", assignee: UserMinimal | null, status }`
  plus `initialStatus` and `initialTransitions`. Nothing in the form reads the live `task` after
  the first render.
- **`toTaskInput(values, { canChooseAssignee, isEdit, initialStatus })`** is pure and produces
  today's `TaskFormValues`:
  - `due_date`: `""` → `null`, otherwise `` `${day}T12:00:00Z` `` as ISO (D76 unchanged);
  - `assignee`: present only when `canChooseAssignee`, as the id or `null`. Omitted and `null`
    stay distinct (D32);
  - `status`: present only in edit mode and only when it differs from `initialStatus` (D40).
- Errors: `renderedFields` is `["title", "due_date"]`, plus `"assignee"` when
  `canChooseAssignee`; `codeToField: { assignee_not_assignable: "assignee" }`.
- Status: the select's options come from the snapshot; a terminal task shows the read-only badge
  and its sentence. Both unchanged.
- `AssigneeCombobox` becomes a bound custom field (`form.AppField name="assignee"`): its value is
  `UserMinimal | null`, it writes through `field.handleChange`, and its error comes from
  `onServer`.

### 5.6 Filter panels (D82)

**`lib/useUrlFieldSync.ts`** replaces `useSearchParamDraft`. The signature is a sketch; the
plan settles the exact types:

```ts
export function useUrlFieldSync<TValue>(options: {
  form: AppFormApi;
  name: string;
  committed: TValue;                    // the URL's current value for this field
  commit: (value: TValue) => void;      // writes the URL (applyFilters patch)
  delayMs?: number;                     // 300 for typed text and dates; 0 commits at once
  equals?: (a: TValue, b: TValue) => boolean; // for arrays (status)
}): { onChange: (value: TValue) => void; cancel: () => void };
```

- The field's `listeners.onChange` calls `onChange`, which schedules the commit on the hook's
  own timer, or commits at once when `delayMs` is 0. Each value written is appended to a queue of
  **writes not yet echoed**.
- A change in `committed` is detected with `equals` against the previous `committed` (default
  `Object.is`; the status field passes an array comparison), never by array identity, so a
  re-render that rebuilds the same array is not a change.
- When `committed` equals a queued write, that is our own echo: the write and every write queued
  before it are dropped, and the field is left alone, so an echo can never overwrite newer input.
  A queue rather than D50's single `lastWritten` matters for immediate fields: two quick checkbox
  clicks put two writes in flight, and the first echo must not briefly revert the second click.
  Typed text usually has one write in flight; the queue also covers a navigation slower than
  the 300 ms quiet period.
- A write equal to the current `committed` value is committed but **not queued**: the URL does
  not change, so no echo will ever arrive to remove it.
- When `committed` equals no queued write, the change came from elsewhere (Back, a nav link,
  Clear, a dashboard card). The hook clears the queue, drops any pending commit, and writes the
  value into the field with `form.setFieldValue(name, committed, { dontRunListeners: true })`.
- Unmounting drops a pending commit. `cancel()` drops a pending commit, clears the queue and
  returns the field to `committed`, **also with `{ dontRunListeners: true }`**; otherwise the
  field's own listener would schedule a commit of the old value and bring back the date Clear
  just removed.
- The seven `useSearchParamDraft` test cases move over unchanged in meaning, plus cases for
  immediate mode, two writes in flight, and array equality (§7.2).
- The panels' `defaultValues` are a mount-time snapshot of the URL (D81). After mount the URL
  reaches the fields only through this hook.

**`TaskFilters`**: `useAppForm` with defaults from the URL:
`{ status: TaskStatus[], due_date_after: "yyyy-mm-dd" | "", due_date_before, overdue: boolean }`.

| Field | Component | Commit |
|---|---|---|
| Status | `CheckboxGroupField`, compact, fieldset and legend "Status" | Immediately, as the whole array (`undefined` when empty) |
| Due after / Due before | `TextField` `type="date"`, compact, ids `due-after` / `due-before` | After 300 ms of quiet, through `toBound` (00:00:00 / 23:59:59 UTC, unchanged) |
| Overdue only | `CheckboxField`, compact | Immediately (`true` or `undefined`) |

- **Clear filters** calls `cancel()` on every synced field, then `onClear()`, which keeps
  `page_size` (D51). The fields then follow the URL.
- **D78 is unchanged.** `inverted` is computed from the two date values (selected from
  `form.store`). The message lives in the always-mounted `aria-live="polite"` paragraph.
  `aria-invalid` is set on Due before only, and `aria-describedby` on both while inverted.
  `max` and `min` are cross-bound to the other date.

**`UserFilters`** is extracted from `UserListPage` into `features/users/components/UserFilters.tsx`:

- Search: `TextField` `type="search"`, id `search`, 300 ms.
- Role: `SelectField`, id `role-filter`, with "All roles" first and labels from `ROLE_LABEL`
  (F13). Commits immediately.
- Inactive only: `CheckboxField`, mapped to `is_active: false` or `undefined`. Commits
  immediately.

Both panels stay `<section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">`
with no `<form>` element, so Enter submits nothing.

---

## 6. Table layer (D83–D85)

### 6.1 Infrastructure — `components/table/`

| Module | Contents |
|---|---|
| `table-features.ts` | `tableFeatures({ rowSortingFeature, rowPaginationFeature, columnVisibilityFeature, columnMeta: {} as { cellClassName?: string } })`. No row-model slots: the server sorts and pages. `columnMeta` is v9's type-only slot for per-table column meta, used instead of augmenting the global `ColumnMeta` interface |
| `table-contexts.ts` | `createTableHookContexts<typeof features>()`. A module of its own, which keeps the factory → components → factory imports acyclic; Table's docs warn that a cycle breaks Vite HMR. **`TableView`, `SortHeader` and `Pagination` import their context hooks from this module, never from `app-table.ts`** |
| `app-table.ts` | `createTableHook({ features, getRowId: (row: { id: string }) => row.id, manualSorting: true, manualPagination: true, autoResetPageIndex: false, enableMultiSort: false, enableSortingRemoval: false, sortDescFirst: false, tableComponents: { TableView, Pagination }, headerComponents: { SortHeader }, …contexts })` → `useAppTable`, `createAppColumnHelper`, `useTableContext` |
| `TableView.tsx` | Today's `<table>` markup through `FlexRender` (§6.2) |
| `SortHeader.tsx` | Today's sort button and glyph (§6.2) |
| `Pagination.tsx` | Moved from `components/Pagination.tsx`, now reading the table (§6.3) |

### 6.2 `TableView` and `SortHeader`

- `<table className="w-full border-collapse bg-white text-left text-sm shadow-sm">`, a header row
  `border-b border-slate-200`, body rows `border-b border-slate-100`.
- `<th scope="col" className="p-3 font-medium text-slate-700">`. **`aria-sort` is rendered only
  when `column.getCanSort()`**: `"ascending"` / `"descending"` from `getIsSorted()`, otherwise
  `"none"`. Non-sortable headers carry no `aria-sort`, as today (D68).
- `<td>` takes its class from the column's `meta.cellClassName` (typed by the `columnMeta`
  slot, §6.1), defaulting to `"p-3"`. This preserves today's per-column `text-slate-600`.
- `getCanSort()` is true for **every accessor column** unless it opts out. Every column that is
  not sortable today must therefore be a display column (no accessor) or set
  `enableSorting: false`; otherwise it gains `aria-sort="none"` and a D68 regression.
- `SortHeader` renders `<button type="button">` with `onClick={column.getToggleSortingHandler()}`,
  the label, and `<span aria-hidden="true">` with ▲ / ▼ for the active column and a faint ↕ for
  the others. Classes are unchanged. The accessible name stays the plain label (amended D68).

### 6.3 Pagination through the table (D85)

**State, per list:**
`state.pagination = { pageIndex: page - 1, pageSize }` from the URL, `rowCount: data.count`.

**One change handler, shared by both lists** (in `lib/pagination.ts`, unit-tested):

```ts
export function routePaginationChange(
  updater: Updater<PaginationState>,
  current: PaginationState,
  to: { goToPage: (page: number) => void; setPageSize: (size: PageSize) => void },
): void;
```

- It resolves `updater` against `current`.
- If `pageSize` changed, it calls `setPageSize(next.pageSize)`: replace history, page reset,
  `resetScroll: false` (D47). It ignores the page index Table computed.
- Otherwise, if `pageIndex` changed, it calls `goToPage(next.pageIndex + 1)`, which pushes.

**`Pagination` component.** It reads the table context hook from `table-contexts.ts` (§6.1):

| Today | After |
|---|---|
| `count` | `table.getRowCount()` |
| page count | `max(1, table.getPageCount())` |
| current page | `state.pagination.pageIndex + 1`, clamped |
| First / Prev / page *n* / Next / Last | `firstPage()`, `previousPage()`, `setPageIndex(n - 1)`, `nextPage()`, `lastPage()` |
| disabled states | `!getCanPreviousPage()`, `!getCanNextPage()` |
| Rows per page | `setPageSize(n)` over `PAGE_SIZES` |

The markup, labels, `aria-current="page"`, the numbered window (`pageWindow()`, D49), the
per-page keys (D55), "first–last of count", and the "Page n of m" text below `sm` are all
unchanged. The page number is never written by Table itself (`autoResetPageIndex: false`).

### 6.4 Task table (D84)

Columns are defined at module scope in `features/tasks/task-columns.tsx` with
`createAppColumnHelper<TaskListItem>()`. The sortable columns' labels come from `SORT_FIELDS`
(D67's single model).

| Column id | Kind | Header | Sortable | Cell |
|---|---|---|---|---|
| `title` | accessor, `enableSorting: false` | "Title" | No | `TaskTitleLink`: a `Link` to the detail page with `state={{ tasksSearch }}`, the search read by `useSearch({ from: "/shell/tasks" })` (D70), plus `OverdueBadge` |
| `due_date` | accessor | `SortHeader` "Due date" | Yes | `formatDueDate`, or "—" (D76) |
| `status` | accessor | `SortHeader` "Status" | Yes | `StatusBadge` |
| `created_at` | accessor | `SortHeader` "Created" | Yes | `toLocaleDateString()` |
| `assignee` | accessor, `enableSorting: false` | "Assignee" | No | Full name, or "Unassigned" |
| `actions` | display | "Actions" | No | `TaskRowActions` |

- **State:** `{ sorting: orderingToSorting(search.ordering), pagination, columnVisibility: { assignee: showAssignee } }`,
  memoized on the URL values. The Assignee column is hidden for an Operator, as now.
- **`onSortingChange`:** resolve the updater, call `sortingToOrdering`, then the existing
  `setOrdering` (replace, page reset, D47; the default becomes `undefined`, D48).
  **`onPaginationChange`:** `routePaginationChange` (D85).
- **Stable inputs:** `data: data?.results ?? EMPTY_TASKS`, a module constant, so the row model is
  not invalidated on every render.
- **Layout:** `<table.AppTable>` wraps the table view (`hidden overflow-x-auto lg:block`), the
  cards (`lg:hidden`, `table.getRowModel().rows.map((row) => <TaskCard task={row.original} />)`)
  and `<table.Pagination />`. Breakpoints (D69), the `aria-busy` and opacity wrapper (D53), the
  empty state and the error states are unchanged.
- **`TaskSortSelect`** is unchanged: it still writes `ordering` through `setOrdering`.
- **`sorting.ts`** keeps `SORT_FIELDS`, `Ordering`, `SortDirection`, `DEFAULT_ORDERING`,
  `SORT_OPTIONS`, `isOrdering` and `parseOrdering`. `nextOrdering` is replaced by:
  - `orderingToSorting(ordering: string | undefined): SortingState`, where an unknown or absent
    value resolves to the default, shown as active;
  - `sortingToOrdering(sorting: SortingState): Ordering | undefined`, returning `undefined` for
    the default (D48).

### 6.5 User table

Columns: Name (`first last`), Email, Role (`ROLE_LABEL`, F13), Active ("Yes" / "No"), and Actions
(`UserRowActions`, a display column: an Edit `ButtonLink`, and Deactivate unless it is the actor's
own row, D66). The table sets `enableSorting: false`, so no header carries `aria-sort`. Pagination works as in §6.3. Cards below `md` render from
the row model; the breakpoint is unchanged.

---

## 7. Testing

### 7.1 The regression net

The 303 existing tests (19 files) drive the DOM against MSW, so they should pass **unchanged**.
The exceptions are listed in §7.2. Any other edit to an existing test must be
behaviour-neutral and justified in its commit message.

### 7.2 Tests that change on purpose

| File | Change |
|---|---|
| `src/test/render-app.tsx` (harness, not a test) | Renders `SessionProvider` instead of `AuthProvider` (§4.1). Its exports and behaviour are unchanged |
| `lib/useSearchParamDraft.test.ts` → `lib/useUrlFieldSync.test.ts` | The same seven cases (starts from the URL; commits once after 300 ms; ignores its own echo, even after more typing; takes a value it did not write and drops its pending commit; drops a pending commit on unmount; `cancel()`, which also schedules no commit; calls the latest `commit`). Plus: immediate mode; two writes in flight, where the first echo does not revert the second; an equal but rebuilt array is not a change |
| `components/Pagination.test.tsx` → `components/table/Pagination.test.tsx` | Mounts `Pagination` inside a small `useAppTable` harness; the same assertions |
| `features/tasks/sorting.test.ts` | The `nextOrdering` cases become `orderingToSorting` / `sortingToOrdering` cases. The header-click cycle is already covered by `TaskListPage.test.tsx` |

### 7.3 New tests, each written first

Each new test is written before the code it covers. A test for new code (a mapper, a store, the
pagination router) must fail first in the usual way. Three tests guard behaviour that `main`
already has and pass there by design: the re-submit test, the untouched user form, and
per-mount isolation. Their red step is on the migrated code: each must fail with its protection
removed (`clearServerErrors`, the snapshot, `useCreateStore`), which the commit records.

- `toServerErrors`: one case per rule in §5.2, including D75's "only when no rendered field has
  an error", and that a key outside `renderedFields` never reaches `fields`.
- `clearServerErrors` clears field errors as well as the form message.
- **An untouched task or user edit form keeps its loaded values across a focus refetch** (D81).
  Today's `useState` initialisers give this. The existing D40 test does not guard it on its own:
  with live defaults, both sides of its status comparison follow the refetch and it still passes.
- **Re-submit after a server error reaches the API**, for the task, user and login forms (D80).
  On `main` this passes trivially; it fails if `clearServerErrors` is left out.
- `toTaskInput`: D32 (omitted vs `null` assignee), D40 (status only when changed), D76 (the
  date).
- `orderingToSorting` and `sortingToOrdering`: a round trip for all six orderings, and default →
  `undefined`.
- `routePaginationChange`: a size change replaces and resets to page 1; a page move pushes; a
  no-op does nothing.
- The session store: `signOut` never rejects and always clears the user; `expire` clears the
  user; `settle` ends loading.
- The delete-flow slice: `begin`, `fail` and `cancel`.
- **Per-mount isolation:** open a delete dialog, navigate away and back, and the dialog is
  closed.

### 7.4 Gates (each phase, and at the end)

| Gate | Pass condition |
|---|---|
| `npm run typecheck` | Clean |
| `npm run lint` | Exit 0, no warnings beyond today's five |
| `npm run test` | All pass |
| `npm run build` | Succeeds; the gzip size of the JS bundle before and after is recorded (§9.2) |
| `npm ls @tanstack/store` | One version |

---

## 8. Browser QA re-test (Playwright)

The refactor touches every screen, so after implementation the **whole** QA report matrix is
re-run in a browser, not only the fixed findings.

**Environment.** The Compose stack runs the backend, worker, beat, db, redis and mailhog.
Chromium via Playwright MCP.

1. **Baseline first.** While the Compose `frontend` service still serves `main` (`59ce235`), take
   fresh baseline screenshots of both filter panels, both lists (table and cards) and the three
   forms at 360, 768 and 1280. The QA report's §6 screenshots predate iteration 5 (role labels,
   the sort select below `lg`), so they are not a valid baseline.
2. **Then the branch.** Stop the Compose `frontend` service: it bind-mounts the main checkout,
   not the worktree. Run `npm run dev` natively from `.worktrees/refactor-tanstack/frontend` on
   `:5173`, the only origin `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` allow.

**Matrix.** Everything in `docs/qa/2026-10-07-frontend-qa-report.md` §3: A1–A11, R1–R10,
D1–D5, L1–L20, T1–T20, U1–U16, §3.7 responsive at 360 / 768 / 1024 / 1280, and §3.8 console
hygiene. Plus the F1–F14 evidence checks of §7.1, and these refactor-specific checks:

| ID | Check |
|---|---|
| Q1 | After a server error, a second submit sends a second request and replaces the errors (task, user, login) |
| Q2 | The filter panels, lists and forms match the step 1 baseline at 360, 768 and 1280; Clear cancels a pending date commit |
| Q3 | The pager: a page move pushes (Back returns); a size change replaces and returns to page 1; focus stays on the clicked page (D55) |
| Q4 | Open a delete dialog, navigate away and back: the dialog is closed |
| Q5 | Task and user edit forms open across a window-focus refetch, after the record changed on the server: an untouched form keeps the values it loaded, and a touched one keeps the user's edits, including a changed status (D40, D81) |
| Q6 | No new console warnings anywhere, including none from store updates during render |

**Record.** A new section, "## 8. Re-test (TanStack refactor)", in the QA report, in §7's
format: a metadata table (commit, environment, browser, roles), a findings and evidence table,
the gates table, screenshots prefixed `tanstack-`, and side effects and observations. A
regression found here is fixed on the branch, test first, before merge, and listed in the report
as found and fixed.

---

## 9. Delivery and documentation

### 9.1 Phases

One branch. Each phase ends with every §7.4 gate green and is committed in small steps, one
concern per commit.

| Phase | Work |
|---|---|
| 0 | This spec |
| 1 — Store | Add the three packages and check the single Store copy. Delete `App.tsx`, `App.css` and the three template assets. Session store and `SessionProvider` (replacing `AuthContext`, including in the test harness). The delete-flow slice, the task-actions and user-list stores, `useTaskActions`, the combobox store. Rows read the store |
| 2 — Forms | `components/form/` infrastructure and `server-errors.ts`. Then `LoginPage`, `UserForm` (with its D81 snapshot), and `TaskForm` last (D81, D32, D40, the combobox field) |
| 3 — Filters | `useUrlFieldSync` with its tests moved first. Then `TaskFilters` and the extracted `UserFilters`. Remove `useSearchParamDraft` |
| 4 — Tables | `components/table/` infrastructure, `Pagination` on the table, `routePaginationChange`, the sorting mappers. Then the user table, then the task table and cards |
| 5 — Docs | §9.2 |
| 6 — Browser QA | §8, and any fixes it calls for |

### 9.2 Repository docs

`main` reorganised the docs after this spec was approved (merged into the branch at `607262f`):
the decisions, overrides and limitations moved from `README.md` to `docs/TECHNICAL-DECISIONS.md`,
which reserves D79–D88 for this work, and the GenAI record moved to `docs/GENAI-WORKFLOW.md`.
The plan's Task 21 has the exact edits. In summary:

- **Decisions:** D79–D88 in `docs/TECHNICAL-DECISIONS.md`'s decision log (with their origin) and
  a rationale section "TanStack Form, Table and Store (D79–D88)", which includes the bundle sizes
  before and after; the Sources row; the decision counts; a headline bullet in `README.md`.
- **Deliberate overrides of AGENTS.md:** the "A fourth kind of state" row is rewritten as the
  state-ownership override. Frontend §4 names three kinds (Query, Context, `useState`); this
  project uses the URL for list view state, Form for drafts, Store for the session and per-mount
  feature UI state, and Query for server state. The row gives the reasons (D45, D79, D86, D87).
  `AGENTS.md` itself is not edited; it has been unchanged since the initial commit.
- **Known limitations:** Store is pre-1.0, an accepted risk. Exit criterion: at Store 1.0,
  re-check `createStore`, `useCreateStore`, `createStoreContext` and `useSelector`, then remove
  the note.
- **The state model elsewhere:** `docs/ARCHITECTURE.md`'s frontend diagram and state table,
  `frontend/README.md`'s layout, and `SUMMARY.md`'s state bullet and key numbers.
- **GenAI prompt and validation record:** the prompts in `docs-external/PROMPT-LOGS.md`, and how
  the output was validated (§7, §8) in `docs/GENAI-WORKFLOW.md`.

---

## 10. Alternatives considered

| Alternative | Why not |
|---|---|
| Call `useForm` / `useTable` / `createStore` inline in each component | Keeps the duplication the refactor exists to remove: the error mapping three times, the label / input / error markup about fifteen times |
| A project kit: a generic `<DataTable>`, our own `useAppForm`, `defineStore()` | `<DataTable>` grows props for cards, busy rows and sorting. Wrapping a pre-1.0 Store everywhere spreads its API churn through the kit |
| Store for shared state only; busy rows and errors from Query's mutation state | A coherent option. The owner chose the broad scope (§1.1) |
| Pagination outside Table, on the existing props | The owner chose one pagination model (§1.1). D85 keeps D47's navigation |
| Filters kept on `useSearchParamDraft`, outside Form | The owner chose one visual identity (§1.1). D82 keeps D46 and D50 |
| Form's `listeners.onChangeDebounceMs` for filter text | The pending commit cannot be cancelled, and it does not solve the echo (D82) |
| Passing the live task or user to `useAppForm` | A focus refetch would rewrite an untouched form (D81) |
| Letting every bound field display any `onServer` error it receives | Fields that show no error today (description, status, role, Active) would start to, and D75 would focus them instead of the alert (D80) |
| A single `lastWritten` value in `useUrlFieldSync`, as in D50 | Correct for typed text, but two quick checkbox clicks put two writes in flight and the first echo would briefly revert the second (D82) |
| TanStack Pacer for debouncing | A fourth library for two timers |

---

## 11. Out of scope

- Client-side validation and schema libraries (D79).
- New table features: a column-visibility UI, row selection, bulk actions, column resizing.
- TanStack Pacer.
- Type registration of the router (`useSearch` still returns `any` and is annotated at the call
  site).
- The dashboard (`StatsPage`), which has no forms, tables or local state.
- The backend.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Store is pre-1.0 and may change its API | The caret range on `0.11.x` admits patches only. One copy is shared with Form and Table. README exit criterion (§9.2) |
| Table v9 is a recent major | Pinned to `^9.2.6`. The installed type declarations and the guides the package ships are the reference; the docs site returned HTTP 500 during research |
| Unstable table inputs re-run the row model or loop | Features and columns at module scope, a constant empty-data fallback, state memoized on the URL values |
| jsdom cannot see layout or visual drift | The §8 browser re-test at four widths, with screenshots |
| A `useUrlFieldSync` queue entry is left behind when the router supersedes a navigation, so its echo never arrives. An external change (Back/Forward) to exactly that value, before our next echo, would then be taken as our own, and the field would stay out of step with the URL | Accepted: it needs a superseded navigation and then an external change to that exact value. Any later echo clears every entry queued before it, and any other external change clears the queue. Equal-value writes are never queued (§5.6) |
| Bundle size grows | Measured and recorded (§7.4, §9.2). No threshold is set; the numbers are reported |
