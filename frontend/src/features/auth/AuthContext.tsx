import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { apiClient, clearAccessToken, setAccessToken } from "../../lib/api-client";
import * as authService from "./services/auth-service";
import type { CurrentUser } from "./types";

export interface AuthState {
  user: CurrentUser | null;
  /** True until the initial "who am I?" probe settles, so guards can wait. */
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<CurrentUser>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the current user — shared CLIENT state, which is why it lives in context
 * rather than in TanStack Query (frontend §4). The access token itself is NOT
 * kept here: api-client owns it in module memory, so there is never a second
 * copy that could disagree with what the client actually sends.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // A 401 here is not an error: it means "not signed in". The refresh cookie
    // may still be valid, in which case api-client silently refreshes first.
    authService
      .fetchCurrentUser()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // When a refresh fails, the session is genuinely over: drop the user so the
    // route guards send them to /login.
    apiClient.onSessionExpired(() => setUser(null));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { access, user: me } = await authService.login(email, password);
    setAccessToken(access);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      // Local state is cleared even if the server call fails, so the UI can
      // never be stuck appearing signed in.
      clearAccessToken();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, isLoading, signIn, signOut }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
