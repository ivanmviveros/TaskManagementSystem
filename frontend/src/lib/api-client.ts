import { ApiError, type FieldErrors } from "./api-error";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000") as string;
const PREFIX = "/api/v1";
const REFRESH_PATH = "/auth/refresh/";

/**
 * The access token lives here, in module memory, and never in localStorage or
 * sessionStorage (root AGENTS.md § Authentication). AuthContext is the only
 * writer; keeping the value out of React state avoids a second copy that could
 * disagree with what the imperative client actually sends.
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

type Options = { method?: string; body?: unknown; allowRefresh?: boolean };

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
  // a 401 there would recurse forever.
  if (response.status === 401 && allowRefresh && path !== REFRESH_PATH) {
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
  /** Called when a refresh fails: AuthContext uses it to sign the user out. */
  onSessionExpired: (handler: () => void) => {
    sessionExpiredHandler = handler;
  },
};
