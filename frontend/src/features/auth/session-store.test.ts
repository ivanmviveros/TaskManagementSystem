import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { apiClient, clearAccessToken, setAccessToken } from "../../lib/api-client";
import { server } from "../../test/msw-server";
import { createSessionStore } from "./session-store";
import type { CurrentUser } from "./types";

const BASE = "http://localhost:8000/api/v1";
const ME: CurrentUser = {
  id: "0199a0f0-0000-7000-8000-00000000sv01",
  email: "supervisor@demo.local",
  first_name: "Sam",
  last_name: "Supervisor",
  role: "SUPERVISOR",
};

afterEach(() => clearAccessToken());

/** Registers a probe endpoint and returns a getter for the Authorization header it saw. */
function recordAuthorization(): () => string | null {
  let sent: string | null = "unset";
  server.use(
    http.get(`${BASE}/tasks/stats/`, ({ request }) => {
      sent = request.headers.get("Authorization");
      return HttpResponse.json({});
    }),
  );
  return () => sent;
}

describe("session store", () => {
  it("starts loading, with nobody signed in", () => {
    expect(createSessionStore().state).toEqual({ user: null, isLoading: true });
  });

  it("settle ends loading, signed in or not", () => {
    const store = createSessionStore();
    store.actions.settle(ME);
    expect(store.state).toEqual({ user: ME, isLoading: false });
    store.actions.settle(null);
    expect(store.state).toEqual({ user: null, isLoading: false });
  });

  it("signIn stores and returns the user the server sent", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () => HttpResponse.json({ access: "token", user: ME })),
    );
    const authorization = recordAuthorization();
    const store = createSessionStore();
    await expect(store.actions.signIn("supervisor@demo.local", "pw")).resolves.toEqual(ME);
    expect(store.state.user).toEqual(ME);

    await apiClient.get("/tasks/stats/");
    expect(authorization()).toBe("Bearer token");
  });

  it("signIn empties the server cache once, before the new user is set (D95)", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () => HttpResponse.json({ access: "token", user: ME })),
    );
    const userWhenCleared: (CurrentUser | null)[] = [];
    const store = createSessionStore({
      clearServerState: () => userWhenCleared.push(store.state.user),
    });
    await store.actions.signIn("supervisor@demo.local", "pw");
    expect(userWhenCleared).toEqual([null]);
    expect(store.state.user).toEqual(ME);
  });

  it("signOut never rejects, and clears the user even when the server fails", async () => {
    server.use(
      http.post(`${BASE}/auth/logout/`, () =>
        HttpResponse.json({ detail: "x", code: "x", errors: null }, { status: 500 }),
      ),
    );
    const authorization = recordAuthorization();
    const store = createSessionStore();
    store.actions.settle(ME);
    setAccessToken("t");
    await expect(store.actions.signOut()).resolves.toBeUndefined();
    expect(store.state.user).toBeNull();

    await apiClient.get("/tasks/stats/");
    expect(authorization()).toBeNull();
  });

  it("expire clears the user and keeps loading settled", () => {
    const store = createSessionStore();
    store.actions.settle(ME);
    store.actions.expire();
    expect(store.state).toEqual({ user: null, isLoading: false });
  });
});
