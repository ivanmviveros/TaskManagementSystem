import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import type { AuthState } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import type { Role } from "../features/auth/types";
import { StatsPage } from "../features/dashboard/StatsPage";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage";
import { TaskCreatePage, TaskEditPage } from "../features/tasks/TaskFormPage";
import { TaskListPage } from "../features/tasks/TaskListPage";
import { UserCreatePage, UserEditPage } from "../features/users/UserFormPage";
import { UserListPage } from "../features/users/UserListPage";
import { DEFAULT_PAGE_SIZE } from "../lib/pagination";
import { APP_NAME } from "./app-name";
import { AppNotFound } from "./layout/AppNotFound";
import { AppShell } from "./layout/AppShell";
import { validateTaskListSearch, validateUserListSearch } from "./search-params";

/**
 * Route guards are UX ONLY (root AGENTS.md §4). They prevent a confusing blank
 * screen or a guaranteed 403; they are not an access-control mechanism. The
 * backend enforces every rule regardless of what this SPA renders, and the
 * matrix suite in apps/core/tests/test_permission_matrix_api.py proves it.
 */
const LANDING_FOR_ROLE: Record<Role, string> = {
  ADMIN: "/users", // an Admin has no dashboard: D13 gives them no task surface
  SUPERVISOR: "/dashboard",
  OPERATOR: "/dashboard",
};

const ROUTE_ROLES: Record<string, Role[]> = {
  "/dashboard": ["SUPERVISOR", "OPERATOR"],
  "/tasks": ["SUPERVISOR", "OPERATOR"],
  "/tasks/new": ["SUPERVISOR", "OPERATOR"],
  "/tasks/$taskId": ["SUPERVISOR", "OPERATOR"],
  "/users": ["ADMIN"],
  "/users/new": ["ADMIN"],
  "/users/$userId": ["ADMIN"],
};

export interface RouterContext {
  auth: AuthState;
}

/** A route's tab title: the page first, so it survives a narrow tab (D57). */
function pageTitle(page: string) {
  return () => ({ meta: [{ title: `${page} · ${APP_NAME}` }] });
}

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
  // D71: a thrown notFound() finds the root as the nearest route with a
  // notFoundComponent, so AppNotFound (which wraps ShellLayout itself) never
  // renders inside AppShell's Outlet and the header cannot double.
  notFoundComponent: AppNotFound,
});

/** Redirect to /login when nobody is signed in, or to the role's landing page. */
function guard(routeId: string) {
  return ({ context }: { context: RouterContext }) => {
    const { user, isLoading } = context.auth;
    if (isLoading) return;
    if (user === null) throw redirect({ to: "/login" });
    const allowed = ROUTE_ROLES[routeId];
    if (allowed !== undefined && !allowed.includes(user.role)) {
      throw redirect({ to: LANDING_FOR_ROLE[user.role] });
    }
  };
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
  head: pageTitle("Sign in"),
  beforeLoad: ({ context }) => {
    // Already signed in: there is nothing to log in to.
    const { user, isLoading } = context.auth;
    if (!isLoading && user !== null) throw redirect({ to: LANDING_FOR_ROLE[user.role] });
  },
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  beforeLoad: ({ context }) => {
    const { user, isLoading } = context.auth;
    if (isLoading) return;
    if (user === null) throw redirect({ to: "/login" });
    throw redirect({ to: LANDING_FOR_ROLE[user.role] });
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/dashboard",
  component: StatsPage,
  beforeLoad: guard("/dashboard"),
  head: pageTitle("Dashboard"),
});

const tasksRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tasks",
  component: TaskListPage,
  beforeLoad: guard("/tasks"),
  head: pageTitle("Tasks"),
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
  head: pageTitle("Users"),
  validateSearch: validateUserListSearch,
  search: { middlewares: [stripSearchParams({ page: 1, page_size: DEFAULT_PAGE_SIZE })] },
});

// The static "new" segment is registered BEFORE its $taskId sibling, so "new"
// is never captured as an id.
const taskCreateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tasks/new",
  component: TaskCreatePage,
  beforeLoad: guard("/tasks/new"),
  head: pageTitle("New task"),
});

const taskDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tasks/$taskId",
  component: TaskDetailPage,
  beforeLoad: guard("/tasks/$taskId"),
  head: pageTitle("Task details"),
});

const taskEditRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tasks/$taskId/edit",
  component: TaskEditPage,
  beforeLoad: guard("/tasks/$taskId"),
  head: pageTitle("Edit task"),
});

// Again the static segment first, so "new" is never read as a user id.
const userCreateRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users/new",
  component: UserCreatePage,
  beforeLoad: guard("/users/new"),
  head: pageTitle("New user"),
});

const userEditRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users/$userId",
  component: UserEditPage,
  beforeLoad: guard("/users/$userId"),
  head: pageTitle("Edit user"),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([
    indexRoute,
    dashboardRoute,
    tasksRoute,
    taskCreateRoute,
    taskDetailRoute,
    taskEditRoute,
    usersRoute,
    userCreateRoute,
    userEditRoute,
  ]),
]);

/**
 * Create the router ONCE and let `RouterProvider`'s `context` prop deliver the
 * current auth state. Re-creating the router whenever auth changed looked
 * simpler but does not work: handing RouterProvider a new router instance does
 * not re-run navigation, so nothing renders at all.
 *
 * `history` is supplied only by tests, which use a memory history.
 */
export function createAppRouter(auth: AuthState, options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    context: { auth },
    defaultPreload: false,
    // D71: unmatched paths render at the root — under the default "fuzzy" mode,
    // /tasks/a/b would render inside AppShell and /does-not-exist outside it, and
    // one component cannot be right in both places. The component itself is the
    // root route's notFoundComponent.
    notFoundMode: "root",
    ...(options.history === undefined ? {} : { history: options.history }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
