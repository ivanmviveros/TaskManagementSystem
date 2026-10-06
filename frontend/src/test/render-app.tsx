import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { useState } from "react";

import { createAppRouter } from "../app/router";
import { AuthProvider } from "../features/auth/AuthContext";
import { useAuth } from "../features/auth/hooks/useAuth";
import { clearAccessToken } from "../lib/api-client";

/**
 * Mounts the REAL router and the REAL providers at `initialPath`, so routing
 * tests exercise the actual guards rather than a stub of them.
 *
 * Mirrors RoutedApp in app/providers.tsx: the router is created once and the
 * live auth state arrives through RouterProvider's `context` prop, and nothing
 * routed renders until the auth probe settles.
 */
function AppAtPath({ initialPath }: { initialPath: string }) {
  const auth = useAuth();
  const [router] = useState(() =>
    createAppRouter(auth, {
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    }),
  );

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
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppAtPath initialPath={initialPath} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}
