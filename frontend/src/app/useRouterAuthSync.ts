import { useEffect } from "react";

import type { AuthState } from "../features/auth/session-store";
import type { AppRouter } from "./router";

/**
 * Re-runs the route guards whenever auth changes: updating the router's
 * context does NOT re-run beforeLoad on its own. Shared by RoutedApp and the
 * test harness, so the tests exercise this exact code (D74).
 *
 * Callers must not render RouterProvider until `auth.isLoading` is false —
 * RoutedApp and AppAtPath both gate on it; otherwise the first load would again
 * run against a still-loading context.
 *
 * Its own .ts module, not an export of providers.tsx: react/only-export-components
 * would warn on a hook exported from a component file.
 */
export function useRouterAuthSync(router: AppRouter, auth: AuthState): void {
  useEffect(() => {
    // invalidate() LOADS (router-core), and while auth is loading guard() returns
    // early — so a load now would commit the page's matches unjudged, and the page
    // would mount and fetch before the redirect. RouterProvider's first load uses
    // the settled context.
    if (auth.isLoading) return;
    void router.invalidate();
  }, [router, auth.user, auth.isLoading]);
}
