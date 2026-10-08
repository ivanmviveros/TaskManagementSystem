import { ApiError, type FieldErrors } from "./api-error";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000") as string;
const PREFIX = "/api/v1";
const REFRESH_PATH = "/auth/refresh/";

/**
 * Endpoints where a 401 is the answer, not a stale-token symptom.
 *
 * `/auth/login/` matters as much as `/auth/refresh/`: a 401 there means the
 * credentials are wrong. Refreshing would spend a pointless request, replace
 * the server's "no active account found" message with the refresh endpoint's
 * own error, and fire the session-expired handler on an ordinary typo.
 */
const NO_REFRESH_PATHS = new Set([REFRESH_PATH, "/auth/login/"]);

/**
 * The access token lives here, in module memory, and never in localStorage or
 * sessionStorage (root AGENTS.md § Authentication). Outside this module, the
 * session store is the only writer; keeping the value out of React state avoids
 * a second copy that could disagree with what the imperative client actually sends.
 */
let accessToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

/** One shared promise, so concurrent 401s do not race each other's rotation. */
let refreshInFlight: Promise<string> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
  refreshInFlight = null;
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = response.statusText || "Request failed.";
  let code = "unknown_error";
  let errors: FieldErrors = null;
  try {
    const body = (await response.json()) as {
      detail?: string;
      code?: string;
      errors?: FieldErrors;
    };
    detail = body.detail ?? detail;
    code = body.code ?? code;
    errors = body.errors ?? null;
  } catch {
    // A proxy 502 or an HTML error page: keep the status, leave the code unknown.
  }
  return new ApiError(response.status, detail, code, errors);
}

function refreshAccessToken(): Promise<string> {
  if (refreshInFlight === null) {
    refreshInFlight = fetch(`${BASE_URL}${PREFIX}${REFRESH_PATH}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(async (response) => {
        if (!response.ok) throw await toApiError(response);
        const body = (await response.json()) as { access: string };
        accessToken = body.access;
        return body.access;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Restore a session from the refresh cookie. Returns whether it worked.
 *
 * Exported so SessionProvider's bootstrap reuses `refreshInFlight` instead of
 * posting to /auth/refresh/ itself (spec §4.3.1). That matters: the endpoint is
 * in NO_REFRESH_PATHS and the promise is module-private, so a direct post would
 * NOT be deduplicated, and StrictMode's double-invoked effect would fire two
 * refreshes. With rotation plus blacklisting server-side, the second presents a
 * cookie the first just invalidated and the bootstrap signs the user out.
 *
 * Never rejects: "no session" is an ordinary answer here, not an error.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    await refreshAccessToken(); // single-flighted; assigns accessToken on success
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

type Options ={ method?: string; body?: unknown; allowRefresh?: boolean };

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, allowRefresh = true } = options;

  const response = await fetch(`${BASE_URL}${PREFIX}${path}`, {
    method,
    // So the refresh cookie flows. CORS_ALLOW_CREDENTIALS is set server-side.
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Refresh ONCE and retry ONCE. Never refresh the refresh endpoint itself, or
  // a 401 there would recurse forever — see NO_REFRESH_PATHS for why login is
  // excluded too.
  if (response.status === 401 && allowRefresh && !NO_REFRESH_PATHS.has(path)) {
    try {
      await refreshAccessToken();
    } catch (error) {
      clearAccessToken();
      sessionExpiredHandler?.();
      throw error;
    }
    return request<T>(path, { ...options, allowRefresh: false });
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  /** Called when a refresh fails: SessionProvider wires it to the session store's `expire`. */
  onSessionExpired: (handler: () => void) => {
    sessionExpiredHandler = handler;
  },
};
