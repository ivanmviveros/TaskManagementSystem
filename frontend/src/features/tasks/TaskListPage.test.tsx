import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";
import type { TaskListItem } from "./types";

const BASE = "http://localhost:8000/api/v1";

const OPERATOR = {
  id: "0199a0f0-0000-7000-8000-00000000op01",
  email: "operator@demo.local",
  first_name: "Omar",
  last_name: "Operator",
  role: "OPERATOR" as const,
};
const SUPERVISOR = {
  id: "0199a0f0-0000-7000-8000-00000000sv01",
  email: "supervisor@demo.local",
  first_name: "Sam",
  last_name: "Supervisor",
  role: "SUPERVISOR" as const,
};

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "0199a0f0-0000-7000-8000-0000000000a1",
    title: "Review the brief",
    status: "PENDING",
    due_date: null,
    assignee: OPERATOR,
    is_overdue: false,
    can_delete: false,
    created_at: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}

/** Records every /tasks/ request URL so the tests can assert the query string. */
let requested: URL[] = [];

function signedInAs(user: typeof OPERATOR | typeof SUPERVISOR) {
  server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json(user)));
}

function tasksRespondWith(results: TaskListItem[], count = results.length) {
  server.use(
    http.get(`${BASE}/tasks/`, ({ request }) => {
      requested.push(new URL(request.url));
      return HttpResponse.json({ count, next: null, previous: null, results });
    }),
  );
}

beforeEach(() => {
  requested = [];
});

/** The most recent /tasks/ request, which is the one a filter change produced. */
function lastQuery(): URLSearchParams {
  return requested[requested.length - 1].searchParams;
}

describe("TaskListPage", () => {
  it("renders the page of tasks the API returned", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task({ title: "Review the brief" }), task({ id: "b", title: "Ship it" })]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: /review the brief/i })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: /ship it/i })).toBeInTheDocument();
  });

  it("shows an empty state rather than an empty table", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp("/tasks");
    expect(await screen.findByText(/no tasks match these filters/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/tasks/`, () =>
        HttpResponse.json({ detail: "Database is down.", code: "server_error" }, { status: 500 }),
      ),
    );
    await renderApp("/tasks");
    expect(await screen.findByRole("alert")).toHaveTextContent(/database is down/i);
  });

  it("exposes the router it rendered with, for the URL tests below", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it("sends status as repeated query parameters for a multi-select", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /pending/i }));
    await user.click(screen.getByRole("checkbox", { name: /in progress/i }));
    await waitFor(() =>
      expect(lastQuery().getAll("status")).toEqual(["PENDING", "IN_PROGRESS"]),
    );
  });

  it("sends overdue=true when the overdue filter is on", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: /overdue only/i }));
    await waitFor(() => expect(lastQuery().get("overdue")).toBe("true"));
  });

  it("resets to page 1 when a filter changes", async () => {
    signedInAs(SUPERVISOR);
    // Pagination is driven by the next/previous envelope, not by the count, so
    // the handler must return a next link for the Next button to be enabled.
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        const url = new URL(request.url);
        requested.push(url);
        const page = Number(url.searchParams.get("page") ?? "1");
        return HttpResponse.json({
          count: 40,
          next: page === 1 ? `${BASE}/tasks/?page=2` : null,
          previous: page === 1 ? null : `${BASE}/tasks/?page=1`,
          results: [task()],
        });
      }),
    );
    await renderApp("/tasks");
    await screen.findByRole("table");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => expect(lastQuery().get("page")).toBe("2"));

    // A filter applied on page 2 must go back to page 1, or the user sees an
    // empty page and reads it as "no results".
    await user.click(screen.getByRole("checkbox", { name: /pending/i }));
    await waitFor(() => expect(lastQuery().get("page")).toBe("1"));
  });

  it("hides the assignee column for an Operator", async () => {
    signedInAs(OPERATOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(
      within(table).queryByRole("columnheader", { name: /assignee/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the assignee column for a Supervisor", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /assignee/i })).toBeInTheDocument();
  });

  it("hides the delete control for an Operator on a task they did not create", async () => {
    // The UX mirror of D27: can_delete comes from the API, which applies the
    // same rule IsTaskCreator enforces.
    signedInAs(OPERATOR);
    tasksRespondWith([task({ can_delete: false })]);
    await renderApp("/tasks");
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /^delete/i })).not.toBeInTheDocument();
  });

  it("shows the delete control for an Operator on a task they created", async () => {
    signedInAs(OPERATOR);
    tasksRespondWith([task({ can_delete: true })]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("button", { name: /^delete/i })).toBeInTheDocument();
  });

  it("also renders a stacked card per task for narrow viewports", async () => {
    // The table and the cards are both in the DOM; CSS picks one per breakpoint,
    // and jsdom applies no CSS, so this asserts the card presentation exists.
    signedInAs(SUPERVISOR);
    tasksRespondWith([task({ title: "Review the brief" })]);
    await renderApp("/tasks");
    const card = await screen.findByRole("article");
    expect(within(card).getByRole("link", { name: /review the brief/i })).toBeInTheDocument();
    expect(within(card).getByText(/pending/i)).toBeInTheDocument();
  });

  it("completes a task inline and refreshes the list", async () => {
    signedInAs(SUPERVISOR);
    let completed = false;
    server.use(
      http.get(`${BASE}/tasks/`, ({ request }) => {
        requested.push(new URL(request.url));
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [task({ status: completed ? "COMPLETED" : "PENDING" })],
        });
      }),
      http.post(`${BASE}/tasks/:id/complete/`, () => {
        completed = true;
        return HttpResponse.json({ ...task({ status: "COMPLETED" }), description: "" });
      }),
    );
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    const user = userEvent.setup();
    await user.click(within(table).getByRole("button", { name: /^complete/i }));
    // The invalidation refetches, so the row shows its new status.
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText(/^completed$/i)).toBeInTheDocument(),
    );
  });
});

describe("task deletion from the list", () => {
  const TASK = task({ can_delete: true });

  /** Counts DELETEs; onUnhandledRequest: "error" requires a handler anyway. */
  function deletesRespondWith(response: () => Response) {
    const record = { count: 0 };
    server.use(
      http.delete(`${BASE}/tasks/${TASK.id}/`, () => {
        record.count += 1;
        return response();
      }),
    );
    return record;
  }

  async function openDialog() {
    signedInAs(OPERATOR);
    tasksRespondWith([TASK]);
    await renderApp("/tasks");
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: /^delete review the brief/i }));
    return { user, dialog: screen.getByRole("dialog") };
  }

  it("asks for confirmation, naming the task, and Cancel deletes nothing", async () => {
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    const { user, dialog } = await openDialog();
    expect(dialog).toHaveTextContent(/review the brief/i);
    expect(dialog).toHaveTextContent(/no way to restore/i);
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deletes.count).toBe(0);
  });

  it("deletes exactly once on confirm and closes the dialog", async () => {
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deletes.count).toBe(1);
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    deletesRespondWith(() =>
      HttpResponse.json(
        { detail: "You can only delete tasks you created.", code: "permission_denied" },
        { status: 403 },
      ),
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/only delete tasks you created/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
