import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "../../features/auth/hooks/useAuth";
import { APP_NAME } from "../app-name";

/**
 * 44px targets (F14) with the header's vertical padding moved into them, so the
 * header keeps its height. The active link's 2px bottom border sits on the
 * header's bottom edge, like a tab (F7). Colours come from activeProps and
 * inactiveProps rather than the base class, so two border colours never compete
 * on one element (clsx would keep both, and CSS order would decide).
 */
const NAV_LINK = "inline-flex min-h-11 items-center border-b-2 text-sm font-medium";
const NAV_ACTIVE = { className: "border-status-progress text-slate-900" };
const NAV_INACTIVE = { className: "border-transparent text-slate-700 hover:text-slate-900" };

/**
 * The signed-in page frame: header, menu and main column. Takes children rather
 * than rendering an <Outlet/>, so the router's not-found page can use the same
 * frame (D71).
 *
 * Navigation reflects what the backend actually allows, so nobody is offered a
 * link that would 403 (F4). An Admin gets no Tasks or Dashboard link at all,
 * because D13 gives them no task surface.
 */
export function ShellLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 px-4">
          {/* Plain text, not an h1 (each page has its own) and not a link (the
              home page differs by role, and the menu already reaches it). */}
          <span className="inline-flex min-h-11 items-center font-semibold text-slate-900">
            {APP_NAME}
          </span>
          <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-4">
            {!isAdmin && (
              <>
                <Link
                  to="/dashboard"
                  className={NAV_LINK}
                  activeProps={NAV_ACTIVE}
                  inactiveProps={NAV_INACTIVE}
                >
                  Dashboard
                </Link>
                <Link
                  to="/tasks"
                  className={NAV_LINK}
                  activeProps={NAV_ACTIVE}
                  inactiveProps={NAV_INACTIVE}
                >
                  Tasks
                </Link>
              </>
            )}
            {isAdmin && (
              <Link
                to="/users"
                className={NAV_LINK}
                activeProps={NAV_ACTIVE}
                inactiveProps={NAV_INACTIVE}
              >
                Users
              </Link>
            )}
            <span className="ml-auto inline-flex min-h-11 items-center text-sm text-slate-500">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-11 items-center text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
