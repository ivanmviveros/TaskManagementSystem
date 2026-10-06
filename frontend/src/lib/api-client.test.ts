import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../test/msw-server";
import { apiClient, clearAccessToken, setAccessToken } from "./api-client";
import { ApiError } from "./api-error";

const BASE = "http://localhost:8000/api/v1";

beforeEach(() => clearAccessToken());

describe("request shaping", () => {
  it("prefixes /api/v1 and attaches the bearer token", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        seen = request.headers.get("Authorization");
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] });
      }),
    );
    setAccessToken("token-abc");
    await apiClient.get("/tasks/");
    expect(seen).toBe("Bearer token-abc");
  });

  it("sends credentials so the refresh cookie flows", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    server.use(http.get(`${BASE}/tasks/`, () => HttpResponse.json({ results: [] })));
    await apiClient.get("/tasks/");
    const credentials = (spy.mock.calls[0][1] as RequestInit).credentials;
    expect(credentials).toBe("include");
    spy.mockRestore();
  });

  it("returns undefined for a 204 instead of trying to parse a body", async () => {
    server.use(http.delete(`${BASE}/tasks/x/`, () => new HttpResponse(null, { status: 204 })));
    await expect(apiClient.delete("/tasks/x/")).resolves.toBeUndefined();
  });
});

describe("error normalization", () => {
  it("turns the backend error shape into a typed ApiError", async () => {
    server.use(
      http.post(`${BASE}/tasks/`, () =>
        HttpResponse.json(
          {
            detail: "Your role cannot choose a task's assignee.",
            code: "assignee_immutable",
            errors: null,
          },
          { status: 400 },
        ),
      ),
    );
    const error = await apiClient.post<never>("/tasks/", {}).catch((e) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("assignee_immutable");
    expect(error.errors).toBeNull();
  });

  it("carries the per-field map for a validation error", async () => {
    server.use(
      http.post(`${BASE}/users/`, () =>
        HttpResponse.json(
          { detail: "Invalid input.", code: "validation_error", errors: { email: ["Taken."] } },
          { status: 400 },
        ),
      ),
    );
    const error = await apiClient.post<never>("/users/", {}).catch((e) => e as ApiError);
    expect(error.errors).toEqual({ email: ["Taken."] });
    expect(error.fieldError("email")).toBe("Taken.");
  });

  it("survives a non-JSON error body", async () => {
    server.use(
      http.get(`${BASE}/tasks/`, () => new HttpResponse("<html>502</html>", { status: 502 })),
    );
    const error = await apiClient.get<never>("/tasks/").catch((e) => e as ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("unknown_error");
  });
});

describe("refresh on 401", () => {
  it("refreshes once and retries the original request once", async () => {
    let refreshes = 0;
    let attempts = 0;
    server.use(
      http.get(`${BASE}/tasks/`, () => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
        return HttpResponse.json({ results: ["ok"] });
      }),
      http.post(`${BASE}/auth/refresh/`, () => {
        refreshes += 1;
        return HttpResponse.json({ access: "fresh-token" });
      }),
    );
    await expect(apiClient.get<{ results: string[] }>("/tasks/")).resolves.toEqual({
      results: ["ok"],
    });
    expect(refreshes).toBe(1);
    expect(attempts).toBe(2);
  });

  it("shares one in-flight refresh across concurrent 401s", async () => {
    let refreshes = 0;
    const seen = new Set<string>();
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        const token = request.headers.get("Authorization");
        if (!seen.has("refreshed")) {
          return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
        }
        return HttpResponse.json({ token });
      }),
      http.post(`${BASE}/auth/refresh/`, async () => {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        seen.add("refreshed");
        return HttpResponse.json({ access: "fresh-token" });
      }),
    );
    await Promise.all([
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
      apiClient.get("/tasks/"),
    ]);
    expect(refreshes).toBe(1);
  });

  it("does not retry the retry", async () => {
    let attempts = 0;
    server.use(
      http.get(`${BASE}/tasks/`, () => {
        attempts += 1;
        return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
      }),
      http.post(`${BASE}/auth/refresh/`, () => HttpResponse.json({ access: "fresh" })),
    );
    await apiClient.get("/tasks/").catch(() => undefined);
    expect(attempts).toBe(2);
  });

  it("clears auth state and signals session expiry when the refresh itself fails", async () => {
    const onSessionExpired = vi.fn();
    server.use(
      http.get(`${BASE}/tasks/`, () =>
        HttpResponse.json({ detail: "x", code: "x" }, { status: 401 }),
      ),
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
      ),
    );
    apiClient.onSessionExpired(onSessionExpired);
    await expect(apiClient.get("/tasks/")).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("never refreshes after a failed login, and keeps the server's message", async () => {
    // A 401 from /auth/login/ means "wrong credentials", not "stale token".
    // Refreshing would replace this message with the refresh endpoint's own.
    let refreshes = 0;
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          { detail: "No active account found with the given credentials.", code: "no_active" },
          { status: 401 },
        ),
      ),
      http.post(`${BASE}/auth/refresh/`, () => {
        refreshes += 1;
        return HttpResponse.json({ access: "should-not-be-requested" });
      }),
    );
    const error = await apiClient
      .post<never>("/auth/login/", { email: "a@b.c", password: "wrong" })
      .catch((e) => e as ApiError);
    expect(refreshes).toBe(0);
    expect(error.message).toMatch(/no active account/i);
  });

  it("never attempts to refresh the refresh endpoint itself", async () => {
    let refreshes = 0;
    server.use(
      http.post(`${BASE}/auth/refresh/`, () => {
        refreshes += 1;
        return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
      }),
    );
    await apiClient.post("/auth/refresh/", {}).catch(() => undefined);
    expect(refreshes).toBe(1);
  });
});
