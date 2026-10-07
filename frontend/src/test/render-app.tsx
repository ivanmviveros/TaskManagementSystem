import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { useState } from "react";

import { createAppRouter, type AppRouter } from "../app/router";
import { useRouterAuthSync } from "../app/useRouterAuthSync";
import { AuthProvider } from "../features/auth/AuthContext";
import { useAuth } from "../features/auth/hooks/useAuth";
import { clearAccessToken } from "../lib/api-client";

/** Where AppAtPath hands back the router it created, so tests can read the URL. */
interface RouterHolder {
  current: AppRouter | null;
}

/**
 * Mounts the REAL router and the REAL providers at `initialPath`, so routing
 * tests exercise the actual guards rather than a stub of them.
 *
 * Like RoutedApp in app/providers.tsx, and sharing its useRouterAuthSync: the
 * router is created once and the live auth state arrives through RouterProvider's
 * `context` prop, and nothing routed renders until the auth probe settles.
 */
function AppAtPath({ initialPath, holder }: { initialPath: string; holder: RouterHolder }) {
  const auth = useAuth();
  const [router] = useState(() => {
    const created = createAppRouter(auth, {
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    });
    holder.current = created;
    return created;
  });

  useRouterAuthSync(router, auth);

  if (auth.isLoading) return <div role="status">Loading…</div>;
  return <RouterProvider router={router} context={{ auth }} />;
}

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
