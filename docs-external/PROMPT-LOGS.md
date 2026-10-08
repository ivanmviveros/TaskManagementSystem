> Each prompt below is copied word for word. The **Generated files examples** under it are the
> spec, plan and code that came out of it, traced through the commits and merges that followed.
> They answer the brief's request to "show the output code (or a representative sample of it)".
> Links open the files as they are today, so later iterations may have changed them. Where a later
> iteration deleted or moved a file, an **as generated** link opens the original on GitHub, pinned
> to its commit, and the current file is named beside it. How the output was checked and corrected
> is in [GENAI-WORKFLOW.md](../docs/GENAI-WORKFLOW.md).

# Project brainstorming

```
Design a RESTful API for a simple task management system using Django + React.The API should allow users to:
- Create, read, update, and delete users.
- Create, read, update, and delete tasks.
- Assign tasks to users. Mark tasks as completed.
- Filter tasks based on status and due date.
- Background processing of tasks notifications trough email, sent on task update or scheduled for overdue tasks
- Users roles include Admin, Supervisor and Operator
-- Admin: users management
-- Supervisor: tasks management for any user
-- Operator:  tasks management for owned tasks, created or assigned by supervisor)

Minimal requirements:
Backend
- Python 3.12+ and Django 6+
- django-simple-history for audit logs
- uv as package manager
API Development:
- Use Django (Django REST Framework)
- JWT authentication
- Implement pagination in lists
- Support filtering tasks by status and due date.
- Implement rate limiting to prevent API abuse
- Background tasks processing using celery with redis as broker
- Authentication, authorization and validations for each operation, isolated from frontend validations
- Optimized queries using databse indexing and Django queries optimization (select_related or prefetch_related if required)
Database:
- Postgresql for data storage
- Database schema design for tasks and users, mermaid diagrams for docs
Unit test:
- Write unit tests for critical endpoints using pytest
-  Ensure at least 80% test coverage.
Dockerization:
- Provide Dockerfile and docker-compose.yml to setup local app and database.
Documentation:
- README.md in project root with setup instructions and relevant key implementation decisions (django apps structure, architecture, conventions, etc)
- drf-yasg for API documentation
Frontend
- React with responsive and user-friendly design
- Tanstack for routing and query server state
- Users and tasks CRUD based on backend api
- Login page
- Statistics dashboard related to tasks status

CI/CD
- Github actions workflow for lint (ruff), pytest and coverage on push, equivalent to pre-commit definition
Diagrams
- Documented architecture, database schema and workflows using mermaid

With the specification above start a brainstorming to define spec documents for project using /superpowers-extended-cc:brainstorming
```

Related skill: https://github.com/pcvelz/superpowers

**Generated files examples:**
- Design spec: [`docs/superpowers/specs/2026-10-05-task-management-system-design.md`](../docs/superpowers/specs/2026-10-05-task-management-system-design.md).
  It holds the user story, the architecture, the data model with Mermaid diagrams, the permission
  matrix, the API surface and the decision log. A reviewer subagent checked it twice before the
  engineer's review below.


# Specs review
```
After reviewing specs I need to address the following concerns:

- In accepted risks, "An Operator can delete assigned work" restrict operator delete to created task to avoid deletion of tasks created by a different user and assigned by supevisor
- In 3.2 Architecture, D8 and D9 should be reverted, the application should keep repositores architecture to maintain consistency with proposed backend architecture and consistency with services implementation. 3.3 D14 mentions created_by as audit but its also used for validate deletion of owned tasks.
- Implement uuidv7 for unique ids to improve securiy while keeping index performance

```

