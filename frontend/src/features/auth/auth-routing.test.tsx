import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderApp } from "../../test/render-app";
import { server } from "../../test/msw-server";

const ME = "http://localhost:8000/api/v1/users/me/";

function meAs(role: "ADMIN" | "SUPERVISOR" | "OPERATOR") {
  server.use(
    http.get(ME, () =>
      HttpResponse.json({
        id: "0199a0f0-0000-7000-8000-000000000001",
        email: `${role.toLowerCase()}@example.com`,
        first_name: "A",
        last_name: "B",
        role,
      }),
    ),
  );
}

describe("role landing pages", () => {
  it("sends an Admin to the user list, which is their landing page", async () => {
    meAs("ADMIN");
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /users/i })).toBeInTheDocument();
  });

  it("sends a Supervisor to the dashboard", async () => {
    meAs("SUPERVISOR");
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("sends an Operator to the dashboard", async () => {
    meAs("OPERATOR");
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("never renders a task route for an Admin, matching the backend 403", async () => {
    meAs("ADMIN");
    await renderApp("/tasks");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /users/i })).toBeInTheDocument();
  });

  it("keeps an Operator out of the admin user list", async () => {
    meAs("OPERATOR");
    await renderApp("/users");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });

  it("sends an unauthenticated visitor to the login page", async () => {
    server.use(http.get(ME, () => HttpResponse.json({ detail: "x", code: "x" }, { status: 401 })));
    server.use(
      http.post("http://localhost:8000/api/v1/auth/refresh/", () =>
        HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
      ),
    );
    await renderApp("/tasks");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });
});

/**
 * What the bootstrap puts on the wire (D35, spec §4.3). Counted per bootstrap:
 * renderApp() does not wrap in StrictMode, so a test sees exactly one. The
 * StrictMode double-invoke is covered by refreshSession's own dedup test.
 */
describe("session bootstrap requests", () => {
  const BASE = "http://localhost:8000/api/v1";
  let requests: string[] = [];
  let failures: string[] = [];

  function record({ request, response }: { request: Request; response: Response }) {
    const key = `${request.method} ${new URL(request.url).pathname}`;
    requests.push(key);
    if (response.status >= 400) failures.push(key);
  }

  beforeEach(() => {
    requests = [];
    failures = [];
    server.events.on("response:mocked", record);
  });

  afterEach(() => {
    server.events.removeListener("response:mocked", record);
  });

  it("makes exactly one failed request for an anonymous visitor, and it is the refresh", async () => {
    // What the real server answers when there is neither a token nor a cookie.
    server.use(
      http.get(ME, () => HttpResponse.json({ detail: "x", code: "x" }, { status: 401 })),
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({ detail: "no cookie", code: "refresh_cookie_missing" }, { status: 401 }),
      ),
    );

    await renderApp("/tasks");
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();

    // The remaining 401 is correct HTTP: "no session" is not a 200.
    expect(failures).toEqual(["POST /api/v1/auth/refresh/"]);
  });

  it("restores a session from a valid cookie with no failed request", async () => {
    // The default fixture is a valid session: refresh answers with a token.
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();

    expect(requests).toContain("POST /api/v1/auth/refresh/");
    expect(failures).toEqual([]);
  });
});
