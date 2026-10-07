import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";

const BASE = "http://localhost:8000/api/v1";

const USERS = {
  ADMIN: {
    id: "0199a0f0-0000-7000-8000-00000000ad01",
    email: "admin@demo.local",
    first_name: "Ada",
    last_name: "Admin",
    role: "ADMIN" as const,
  },
  SUPERVISOR: {
    id: "0199a0f0-0000-7000-8000-00000000sv01",
    email: "supervisor@demo.local",
    first_name: "Sam",
    last_name: "Supervisor",
    role: "SUPERVISOR" as const,
  },
  OPERATOR: {
    id: "0199a0f0-0000-7000-8000-00000000op01",
    email: "operator@demo.local",
    first_name: "Omar",
    last_name: "Operator",
    role: "OPERATOR" as const,
  },
};

/** Tracks the session so /users/me/ can stop answering after a logout. */
let signedInAs: keyof typeof USERS | null = null;

beforeEach(() => {
  signedInAs = null;
  server.use(
    http.get(`${BASE}/users/me/`, () =>
      signedInAs === null
        ? HttpResponse.json({ detail: "x", code: "x" }, { status: 401 })
        : HttpResponse.json(USERS[signedInAs]),
    ),
    // Session-aware, like /users/me/ above. The bootstrap is refresh-first
    // (D35), so an unconditional 401 here would sign out every test below.
    http.post(`${BASE}/auth/refresh/`, () =>
      signedInAs === null
        ? HttpResponse.json(
            { detail: "no cookie", code: "refresh_cookie_missing" },
            { status: 401 },
          )
        : HttpResponse.json({ access: "rotated-access-token" }),
    ),
  );
});

function nav(): HTMLElement {
  return screen.getByRole("navigation", { name: /main/i });
}

describe("AppShell navigation", () => {
  it("offers an Admin only the user list, never a task or dashboard link", async () => {
    // F4 and the UX mirror of D13: an Admin has no task surface at all, so
    // offering those links would promise a guaranteed 403.
    signedInAs = "ADMIN";
    await renderApp("/users");
    await screen.findByRole("heading", { name: /users/i });
    expect(within(nav()).getByRole("link", { name: /users/i })).toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: /tasks/i })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it.each(["SUPERVISOR", "OPERATOR"] as const)(
    "offers a %s tasks and the dashboard but never the user list",
    async (role) => {
      signedInAs = role;
      await renderApp("/dashboard");
      await screen.findByRole("heading", { name: /dashboard/i });
      expect(within(nav()).getByRole("link", { name: /tasks/i })).toBeInTheDocument();
      expect(within(nav()).getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
      expect(within(nav()).queryByRole("link", { name: /^users$/i })).not.toBeInTheDocument();
    },
  );

  it.each(["ADMIN", "SUPERVISOR", "OPERATOR"] as const)(
    "shows the app name in the header, before the menu, for a %s",
    async (role) => {
      signedInAs = role;
      await renderApp(role === "ADMIN" ? "/users" : "/dashboard");
      const banner = await screen.findByRole("banner");
      const name = within(banner).getByText("Task Management System");
      // A name, not a menu item: outside the "Main" navigation, and ahead of it.
      expect(nav()).not.toContainElement(name);
      expect(name.compareDocumentPosition(nav()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Each page keeps its own h1; the app name must not compete with it.
      expect(name.tagName).not.toBe("H1");
    },
  );

  it("shows who is signed in", async () => {
    signedInAs = "SUPERVISOR";
    await renderApp("/dashboard");
    expect(await screen.findByText("supervisor@demo.local")).toBeInTheDocument();
  });
});

describe("signing out", () => {
  it("calls the logout endpoint and returns to the login page", async () => {
    signedInAs = "SUPERVISOR";
    let loggedOut = false;
    server.use(
      http.post(`${BASE}/auth/logout/`, () => {
        loggedOut = true;
        signedInAs = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderApp("/dashboard");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(loggedOut).toBe(true));
    // The guards run again once the user is gone, so the login form comes back.
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it("still signs the user out locally when the server call fails", async () => {
    // Otherwise the UI could be stuck appearing signed in after a failed logout.
    signedInAs = "SUPERVISOR";
    server.use(
      http.post(`${BASE}/auth/logout/`, () =>
        HttpResponse.json({ detail: "Gateway timeout.", code: "unknown_error" }, { status: 504 }),
      ),
    );
    await renderApp("/dashboard");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /sign out/i }));
    signedInAs = null;
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});

describe("session expiry", () => {
  it("sends the user to the login page when a refresh fails mid-session", async () => {
    // The api-client signals expiry, AuthContext drops the user, and the route
    // guards re-run. Regression test: updating router context alone does NOT
    // re-run beforeLoad, so without the invalidate the user would sit on a page
    // they can no longer load.
    signedInAs = "SUPERVISOR";
    server.use(
      http.get(`${BASE}/tasks/stats/`, () => {
        // The session has lapsed: the access token is rejected and the refresh
        // cookie is gone, which is exactly the real expiry sequence.
        signedInAs = null;
        return HttpResponse.json({ detail: "x", code: "x" }, { status: 401 });
      }),
    );
    await renderApp("/dashboard");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});
