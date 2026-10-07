import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { clearAccessToken } from "../../lib/api-client";
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
    const store = createSessionStore();
    await expect(store.actions.signIn("supervisor@demo.local", "pw")).resolves.toEqual(ME);
    expect(store.state.user).toEqual(ME);
  });

  it("signOut never rejects, and clears the user even when the server fails", async () => {
    server.use(
      http.post(`${BASE}/auth/logout/`, () =>
        HttpResponse.json({ detail: "x", code: "x", errors: null }, { status: 500 }),
      ),
    );
    const store = createSessionStore();
    store.actions.settle(ME);
    await expect(store.actions.signOut()).resolves.toBeUndefined();
    expect(store.state.user).toBeNull();
  });

  it("expire clears the user and keeps loading settled", () => {
    const store = createSessionStore();
    store.actions.settle(ME);
    store.actions.expire();
    expect(store.state).toEqual({ user: null, isLoading: false });
  });
});
