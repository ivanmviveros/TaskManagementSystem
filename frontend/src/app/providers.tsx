import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { AuthProvider } from "../features/auth/AuthContext";
import { useAuth } from "../features/auth/hooks/useAuth";
import { ApiError } from "../lib/api-error";
import { createAppRouter } from "./router";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          // The client already handles 401 by refreshing once; retrying a 4xx
          // here would just repeat a refusal.
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        staleTime: 30_000,
      },
    },
  });
}

/**
 * The router is created once and kept in a ref; the live auth state reaches the
 * `beforeLoad` guards through RouterProvider's `context` prop.
 *
 * Nothing routed is rendered until the initial "who am I?" probe settles —
 * otherwise the first paint would run every guard against `user === null` and
 * bounce an authenticated visitor to /login before their session was known.
 */
export function RoutedApp() {
  const auth = useAuth();
  // Lazy initial state, not a ref: creating the router once is state, and
  // reading a ref during render is not safe.
  const [router] = useState(() => createAppRouter(auth));

  if (auth.isLoading) {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  return <RouterProvider router={router} context={{ auth }} />;
}

export function Providers({
  children,
  queryClient,
}: {
  children?: ReactNode;
  queryClient?: QueryClient;
}) {
  const client = useMemo(() => queryClient ?? createQueryClient(), [queryClient]);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children ?? <RoutedApp />}</AuthProvider>
    </QueryClientProvider>
  );
}
