import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

/**
 * Answers like DRF's PageNumberPagination: `count` rows in pages of the
 * requested size, one row per page so each page is recognisable, and a 404
 * past the last page.
 */
function tasksPaged(count: number) {
  server.use(
    http.get(`${BASE}/tasks/`, ({ request }) => {
      const url = new URL(request.url);
      requested.push(url);
      const page = Number(url.searchParams.get("page") ?? "1");
      const size = Number(url.searchParams.get("page_size") ?? "20");
      const pages = Math.max(1, Math.ceil(count / size));
      if (page > pages) {
        return HttpResponse.json(
          { detail: "Invalid page.", code: "not_found", errors: null },
          { status: 404 },
        );
      }
      return HttpResponse.json({
        count,
        next: page < pages ? `${BASE}/tasks/?page=${page + 1}` : null,
        previous: page > 1 ? `${BASE}/tasks/?page=${page - 1}` : null,
        results: [task({ id: `task-${page}`, title: `Task on page ${page}` })],
      });
    }),
  );
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
    // The pager counts pages from `count` (D52): 40 rows at 20 a page is two
    // pages, so Next is enabled on page 1.
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

  describe("keyboard (D60)", () => {
    // Found in the browser check: focus stayed on the row's Delete button, so a
    // keyboard user had to Tab through the whole list to reach the dialog.
    it("moves focus into the dialog, onto Cancel", async () => {
      deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
      const { dialog } = await openDialog();
      // Cancel, not Delete: the safe default for a destructive confirmation.
      expect(within(dialog).getByRole("button", { name: /cancel/i })).toHaveFocus();
    });

    it("closes on Escape without deleting", async () => {
      const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
      const { user } = await openDialog();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(deletes.count).toBe(0);
    });

    it("keeps Tab inside the dialog", async () => {
      deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
      const { user, dialog } = await openDialog();
      const cancel = within(dialog).getByRole("button", { name: /cancel/i });
      const confirm = within(dialog).getByRole("button", { name: /^delete$/i });
      await user.tab();
      expect(confirm).toHaveFocus();
      await user.tab();
      expect(cancel).toHaveFocus(); // wrapped, rather than escaping to the page
      await user.tab({ shift: true });
      expect(confirm).toHaveFocus(); // and backwards
    });

    it("returns focus to the button that opened it", async () => {
      deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
      const { user, dialog } = await openDialog();
      // Focus must first have LEFT the trigger, or "returned" proves nothing.
      expect(within(dialog).getByRole("button", { name: /cancel/i })).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      const table = screen.getByRole("table");
      expect(within(table).getByRole("button", { name: /^delete review the brief/i })).toHaveFocus();
    });
  });
});

