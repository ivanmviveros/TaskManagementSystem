import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";
import type { UserDetail } from "./types";

const BASE = "http://localhost:8000/api/v1";

const ADMIN: UserDetail = {
  id: "0199a0f0-0000-7000-8000-00000000ad01",
  email: "admin@demo.local",
  first_name: "Ada",
  last_name: "Admin",
  role: "ADMIN",
  is_active: true,
  is_staff: true,
  date_joined: "2026-09-01T09:00:00Z",
  last_login: null,
};

function operator(overrides: Partial<UserDetail> = {}): UserDetail {
  return {
    id: "0199a0f0-0000-7000-8000-00000000op01",
    email: "operator@demo.local",
    first_name: "Omar",
    last_name: "Operator",
    role: "OPERATOR",
    is_active: true,
    is_staff: false,
    date_joined: "2026-09-02T09:00:00Z",
    last_login: null,
    ...overrides,
  };
}

let requested: URL[] = [];

beforeEach(() => {
  requested = [];
  server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json(ADMIN)));
});

function usersRespondWith(results: UserDetail[], count = results.length) {
  server.use(
    http.get(`${BASE}/users/`, ({ request }) => {
      requested.push(new URL(request.url));
      return HttpResponse.json({ count, next: null, previous: null, results });
    }),
  );
}

function lastQuery(): URLSearchParams {
  return requested[requested.length - 1].searchParams;
}

describe("UserListPage", () => {
  it("renders the users the API returned", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users");
    const table = await screen.findByRole("table");
    expect(within(table).getByText(/omar operator/i)).toBeInTheDocument();
    expect(within(table).getByText("operator@demo.local")).toBeInTheDocument();
  });

  it("shows an empty state rather than an empty table", async () => {
    usersRespondWith([]);
    await renderApp("/users");
    expect(await screen.findByText(/no users match these filters/i)).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    server.use(
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({ detail: "Users are unavailable.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp("/users");
    expect(await screen.findByRole("alert")).toHaveTextContent(/users are unavailable/i);
  });

  it("filters by role and by inactive, and searches", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users");
    await screen.findByRole("table");
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/^role$/i), "OPERATOR");
    await waitFor(() => expect(lastQuery().get("role")).toBe("OPERATOR"));

    await user.click(screen.getByRole("checkbox", { name: /inactive only/i }));
    await waitFor(() => expect(lastQuery().get("is_active")).toBe("false"));

    await user.type(screen.getByLabelText(/search/i), "omar");
    await waitFor(() => expect(lastQuery().get("search")).toBe("omar"));
  });

  it("states in the delete dialog that deletion is a deactivation", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /deactivate operator@demo.local/i }));

    const dialog = await screen.findByRole("dialog");
    // Spec §16.1: an Admin must not be misled about a decision they cannot undo.
    expect(dialog).toHaveTextContent(/deactivates the account rather than erasing it/i);
    expect(dialog).toHaveTextContent(/no longer be able to sign in/i);
    expect(dialog).toHaveTextContent(/record and its history are kept/i);
    expect(dialog).toHaveTextContent(/no way to restore the account/i);
  });

  it("deactivates a user once confirmed and refreshes the list", async () => {
    let deleted = false;
    server.use(
      http.get(`${BASE}/users/`, ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [operator({ is_active: !deleted })],
        });
      }),
      http.delete(`${BASE}/users/:id/`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderApp("/users");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /deactivate operator@demo.local/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^deactivate$/i }));
    await waitFor(() => expect(deleted).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    usersRespondWith([operator()]);
    server.use(
      http.delete(`${BASE}/users/:id/`, () =>
        HttpResponse.json(
          { detail: "That user still holds tasks.", code: "protected" },
          { status: 409 },
        ),
      ),
    );
    await renderApp("/users");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /deactivate operator@demo.local/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still holds tasks/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
