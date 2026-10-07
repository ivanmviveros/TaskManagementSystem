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
    // Refresh FIRST, then fetch the user (D35). The access token is memory-only,
    // so after a reload the cookie is the only way back into a session; probing
    // /users/me/ first was a guaranteed 401 for anonymous visitors and did not
    // avoid the refresh anyway. restoreSession resolves to null rather than
    // rejecting when there is no session, because that is an ordinary answer.
    // The catch stays: /users/me/ can still fail (a 5xx) after a good refresh.
    authService
      .restoreSession()
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

  /**
   * Never rejects. The local sign-out is authoritative: the token is dropped and
   * the user cleared whatever the server says, so the UI can never be stuck
   * appearing signed in. A failed revoke leaves a refresh token alive until it
   * expires, which the caller cannot do anything about — so swallowing it here
   * is the honest contract, rather than handing every caller a rejection to
   * discard with `void`.
   */
  const signOut = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Already expired, offline, or a 5xx: nothing actionable.
    } finally {
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
