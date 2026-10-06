import { Link, Outlet } from "@tanstack/react-router";

import { useAuth } from "../../features/auth/hooks/useAuth";

/**
 * Navigation reflects what the backend actually allows, so nobody is offered a
 * link that would 403 (F4). An Admin gets no Tasks or Dashboard link at all,
 * because D13 gives them no task surface.
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3"
        >
          {!isAdmin && (
            <>
              <Link to="/dashboard" className="text-sm font-medium text-slate-700">
                Dashboard
              </Link>
              <Link to="/tasks" className="text-sm font-medium text-slate-700">
                Tasks
              </Link>
            </>
          )}
          {isAdmin && (
            <Link to="/users" className="text-sm font-medium text-slate-700">
              Users
            </Link>
          )}
          <span className="ml-auto text-sm text-slate-500">{user?.email}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-medium text-slate-700"
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
