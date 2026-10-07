import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { renderApp } from "../../test/render-app";
import { server } from "../../test/msw-server";

const BASE = "http://localhost:8000/api/v1";
const SUPERVISOR = {
  id: "0199a0f0-0000-7000-8000-000000000001",
  email: "supervisor@demo.local",
  first_name: "Sam",
  last_name: "Supervisor",
  role: "SUPERVISOR" as const,
};

/**
 * Tracks whether a login has succeeded, so `GET /users/me/` can answer 401
 * before and the user after. A flat override would also answer the app's
 * INITIAL probe, so the app would start signed in and never show /login.
 */
let signedIn = false;

beforeEach(() => {
  signedIn = false;
  server.use(
    http.get(`${BASE}/users/me/`, () =>
      signedIn
        ? HttpResponse.json(SUPERVISOR)
        : HttpResponse.json({ detail: "x", code: "x" }, { status: 401 }),
    ),
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
    ),
  );
});

/** A login handler that flips the signed-in flag, as the real backend would. */
function loginSucceeds(access = "fresh-access-token", delayMs = 0) {
  return http.post(`${BASE}/auth/login/`, async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    signedIn = true;
    return HttpResponse.json({ access, user: SUPERVISOR });
  });
}

async function fillAndSubmit(email = "supervisor@demo.local", password = "DemoPass!2026") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/email/i), email);
  await user.type(await screen.findByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  return user;
}

describe("LoginPage", () => {
  it("moves focus to the first invalid field when sign-in fails validation (D75)", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          {
            detail: "Invalid input.",
            code: "validation_error",
            errors: { email: ["This field may not be blank."], password: ["This field may not be blank."] },
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/login");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toHaveFocus());
  });

  it("moves focus to the alert when the failure names no field", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          { detail: "No active account found with the given credentials.", code: "no_active_account", errors: null },
          { status: 401 },
        ),
      ),
    );
    await renderApp("/login");
    await fillAndSubmit("nobody@demo.local", "wrong-password");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("signs in and lands on the role's page", async () => {
    server.use(loginSucceeds());
    await renderApp("/login");
    await fillAndSubmit();
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("shows the server's message for bad credentials rather than inventing one", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          {
            detail: "No active account found with the given credentials.",
            code: "no_active_account",
            errors: null,
          },
          { status: 401 },
        ),
      ),
    );
    await renderApp("/login");
    await fillAndSubmit("nobody@demo.local", "wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no active account found with the given credentials/i,
    );
  });

  it("shows a distinct message when rate-limited", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          { detail: "Request was throttled.", code: "throttled", errors: null },
          { status: 429 },
        ),
      ),
    );
    await renderApp("/login");
    await fillAndSubmit();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/too many attempts/i);
    // Branching on the status, not the server copy.
    expect(alert).not.toHaveTextContent(/throttled/i);
  });

  it("surfaces per-field validation errors beside their inputs", async () => {
    server.use(
      http.post(`${BASE}/auth/login/`, () =>
        HttpResponse.json(
          {
            detail: "Invalid input.",
            code: "validation_error",
            errors: { email: ["Enter a valid email."] },
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/login");
    await fillAndSubmit("not-an-email", "whatever-password");
    const emailInput = await screen.findByLabelText(/email/i);
    await waitFor(() => expect(emailInput).toHaveAttribute("aria-invalid", "true"));
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    server.use(loginSucceeds("t", 50));
    await renderApp("/login");
    await fillAndSubmit();
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("never writes the access token to localStorage or sessionStorage", async () => {
    server.use(loginSucceeds("secret-access-token"));
    await renderApp("/login");
    await fillAndSubmit();
    await screen.findByRole("heading", { name: /dashboard/i });
    // Root AGENTS.md § Authentication, asserted rather than trusted.
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});
