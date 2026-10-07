import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import indexHtml from "../../index.html?raw";
import { currentUser } from "../test/msw-handlers";
import { server } from "../test/msw-server";
import { renderApp } from "../test/render-app";

const BASE = "http://localhost:8000/api/v1";
const ID = "0199a0f0-0000-7000-8000-0000000000a1";
const SUFFIX = "Task Management System";

const notFound = () =>
  HttpResponse.json({ detail: "Not found.", code: "not_found", errors: null }, { status: 404 });

describe("page titles", () => {
  it.each([
    ["/login", null, "Sign in"],
    ["/dashboard", "SUPERVISOR", "Dashboard"],
    ["/tasks", "SUPERVISOR", "Tasks"],
    ["/tasks/new", "SUPERVISOR", "New task"],
    [`/tasks/${ID}`, "SUPERVISOR", "Task details"],
    [`/tasks/${ID}/edit`, "SUPERVISOR", "Edit task"],
    ["/users", "ADMIN", "Users"],
    ["/users/new", "ADMIN", "New user"],
    [`/users/${ID}`, "ADMIN", "Edit user"],
  ] as const)("titles %s", async (path, role, page) => {
    // The detail pages' data is beside the point; a 404 renders their error
    // state quietly. Registered FIRST: server.use prepends, and /users/:userId/
    // would otherwise also answer /users/me/.
    server.use(
      http.get(`${BASE}/tasks/:taskId/`, notFound),
      http.get(`${BASE}/users/:userId/`, notFound),
    );
    if (role === null) {
      server.use(
        http.post(`${BASE}/auth/refresh/`, () =>
          HttpResponse.json(
            { detail: "no cookie", code: "refresh_cookie_missing" },
            { status: 401 },
          ),
        ),
      );
    } else {
      server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json({ ...currentUser, role })));
    }

    await renderApp(path);

    await waitFor(() => expect(document.title).toBe(`${page} · ${SUFFIX}`));
  });

  it("follows client-side navigation, not just the first render", async () => {
    await renderApp("/dashboard"); // the default fixture is a Supervisor
    await waitFor(() => expect(document.title).toBe(`Dashboard · ${SUFFIX}`));

    await userEvent.setup().click(await screen.findByRole("link", { name: /^tasks$/i }));

    await waitFor(() => expect(document.title).toBe(`Tasks · ${SUFFIX}`));
  });

  it("leaves the title to the routes", () => {
    // React 19 hoists a route's <title> into <head> AFTER any static one, and
    // the tab shows the first — so a static title would win forever (D58).
    expect(indexHtml).not.toMatch(/<title/i);
  });
});