**Generated files examples:**
- Revised spec sections:
  - [§3.2 Architecture](../docs/superpowers/specs/2026-10-05-task-management-system-design.md#32-architecture): D8 and D9 restore the repository layer;
  - [§5.2.1 The repository contract](../docs/superpowers/specs/2026-10-05-task-management-system-design.md#521-the-repository-contract-d8a): the restored layer, defined as Protocols injected into the services;
  - [§6.6 UUIDv7 primary keys](../docs/superpowers/specs/2026-10-05-task-management-system-design.md#66-uuidv7-primary-keys-d28) (D28);
  - [§7.2 Rules this encodes](../docs/superpowers/specs/2026-10-05-task-management-system-design.md#72-rules-this-encodes): an Operator may delete only a task they created (D27, with D14 corrected).
- Code that implements them:
  - [`backend/apps/core/models.py`](../backend/apps/core/models.py): the UUIDv7 primary-key base model;
  - [`backend/apps/tasks/repositories.py`](../backend/apps/tasks/repositories.py): the `TaskRepository` Protocol and its ORM implementation;
  - [`backend/apps/core/permissions/classes.py`](../backend/apps/core/permissions/classes.py): `may_delete_task()` and `IsTaskCreator`, the D27 rule;
  - [`backend/apps/tasks/tests/test_api_delete_rules.py`](../backend/apps/tasks/tests/test_api_delete_rules.py): the delete-rule tests.

# Task planning

```
Continue with tasks planning considering DoD and conventions provided in backend/AGENTS.md and frontend/AGENTS.md using /superpowers-extended-cc:writing-plans

```

**Generated files examples:**
- Implementation plan: [`docs/superpowers/plans/2026-10-06-task-management-system.md`](../docs/superpowers/plans/2026-10-06-task-management-system.md).
  It has 53 test-first tasks, each with its code, commands and expected output.
- Task tracker: [`docs/superpowers/plans/2026-10-06-task-management-system.md.tasks.json`](../docs/superpowers/plans/2026-10-06-task-management-system.md.tasks.json): each task's status, updated during execution.


# Executing plan

```
/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-10-06-task-management-system.md

```

**Generated files examples:** the first full version of the app. A representative sample:
- Backend:
  - [`backend/apps/core/permissions/matrix.py`](../backend/apps/core/permissions/matrix.py): the permission matrix as data, deny by default;
  - [`backend/apps/tasks/services.py`](../backend/apps/tasks/services.py): the single write path, with notifications enqueued after commit;
  - [`backend/apps/tasks/selectors.py`](../backend/apps/tasks/selectors.py): role-scoped querysets and the single-query stats aggregation;
  - [`backend/apps/tasks/views.py`](../backend/apps/tasks/views.py): the task endpoints, and the composition root that injects the repository;
  - [`backend/apps/users/auth_views.py`](../backend/apps/users/auth_views.py): cookie-based JWT login, refresh rotation and logout;
  - [`backend/apps/core/throttling.py`](../backend/apps/core/throttling.py): scoped rate limits;
  - [`backend/apps/notifications/tasks.py`](../backend/apps/notifications/tasks.py): idempotent Celery email delivery and the hourly overdue sweep;
  - [`backend/apps/users/management/commands/seed_demo_data.py`](../backend/apps/users/management/commands/seed_demo_data.py): the demo data seeding command.
- Backend tests:
  - [`backend/apps/core/tests/test_permission_matrix_api.py`](../backend/apps/core/tests/test_permission_matrix_api.py): every matrix cell, exercised over HTTP;
  - [`backend/apps/tasks/tests/test_concurrency.py`](../backend/apps/tasks/tests/test_concurrency.py): `select_for_update` serialises two concurrent completions;
  - [`backend/apps/tasks/tests/test_query_counts.py`](../backend/apps/tasks/tests/test_query_counts.py): pinned query counts, so an N+1 fails a test;
  - [`backend/apps/core/tests/test_layering.py`](../backend/apps/core/tests/test_layering.py): the dependency direction between layers.
- Frontend:
  - [`frontend/src/lib/api-client.ts`](../frontend/src/lib/api-client.ts): access token in memory, single-flight refresh;
  - [`frontend/src/app/router.tsx`](../frontend/src/app/router.tsx): code-based routes with role landing redirects;
  - [`frontend/src/features/tasks/TaskListPage.tsx`](../frontend/src/features/tasks/TaskListPage.tsx): the task list with filters, pagination and responsive cards;
  - [`frontend/src/features/dashboard/StatsPage.tsx`](../frontend/src/features/dashboard/StatsPage.tsx): the statistics dashboard;
  - [`frontend/src/test/setup.ts`](../frontend/src/test/setup.ts): the console guard that fails any test that logs.
- Infrastructure:
  - [`docker-compose.yml`](../docker-compose.yml) and [`backend/Dockerfile`](../backend/Dockerfile);
  - [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): lint, compat, backend and frontend jobs with the 80% coverage gate;
  - [`.pre-commit-config.yaml`](../.pre-commit-config.yaml).

## Refinement
```
After reviewveng current code and application features, I need to implement new iteration of brainstorming, planning and refinement regarding the following concerns:
- use pydantic for data validation instead of plain dicts
- add amount of generated seeding data and users as input for management command, the tasks should be randomly assigned, admin username its fixed to allow login to find the random generated usernames, include instructions in README.md
- debug @console.log warnings and errors ocurred in login page for anonymous users
- refactor users table to match the tasks table responsive behaivor
- pre-push stage in pre-commit its failing since its running pytest with local uv instead of docker compose, project default for development should be docker compose, add a fallback to allow success in stage if pytest result its successful in local or docker compose environment
```

**Generated files examples:**
- Spec: [`docs/superpowers/specs/2026-10-06-refinement-iteration-2-design.md`](../docs/superpowers/specs/2026-10-06-refinement-iteration-2-design.md)
- Plan (18 tasks): [`docs/superpowers/plans/2026-10-06-refinement-iteration-2.md`](../docs/superpowers/plans/2026-10-06-refinement-iteration-2.md)
- Pydantic:
  - [`backend/apps/tasks/dto.py`](../backend/apps/tasks/dto.py) and [`backend/apps/users/dto.py`](../backend/apps/users/dto.py): typed DTOs at the service boundary;
  - [`backend/apps/core/tests/test_layering.py`](../backend/apps/core/tests/test_layering.py): a guard against `dict` parameters returning to the service layer.
- Seeding:
  - [`backend/apps/users/management/commands/seed_demo_data.py`](../backend/apps/users/management/commands/seed_demo_data.py): the `--users` and `--tasks` flags;
  - [`backend/apps/users/tests/test_seed_command.py`](../backend/apps/users/tests/test_seed_command.py).
- Login console errors:
  - `frontend/src/features/auth/AuthContext.tsx` ([as generated](https://github.com/ivanmviveros/TaskManagementSystem/blob/00b49d258f81863d6280a6d2ec28e83f2a801724/frontend/src/features/auth/AuthContext.tsx)): bootstraps the session refresh-first instead of probing `/users/me/`. The TanStack refactor moved that bootstrap to [`SessionProvider.tsx`](../frontend/src/features/auth/SessionProvider.tsx);
  - [`frontend/src/lib/api-client.ts`](../frontend/src/lib/api-client.ts): exports the single-flighted `refreshSession`.
- Users table: `frontend/src/features/users/components/UserTable.tsx` ([as generated](https://github.com/ivanmviveros/TaskManagementSystem/blob/a2f8350cb254b54472a3cbc0e5454415fbe2e828/frontend/src/features/users/components/UserTable.tsx)) and [`UserCard.tsx`](../frontend/src/features/users/components/UserCard.tsx). The table is now built from [`user-columns.tsx`](../frontend/src/features/users/user-columns.tsx) on the shared TanStack table.
- Pre-push fallback: [`scripts/run-backend-tests.sh`](../scripts/run-backend-tests.sh), called from [`.pre-commit-config.yaml`](../.pre-commit-config.yaml).


## Bugfixing
```
Analyze and design fixes for the following issues found:

- add missing confirmation modal for task deletion
- in task edit, for a completed task, the task status its shown as PENDING in selector and patch request on edit is sent with COMPLETED status
- adjuts dashboard design, add call to action buttons in dashboard cards and extend "Due in 7 days" card to cover full row and avoid the  bottom row to contain only 1 column
- check github actions compat step failed by test coverage in https://github.com/ivanmviveros/TaskManagementSystem/actions/runs/37559034429/job/112591873156, use gh cli to test changes in the actions
```

**Generated files examples:**
- Spec: [`docs/superpowers/specs/2026-10-06-iteration-3-fixes-design.md`](../docs/superpowers/specs/2026-10-06-iteration-3-fixes-design.md)
- Plan (9 tasks): [`docs/superpowers/plans/2026-10-06-iteration-3-fixes.md`](../docs/superpowers/plans/2026-10-06-iteration-3-fixes.md)
- Delete confirmation: [`frontend/src/features/tasks/components/DeleteTaskDialog.tsx`](../frontend/src/features/tasks/components/DeleteTaskDialog.tsx), used by the list and by [`TaskDetailPage.tsx`](../frontend/src/features/tasks/TaskDetailPage.tsx).
- Completed-task status:
  - [`backend/apps/tasks/serializers.py`](../backend/apps/tasks/serializers.py): `allowed_transitions` on the task detail;
  - [`frontend/src/features/tasks/components/TaskForm.tsx`](../frontend/src/features/tasks/components/TaskForm.tsx): terminal statuses shown read-only, and the status sent only when it changed.
- Dashboard:
  - [`frontend/src/features/dashboard/components/StatTile.tsx`](../frontend/src/features/dashboard/components/StatTile.tsx): the "View tasks" call to action;
  - [`frontend/src/features/dashboard/StatsPage.tsx`](../frontend/src/features/dashboard/StatsPage.tsx): "New task", and the full-row due-soon card.
- CI: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): compat's one-module smoke step runs without the coverage gate.


## Frontend improvements

```
using /superpowers-extended-cc:using-git-worktrees  and /superpowers-extended-cc:brainstorming, analyze and plan required changes for the following frontend improvements:

- include pagination steps component in lists to allow easier navigation between pages, pages number as "first, prev, 1, 3, 5(current), 7, 10, next, last"
- include page size in filter parameters according to backend max_page_size of 100, available page sizes (10, 20, 50, 100)
- include URL params during lists filtering, the params are included only when the filter comes from dashboard cards

```

**Generated files examples:**
- Spec: [`docs/superpowers/specs/2026-10-06-list-navigation-design.md`](../docs/superpowers/specs/2026-10-06-list-navigation-design.md). [§1.1](../docs/superpowers/specs/2026-10-06-list-navigation-design.md#11-choices-made-by-the-project-owner) records the owner's choices: a contiguous page window, and URL state on both lists.
- Plan (12 tasks): [`docs/superpowers/plans/2026-10-06-list-navigation.md`](../docs/superpowers/plans/2026-10-06-list-navigation.md)
- Code:
  - [`frontend/src/lib/pagination.ts`](../frontend/src/lib/pagination.ts): the page window and the page sizes the API allows;
  - `frontend/src/components/Pagination.tsx` ([as generated](https://github.com/ivanmviveros/TaskManagementSystem/blob/8940bd27229f1bd9773b1011ea845bf9e9b61d89/frontend/src/components/Pagination.tsx)): the numbered pager with a rows-per-page choice. The TanStack refactor moved it to [`components/table/Pagination.tsx`](../frontend/src/components/table/Pagination.tsx), where it reads the table's pagination model;
  - [`frontend/src/app/search-params.ts`](../frontend/src/app/search-params.ts): validates list search params in one module and keeps defaults out of URLs;
  - `frontend/src/lib/useSearchParamDraft.ts` ([as generated](https://github.com/ivanmviveros/TaskManagementSystem/blob/545f982c5e3089e16c951ae69e208cd8c84d33d7/frontend/src/lib/useSearchParamDraft.ts)): a debounced draft for text filters bound to the URL. It was replaced by [`useUrlFieldSync.ts`](../frontend/src/lib/useUrlFieldSync.ts) (D82);
  - [`frontend/src/features/tasks/TaskListPage.tsx`](../frontend/src/features/tasks/TaskListPage.tsx) and [`frontend/src/features/users/UserListPage.tsx`](../frontend/src/features/users/UserListPage.tsx): filters, sort, page and page size held in the URL.
- Tests: `frontend/src/components/Pagination.test.tsx` ([as generated](https://github.com/ivanmviveros/TaskManagementSystem/blob/8940bd27229f1bd9773b1011ea845bf9e9b61d89/frontend/src/components/Pagination.test.tsx), now [`components/table/Pagination.test.tsx`](../frontend/src/components/table/Pagination.test.tsx)) and [`frontend/src/app/search-params.test.ts`](../frontend/src/app/search-params.test.ts).

```
I identify another minor issue, browser tabs aren't showing current page name, "dashboard, tasks, users, detail, etc"
```

**Generated files examples:**
- Spec addition: [§6 Page titles](../docs/superpowers/specs/2026-10-06-list-navigation-design.md#6-page-titles-d57-d58) in the list navigation spec (D57, D58).
- Code:
  - [`frontend/src/app/router.tsx`](../frontend/src/app/router.tsx): a title for each route;
  - [`frontend/index.html`](../frontend/index.html): the static `<title>` removed, so the route title wins;
  - [`frontend/src/app/page-titles.test.tsx`](../frontend/src/app/page-titles.test.tsx).

```
Continue improvement iteration with the following issues:

-The delete dialog doesn't take focus. Focus stays on the page's Delete button, so a keyboard user has to Tab out to reach Cancel or Delete, and Escape doesn't close it. The users dialog behaves the same way.
-"New task" takes two Tab presses, because the header nests a button inside a link. The task and user list headers do the same.
-The assignee picker lists only the first 100 users. With ~500 seeded, many users can't be chosen at all.
-Deleting from the detail page logs a console error. The app re-requests the deleted task (404) just before moving to /tasks.
-Stop the stale-code problem: turn on Vite's polling file watcher, only when running in the Compose container, so native npm run dev stays fast.
```

**Generated files examples:** fixed directly, without a separate spec or plan, and recorded as
[D59–D63](../docs/TECHNICAL-DECISIONS.md#fixes-from-the-browser-check-d59d63).
- Dialog focus: [`frontend/src/components/useModalDialog.ts`](../frontend/src/components/useModalDialog.ts), used by [`DeleteTaskDialog.tsx`](../frontend/src/features/tasks/components/DeleteTaskDialog.tsx) and [`DeleteUserDialog.tsx`](../frontend/src/features/users/components/DeleteUserDialog.tsx).
- One Tab stop: [`frontend/src/components/ButtonLink.tsx`](../frontend/src/components/ButtonLink.tsx): a link styled as a button, replacing the nested button.
- All assignable users:
  - [`backend/apps/users/views.py`](../backend/apps/users/views.py): `GET /users/assignable/`;
  - [`backend/apps/users/tests/test_api_assignable.py`](../backend/apps/users/tests/test_api_assignable.py).
- No 404 after delete: [`frontend/src/features/tasks/hooks/useTaskMutations.ts`](../frontend/src/features/tasks/hooks/useTaskMutations.ts).
- Polling only in Compose: [`frontend/vite.config.ts`](../frontend/vite.config.ts) and [`docker-compose.yml`](../docker-compose.yml).

```
Refactor assigned user selector component to allow user inline search and pagination instead of the complete list of assignable users
```

**Generated files examples:** recorded as [D64](../docs/TECHNICAL-DECISIONS.md#the-assignee-picker-searches-as-you-type-d64).
- [`frontend/src/features/tasks/components/AssigneeCombobox.tsx`](../frontend/src/features/tasks/components/AssigneeCombobox.tsx): a searchable, paged ARIA combobox;
- [`frontend/src/features/users/hooks/useAssignableUsers.ts`](../frontend/src/features/users/hooks/useAssignableUsers.ts): the search query, page by page;
- [`frontend/src/lib/useDebouncedValue.ts`](../frontend/src/lib/useDebouncedValue.ts): one request per typing pause;
- [`backend/apps/users/views.py`](../backend/apps/users/views.py): search on `/users/assignable/`.

```
Fix the choosing "Unassigned" when editing a task leaving the old assignee in place, caused by the edit request skiping an empty assignee.
```

**Generated files examples:** recorded as [D65](../docs/TECHNICAL-DECISIONS.md#no-assignee-and-not-yours-to-choose-are-different-d65).
- [`frontend/src/features/tasks/components/TaskForm.tsx`](../frontend/src/features/tasks/components/TaskForm.tsx) and [`TaskFormPage.tsx`](../frontend/src/features/tasks/TaskFormPage.tsx): "Unassigned" sends `assignee: null`, which the API treats differently from omitting the field;
- [`frontend/src/features/tasks/TaskForm.test.tsx`](../frontend/src/features/tasks/TaskForm.test.tsx).

```
Add an app title "Task management system" in the main component to the left of menus
```

**Generated files examples:**
- [`frontend/src/app/app-name.ts`](../frontend/src/app/app-name.ts): the name, kept in one constant;
- [`frontend/src/app/layout/ShellLayout.tsx`](../frontend/src/app/layout/ShellLayout.tsx): renders it left of the menu. The header was moved here from `AppShell.tsx` in iteration 5;
- [`frontend/src/app/layout/AppShell.test.tsx`](../frontend/src/app/layout/AppShell.test.tsx).

## Final review

```
Following  features specs in @docs\superpowers\specs:
- Do a complete analysis of frontend features, pages and components, using playwrigth mcp and generating a final report with validations performed and results. The analysis should be oriented to correct responsive behavior, forms validations and navigability
- Do a complete test suite run for frontend and backend and include in report, include coverage.
```

**Generated files examples:**
- QA report: [`docs/qa/2026-10-07-frontend-qa-report.md`](../docs/qa/2026-10-07-frontend-qa-report.md), with its [validations performed](../docs/qa/2026-10-07-frontend-qa-report.md#3-validations-performed) and [test suites with coverage](../docs/qa/2026-10-07-frontend-qa-report.md#4-automated-test-suites).
- Playwright screenshots at 360, 768 and 1280 px, for example
  [`sup-tasks-list-360.png`](../docs/qa/screenshots/sup-tasks-list-360.png),
  [`sup-dashboard-768.png`](../docs/qa/screenshots/sup-dashboard-768.png) and
  [`admin-users-list-1280.png`](../docs/qa/screenshots/admin-users-list-1280.png).

```
I have a potential issue to add to findings, there its no indication of sort ordering in tables, the sort its applied but nothing in UI shows short direction
```

**Generated files examples:**
- Finding [F6](../docs/qa/2026-10-07-frontend-qa-report.md#f6--no-indication-of-sort-column-or-direction-medium) in the QA report, with screenshot evidence: [`sup-tasks-sort-none-1280.png`](../docs/qa/screenshots/sup-tasks-sort-none-1280.png) and [`sup-tasks-sort--due_date-1280.png`](../docs/qa/screenshots/sup-tasks-sort--due_date-1280.png) show identical headers.
- The fix, from iteration 5:
  - [`frontend/src/features/tasks/sorting.ts`](../frontend/src/features/tasks/sorting.ts);
  - `frontend/src/features/tasks/components/TaskTable.tsx` ([as generated](https://github.com/ivanmviveros/TaskManagementSystem/blob/38de9e270d8f1d240da02cbdb9690b90fa293898/frontend/src/features/tasks/components/TaskTable.tsx)): `aria-sort` and a direction arrow on the active column. The TanStack refactor moved the arrow to [`components/table/SortHeader.tsx`](../frontend/src/components/table/SortHeader.tsx) and `aria-sort` to [`components/table/TableView.tsx`](../frontend/src/components/table/TableView.tsx);
  - re-test screenshot [`iter5-sort-header-1280.png`](../docs/qa/screenshots/iter5-sort-header-1280.png).

```
Based in @docs/qa/2026-10-07-frontend-qa-report.md  reasearch and plan fixes for each finding using /superpowers-extended-cc:brainstorming
```

**Generated files examples:**
- Spec: [`docs/superpowers/specs/2026-10-07-qa-fixes-iteration-5-design.md`](../docs/superpowers/specs/2026-10-07-qa-fixes-iteration-5-design.md)
- Plan (15 tasks): [`docs/superpowers/plans/2026-10-07-qa-fixes-iteration-5.md`](../docs/superpowers/plans/2026-10-07-qa-fixes-iteration-5.md)
- Code, one example per finding group ([D66–D78](../docs/TECHNICAL-DECISIONS.md#fixes-from-the-qa-report-d66d78)):
  - [`backend/apps/core/permissions/classes.py`](../backend/apps/core/permissions/classes.py): `IsNotSelf`, so an Admin cannot delete, demote or deactivate their own account (D66). Tested in [`test_permission_classes.py`](../backend/apps/core/tests/test_permission_classes.py);
  - [`frontend/src/features/tasks/components/TaskSortSelect.tsx`](../frontend/src/features/tasks/components/TaskSortSelect.tsx): sorting on phones and tablets (D69);
  - [`frontend/src/app/history-state.ts`](../frontend/src/app/history-state.ts): returns to the same filtered, paged, sorted list (D70);
  - [`frontend/src/app/layout/AppNotFound.tsx`](../frontend/src/app/layout/AppNotFound.tsx): not-found pages that explain and lead back (D71, D72);
  - [`frontend/src/app/useRouterAuthSync.ts`](../frontend/src/app/useRouterAuthSync.ts): no route loads while auth is still loading (D74);
  - [`frontend/src/components/useFocusFirstError.ts`](../frontend/src/components/useFocusFirstError.ts): focus moves to the first error after a failed submit (D75);
  - [`frontend/src/lib/dates.ts`](../frontend/src/lib/dates.ts): due dates shown as the UTC day the form edits (D76);
  - [`frontend/src/features/tasks/components/TaskFilters.tsx`](../frontend/src/features/tasks/components/TaskFilters.tsx): an impossible date range is explained (D78).
- Re-test: [§7 of the QA report](../docs/qa/2026-10-07-frontend-qa-report.md#7-re-test-iteration-5).


## Refactors

```
using a worktree and superpowers brainstorming /superpowers-extended-cc:brainstorming  /superpowers-extended-cc:using-git-worktrees , I want to explore possible refactor to implement tanstack table, form and store libraries replacing the manually made forms and tables, and the local state of component
```

**Generated files examples:** a spec, a 23-task plan, then one commit per test-first step, merged
in `e689028`. Each example below names the commit that introduced it.
- Spec (D79–D88): [`docs/superpowers/specs/2026-10-07-tanstack-form-table-store-design.md`](../docs/superpowers/specs/2026-10-07-tanstack-form-table-store-design.md) (`e5c7294`)
- Plan (23 tasks): [`docs/superpowers/plans/2026-10-07-tanstack-form-table-store.md`](../docs/superpowers/plans/2026-10-07-tanstack-form-table-store.md) (`3663766`)
- Dependencies: [`frontend/package.json`](../frontend/package.json) adds TanStack Form, Table and Store, and drops the unused Vite template `App` (`31f5f81`).
- Store (D86–D88):
  - [`frontend/src/features/auth/session-store.ts`](../frontend/src/features/auth/session-store.ts) and [`SessionProvider.tsx`](../frontend/src/features/auth/SessionProvider.tsx): one session store replaces `AuthContext`, and `useAuth()` keeps its shape (`364af0d`);
  - [`frontend/src/lib/delete-flow.ts`](../frontend/src/lib/delete-flow.ts): a generic delete-dialog store slice (`f4fc336`);
  - [`frontend/src/features/tasks/task-actions-store.ts`](../frontend/src/features/tasks/task-actions-store.ts): the task list and detail UI state, in a store created per mount (`96eec56`);
  - [`frontend/src/features/tasks/components/assignee-combobox-store.ts`](../frontend/src/features/tasks/components/assignee-combobox-store.ts): the assignee picker's open, query and active-option state (`2567f53`).
- Forms (D79–D81):
  - [`frontend/src/components/form/app-form.ts`](../frontend/src/components/form/app-form.ts) and [`fields/`](../frontend/src/components/form/fields/): the app form hook and its bound field components (`6596c22`);
  - [`frontend/src/components/form/server-errors.ts`](../frontend/src/components/form/server-errors.ts): one server-error mapper for every form (`f64a384`);
  - [`frontend/src/features/tasks/task-form-values.ts`](../frontend/src/features/tasks/task-form-values.ts): the task form's snapshot and payload, as pure functions (`36d3c62`);
  - [`frontend/src/features/tasks/components/TaskForm.tsx`](../frontend/src/features/tasks/components/TaskForm.tsx): the task form on the app form, built from its snapshot (`47855b5`).
- Filters (D82):
  - [`frontend/src/lib/useUrlFieldSync.ts`](../frontend/src/lib/useUrlFieldSync.ts): keeps form fields in step with the URL, replacing `useSearchParamDraft` (`18f1002`, with its echo fix in `edb6d44`);
  - [`frontend/src/features/tasks/components/TaskFilters.tsx`](../frontend/src/features/tasks/components/TaskFilters.tsx) and [`frontend/src/features/users/components/UserFilters.tsx`](../frontend/src/features/users/components/UserFilters.tsx): the filter panels, rebuilt as forms (`43de9c7`, `d075921`).
- Tables (D83–D85):
  - [`frontend/src/components/table/app-table.ts`](../frontend/src/components/table/app-table.ts), [`TableView.tsx`](../frontend/src/components/table/TableView.tsx) and [`SortHeader.tsx`](../frontend/src/components/table/SortHeader.tsx): the app table, built with `createTableHook` (`9d15fe8`);
  - [`frontend/src/features/tasks/sorting.ts`](../frontend/src/features/tasks/sorting.ts): maps the URL ordering to and from the table's sort state (`a705c83`);
  - [`frontend/src/lib/pagination.ts`](../frontend/src/lib/pagination.ts): `routePaginationChange` turns a page move into a push and a size change into a replace (`fc3cb0f`);
  - [`frontend/src/features/tasks/task-columns.tsx`](../frontend/src/features/tasks/task-columns.tsx) and [`frontend/src/features/users/user-columns.tsx`](../frontend/src/features/users/user-columns.tsx): the column definitions for both lists (`f452dd6`, `bcc380d`).
- Tests: [`useUrlFieldSync.test.ts`](../frontend/src/lib/useUrlFieldSync.test.ts), [`server-errors.test.ts`](../frontend/src/components/form/server-errors.test.ts), [`session-store.test.ts`](../frontend/src/features/auth/session-store.test.ts) and [`task-form-values.test.ts`](../frontend/src/features/tasks/task-form-values.test.ts).
- A bug found in use during the refactor: [`backend/apps/tasks/serializers.py`](../backend/apps/tasks/serializers.py) lets a task held by a deleted user be edited again ([D94](../docs/TECHNICAL-DECISIONS.md#fixes-found-in-use)) (`465a8fc`).
- Docs:
  - [the decision record for D79–D88](../docs/TECHNICAL-DECISIONS.md#tanstack-form-table-and-store-d79d88) (`82810c4`);
  - [the QA re-test, §8](../docs/qa/2026-10-07-frontend-qa-report.md#8-re-test-tanstack-refactor) (`46cc54e`): no regression, and 18 of 21 screenshot pairs pixel-identical to the baseline. For example, [`tanstack-baseline-tasks-360.png`](../docs/qa/screenshots/tanstack-baseline-tasks-360.png) before and [`tanstack-tasks-360.png`](../docs/qa/screenshots/tanstack-tasks-360.png) after.

```
Implement structured logs in backend with request-id using context variables to help identify same request logs /superpowers-extended-cc:using-git-worktrees
```

**Generated files examples:** built test-first in an isolated worktree, without a separate spec
or plan, and recorded as [D89–D93](../docs/TECHNICAL-DECISIONS.md#structured-logs-and-the-request-id-d89d93).
- [`backend/apps/core/request_context.py`](../backend/apps/core/request_context.py): the request id held in a `ContextVar`;
- [`backend/apps/core/middleware.py`](../backend/apps/core/middleware.py): `RequestIdMiddleware` keeps a well-formed `X-Request-ID` or mints a UUIDv7, and writes one access line per request;
- [`backend/apps/core/log_formatting.py`](../backend/apps/core/log_formatting.py): `RequestIdFilter` and `JsonFormatter`, using the standard library only;
- [`backend/apps/core/celery_context.py`](../backend/apps/core/celery_context.py): carries the id into Celery tasks as a message header;
- [`backend/config/settings/base.py`](../backend/config/settings/base.py): the `LOGGING` configuration;
- Tests: [`test_request_id_middleware.py`](../backend/apps/core/tests/test_request_id_middleware.py), [`test_celery_context.py`](../backend/apps/core/tests/test_celery_context.py) and [`test_log_formatting.py`](../backend/apps/core/tests/test_log_formatting.py).
