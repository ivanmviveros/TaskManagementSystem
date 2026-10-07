import { apiClient, refreshSession } from "../../../lib/api-client";
import type { CurrentUser, LoginResponse } from "../types";

export const login = (email: string, password: string) =>
  apiClient.post<LoginResponse>("/auth/login/", { email, password });

export const logout = () => apiClient.post<void>("/auth/logout/", {});

export const fetchCurrentUser = () => apiClient.get<CurrentUser>("/users/me/");

/**
 * Bootstrap a session from the refresh cookie, refresh FIRST (D35).
 *
 * The access token is held in module memory only, so after a page reload the
 * cookie is the only thing that can restore a session — the refresh cannot
 * simply be dropped (spec §4.2). Probing /users/me/ first, as this used to,
 * made a guaranteed 401 for every anonymous visitor AND still needed the
 * refresh afterwards. This way an anonymous visitor makes one expected failed
 * request and a returning user makes none.
 *
 * Named differently from api-client's `refreshSession` on purpose, so this
 * module does not shadow its own import.
 */
export async function restoreSession(): Promise<CurrentUser | null> {
  if (!(await refreshSession())) return null;
  return fetchCurrentUser();
}
