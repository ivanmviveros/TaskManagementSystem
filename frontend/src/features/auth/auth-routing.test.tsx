import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

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
