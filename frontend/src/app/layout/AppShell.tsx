import { Link, Outlet } from "@tanstack/react-router";

import { useAuth } from "../../features/auth/hooks/useAuth";
import { APP_NAME } from "../app-name";

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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          {/* Plain text, not an h1 (each page has its own) and not a link (the
              home page differs by role, and the menu already reaches it). */}
          <span className="font-semibold text-slate-900">{APP_NAME}</span>
          <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-4">
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
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
