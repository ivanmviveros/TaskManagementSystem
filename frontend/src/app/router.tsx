import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import type { AuthState } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import type { Role } from "../features/auth/types";
import { DashboardPage } from "../features/tasks/DashboardPage";
import { TaskListPage } from "../features/tasks/TaskListPage";
import { UserListPage } from "../features/users/UserListPage";
import { AppShell } from "./layout/AppShell";

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

// The root route needs an explicit component: without one it renders nothing and
// no child route ever appears.
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
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
  component: DashboardPage,
  beforeLoad: guard("/dashboard"),
});

const tasksRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/tasks",
  component: TaskListPage,
  beforeLoad: guard("/tasks"),
});

const usersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/users",
  component: UserListPage,
  beforeLoad: guard("/users"),
});

// Task 47 and 48 register /tasks/new, /tasks/$taskId, /users/new and
// /users/$userId here. The static "new" segments must come BEFORE their $id
// siblings so "new" is never captured as an id.
const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([indexRoute, dashboardRoute, tasksRoute, usersRoute]),
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
    ...(options.history === undefined ? {} : { history: options.history }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
