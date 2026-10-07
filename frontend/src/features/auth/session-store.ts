import { createStore } from "@tanstack/react-store";

import { clearAccessToken, setAccessToken } from "../../lib/api-client";
import type { StoreApi } from "../../lib/store-api";
import * as authService from "./services/auth-service";
import type { CurrentUser } from "./types";

/**
 * The session: shared CLIENT state, which is why it lives in a store rather
 * than in TanStack Query (frontend §4, D86). The access token itself is NOT
 * kept here: api-client owns it in module memory, so there is never a second
 * copy that could disagree with what the client actually sends.
 */
export type SessionState = {
  user: CurrentUser | null;
  /** True until the initial "who am I?" probe settles, so guards can wait. */
  isLoading: boolean;
};

/** Frozen: every store created from it shares this one object. */
export const initialSessionState: SessionState = Object.freeze({ user: null, isLoading: true });

export const sessionActions = ({ setState }: StoreApi<SessionState>) => ({
  /** Ends the bootstrap probe, signed in or not. */
  settle: (user: CurrentUser | null) => setState(() => ({ user, isLoading: false })),

  signIn: async (email: string, password: string): Promise<CurrentUser> => {
    const { access, user } = await authService.login(email, password);
    setAccessToken(access);
    setState((state) => ({ ...state, user }));
    return user;
  },

  /**
   * Never rejects. The local sign-out is authoritative: the token is dropped and
   * the user cleared whatever the server says, so the UI can never be stuck
   * appearing signed in. A failed revoke leaves a refresh token alive until it
   * expires, which the caller cannot do anything about — so swallowing it here
   * is the honest contract, rather than handing every caller a rejection to
   * discard with `void`.
   */
  signOut: async (): Promise<void> => {
    try {
      await authService.logout();
    } catch {
      // Already expired, offline, or a 5xx: nothing actionable.
    } finally {
      clearAccessToken();
      setState((state) => ({ ...state, user: null }));
    }
  },

  /** A failed refresh means the session is over: the guards send the user to /login. */
  expire: () => setState((state) => ({ ...state, user: null })),
});

/** For unit tests. Components create theirs with useCreateStore (spec §4.0). */
export const createSessionStore = () => createStore(initialSessionState, sessionActions);
export type SessionStore = ReturnType<typeof createSessionStore>;

/** What useAuth() returns: the same shape the old auth context provided (D86). */
export type AuthState = SessionState & Pick<SessionStore["actions"], "signIn" | "signOut">;