describe("TaskListPage URL state", () => {
  it("reads the page, the page size and the filters from the URL", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    await renderApp("/tasks?page=2&page_size=50&overdue=true");
    await screen.findByRole("table");
    expect(lastQuery().get("page")).toBe("2");
    expect(lastQuery().get("page_size")).toBe("50");
    expect(lastQuery().get("overdue")).toBe("true");
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText(/rows per page/i)).toHaveValue("50");
  });

  it("falls back to the defaults for page values it cannot use", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    await renderApp("/tasks?page=0&page_size=37");
    await screen.findByRole("table");
    expect(lastQuery().get("page")).toBe("1");
    expect(lastQuery().get("page_size")).toBe("20");
  });

  it("writes a filter to the URL in place, and goes back to page 1", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(60);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");
    const entries = router.history.length;

    await userEvent.setup().click(screen.getByRole("checkbox", { name: /pending/i }));

    await waitFor(() => expect(router.state.location.search).toEqual({ status: ["PENDING"] }));
    expect(router.history.length).toBe(entries);
    await waitFor(() => expect(lastQuery().get("page")).toBe("1"));
  });

  it("adds a history entry for a page move, so Back returns to the previous page", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(60);
    const { router } = await renderApp("/tasks");
    await screen.findByRole("table");
    const entries = router.history.length;

    await userEvent.setup().click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 2 }));
    expect(router.history.length).toBe(entries + 1);
    // Scoped to the table: jsdom applies no CSS, so the card renders the title too.
    expect(
      await within(await screen.findByRole("table")).findByText("Task on page 2"),
    ).toBeInTheDocument();

    // back() runs the router's load synchronously; outside act() React warns
    // and the console guard fails the test.
    act(() => router.history.back());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page"),
    );
    expect(router.state.location.search).toEqual({});
  });

  it("goes back to page 1 when the page size changes, and keeps the size in the URL", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");

    await userEvent.setup().selectOptions(screen.getByLabelText(/rows per page/i), "50");

    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));
    await waitFor(() => expect(lastQuery().get("page_size")).toBe("50"));
    expect(lastQuery().get("page")).toBe("1");
  });

  it("keeps the defaults out of the URL", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(187);
    const { router } = await renderApp("/tasks?page=2&page_size=50");
    await screen.findByRole("table");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Page 1" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));

    await user.selectOptions(screen.getByLabelText(/rows per page/i), "20");
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("clears filters and ordering but keeps the page size", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    const status = encodeURIComponent(JSON.stringify(["PENDING"]));
    const { router } = await renderApp(
      `/tasks?status=${status}&overdue=true&ordering=due_date&page_size=50`,
    );
    await screen.findByRole("table");

    await userEvent.setup().click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() => expect(router.state.location.search).toEqual({ page_size: 50 }));
  });

  it("commits a typed date once, after the typing stops", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    const { router } = await renderApp("/tasks");
    await screen.findByRole("table");
    const input = screen.getByLabelText(/due after/i);

    // What a date input fires while its year is typed digit by digit.
    fireEvent.change(input, { target: { value: "0002-10-06" } });
    fireEvent.change(input, { target: { value: "0020-10-06" } });
    fireEvent.change(input, { target: { value: "2026-10-06" } });
    expect(input).toHaveValue("2026-10-06");

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        due_date_after: "2026-10-06T00:00:00.000Z",
      }),
    );
    await waitFor(() => expect(lastQuery().has("due_date_after")).toBe(true));
    expect(
      requested
        .filter((url) => url.searchParams.has("due_date_after"))
        .map((url) => url.searchParams.get("due_date_after")),
    ).toEqual(["2026-10-06T00:00:00.000Z"]);
  });

  it("does not bring a date back when Clear filters beats its commit", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    await renderApp("/tasks");
    await screen.findByRole("table");
    const input = screen.getByLabelText(/due after/i);

    fireEvent.change(input, { target: { value: "2026-10-06" } });
    await userEvent.setup().click(screen.getByRole("button", { name: /clear filters/i }));
    expect(input).toHaveValue("");

    // Outlive the 300 ms debounce, so a surviving commit would have fired.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(input).toHaveValue("");
    expect(requested.some((url) => url.searchParams.has("due_date_after"))).toBe(false);
  });

  it("lands on page 1, without an error, when the URL's page no longer exists", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(30); // two pages at 20
    const { router } = await renderApp("/tasks?page=3");

    expect(
      await within(await screen.findByRole("table")).findByText("Task on page 1"),
    ).toBeInTheDocument();
    expect(router.state.location.search).toEqual({});
    expect(requested.map((url) => url.searchParams.get("page"))).toEqual(["3", "1"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the current page on screen while the next one loads", async () => {
    signedInAs(SUPERVISOR);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${BASE}/tasks/`, async ({ request }) => {
        const url = new URL(request.url);
        requested.push(url);
        const page = url.searchParams.get("page") ?? "1";
        if (page === "2") await held;
        return HttpResponse.json({
          count: 40,
          next: null,
          previous: null,
          results: [task({ id: `task-${page}`, title: `Task on page ${page}` })],
        });
      }),
    );
    await renderApp("/tasks");
    const table = await screen.findByRole("table");

    await userEvent.setup().click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(lastQuery().get("page")).toBe("2"));

    // The same element, not a remount, and the pager is still there (D53).
    expect(screen.getByRole("table")).toBe(table);
    expect(table.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();

    release();
    expect(await within(table).findByText("Task on page 2")).toBeInTheDocument();
    expect(table.closest("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  });
});

describe("sort state in the table header (F6)", () => {
  it("marks the default order — Created, descending — when the URL names none", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: /created/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(within(table).getByRole("columnheader", { name: /due date/i })).toHaveAttribute(
      "aria-sort",
      "none",
    );
    expect(within(table).getByRole("columnheader", { name: /^title$/i })).not.toHaveAttribute(
      "aria-sort",
    );
  });

  it("shows the new column and direction after a click, and names the next action", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("table")).getByRole("button", {
        name: /^due date\. sort ascending$/i,
      }),
    );
    await waitFor(() => expect(lastQuery().get("ordering")).toBe("due_date"));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /due date/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(
      within(table).getByRole("button", { name: /^due date, sorted ascending\. sort descending$/i }),
    ).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /created/i })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("returns to a URL with no ordering when Created is clicked back to newest first", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    const { router } = await renderApp("/tasks");
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("table")).getByRole("button", {
        name: /^created, sorted descending/i,
      }),
    );
    await waitFor(() => expect(router.state.location.search.ordering).toBe("created_at"));
    await user.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: /^created, sorted ascending/i,
      }),
    );
    await waitFor(() => expect(router.state.location.search.ordering).toBeUndefined());
    expect(router.state.location.href).not.toContain("ordering");
  });
});
