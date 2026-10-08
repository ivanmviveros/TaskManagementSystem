import { useQueryClient } from "@tanstack/react-query";
import { useCreateStore } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { apiClient } from "../../lib/api-client";
import * as authService from "./services/auth-service";
import { SessionStoreProvider } from "./session-context";
import { initialSessionState, sessionActions } from "./session-store";

/**
 * Creates the app's session store — once per mount, so every test render gets
 * a fresh one — and restores the session from the refresh cookie (D35, D86).
 * Must sit inside QueryClientProvider: a sign-in empties that client's cache (D95).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // useCreateStore reads the actions factory once, on mount.
  const session = useCreateStore(
    initialSessionState,
    sessionActions({ clearServerState: () => queryClient.clear() }),
  );

  useEffect(() => {
    let cancelled = false;
    // Refresh FIRST, then fetch the user (D35). The access token is memory-only,
    // so after a reload the cookie is the only way back into a session; probing
    // /users/me/ first was a guaranteed 401 for anonymous visitors and did not
    // avoid the refresh anyway. restoreSession resolves to null rather than
    // rejecting when there is no session, because that is an ordinary answer.
    // The catch stays: /users/me/ can still fail (a 5xx) after a good refresh.
    authService
      .restoreSession()
      .then((me) => {
        if (!cancelled) session.actions.settle(me);
      })
      .catch(() => {
        if (!cancelled) session.actions.settle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    // When a refresh fails, the session is genuinely over: drop the user so the
    // route guards send them to /login.
    apiClient.onSessionExpired(session.actions.expire);
  }, [session]);

  const value = useMemo(() => ({ session }), [session]);
  return <SessionStoreProvider value={value}>{children}</SessionStoreProvider>;
}
