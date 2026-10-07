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
    // Scoped to the table: jsdom applies no CSS, so the narrow-viewport card
    // renders the same button too. findByRole, because the table only exists
    // once the bootstrap and the list request have settled.
    const table = await screen.findByRole("table");
    await user.click(
      await within(table).findByRole("button", { name: /deactivate operator@demo.local/i }),
    );

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
    // Scoped to the table: jsdom applies no CSS, so the narrow-viewport card
    // renders the same button too. findByRole, because the table only exists
    // once the bootstrap and the list request have settled.
    const table = await screen.findByRole("table");
    await user.click(
      await within(table).findByRole("button", { name: /deactivate operator@demo.local/i }),
    );
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
    // Scoped to the table: jsdom applies no CSS, so the narrow-viewport card
    // renders the same button too. findByRole, because the table only exists
    // once the bootstrap and the list request have settled.
    const table = await screen.findByRole("table");
    await user.click(
      await within(table).findByRole("button", { name: /deactivate operator@demo.local/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^deactivate$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still holds tasks/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders a card per user for narrow viewports", async () => {
    // jsdom applies no CSS, so BOTH presentations are in the DOM. That is why
    // the table assertions above are scoped, and why the card gets its own test
    // rather than pretending one does not exist.
    usersRespondWith([operator()]);
    await renderApp("/users");

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("operator@demo.local")).toBeInTheDocument();
    expect(
      within(cards[0]).getByRole("button", { name: /deactivate operator@demo.local/i }),
    ).toBeInTheDocument();
  });
});

describe("UserListPage URL state", () => {
  it("reads its filters, search and page size from the URL", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users?role=OPERATOR&search=omar&page_size=10");
    await screen.findByRole("table");
    expect(lastQuery().get("role")).toBe("OPERATOR");
    expect(lastQuery().get("search")).toBe("omar");
    expect(lastQuery().get("page_size")).toBe("10");
    expect(screen.getByLabelText(/search/i)).toHaveValue("omar");
    expect(screen.getByLabelText(/^role$/i)).toHaveValue("OPERATOR");
    expect(screen.getByLabelText(/rows per page/i)).toHaveValue("10");
  });

  it("keeps a numeric search as text", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users?search=2026");
    await screen.findByRole("table");
    expect(screen.getByLabelText(/search/i)).toHaveValue("2026");
    expect(lastQuery().get("search")).toBe("2026");
  });

  it("drops a role it does not know", async () => {
    usersRespondWith([operator()]);
    await renderApp("/users?role=ROOT");
    await screen.findByRole("table");
    expect(lastQuery().has("role")).toBe(false);
    expect(screen.getByLabelText(/^role$/i)).toHaveValue("");
  });

  it("sends one request per pause in typing, not one per keystroke", async () => {
    usersRespondWith([operator()]);
    const { router } = await renderApp("/users");
    await screen.findByRole("table");

    await userEvent.setup().type(screen.getByLabelText(/search/i), "omar");

    await waitFor(() => expect(router.state.location.search).toEqual({ search: "omar" }));
    await waitFor(() => expect(lastQuery().get("search")).toBe("omar"));
    expect(
      requested
        .filter((url) => url.searchParams.has("search"))
        .map((url) => url.searchParams.get("search")),
    ).toEqual(["omar"]);
  });

  it("empties the search box when navigation clears a committed search", async () => {
    usersRespondWith([operator()]);
    const { router } = await renderApp("/users");
    await screen.findByRole("table");
    const user = userEvent.setup();

    // Typed and committed, so the clear below must beat the draft's own echo
    // check rather than an initial value.
    await user.type(screen.getByLabelText(/search/i), "omar");
    await waitFor(() => expect(router.state.location.search).toEqual({ search: "omar" }));

    await user.click(screen.getByRole("link", { name: /^users$/i }));

    await waitFor(() => expect(screen.getByLabelText(/search/i)).toHaveValue(""));
    expect(router.state.location.search).toEqual({});
    await waitFor(() => expect(lastQuery().has("search")).toBe(false));
  });

  it("lands on page 1, without an error, when the URL's page no longer exists", async () => {
    server.use(
      http.get(`${BASE}/users/`, ({ request }) => {
        const url = new URL(request.url);
        requested.push(url);
        if (url.searchParams.get("page") === "4") {
          return HttpResponse.json(
            { detail: "Invalid page.", code: "not_found", errors: null },
            { status: 404 },
          );
        }
        return HttpResponse.json({ count: 1, next: null, previous: null, results: [operator()] });
      }),
    );
    const { router } = await renderApp("/users?page=4");
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual({});
    expect(requested.map((url) => url.searchParams.get("page"))).toEqual(["4", "1"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
