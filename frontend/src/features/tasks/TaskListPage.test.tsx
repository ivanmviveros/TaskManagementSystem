import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";
import type { TaskDetail, TaskListItem } from "./types";

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

describe("task actions from the list (D87)", () => {
  const A = task({ id: "task-a", title: "Task A", can_delete: true });
  const B = task({ id: "task-b", title: "Task B", can_delete: true });

  it("disables only the busy row while its action is in flight", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([A, B]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(`${BASE}/tasks/${A.id}/complete/`, async () => {
        await gate;
        return HttpResponse.json({ ...A, description: "" });
      }),
    );
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    const user = userEvent.setup();
    await user.click(within(table).getByRole("button", { name: "Complete Task A" }));

    expect(within(table).getByRole("button", { name: "Complete Task A" })).toBeDisabled();
    expect(within(table).getByRole("button", { name: "Delete Task A" })).toBeDisabled();
    expect(within(table).getByRole("button", { name: "Complete Task B" })).toBeEnabled();

    release();
    await waitFor(() =>
      expect(within(table).getByRole("button", { name: "Complete Task A" })).toBeEnabled(),
    );
    expect(within(table).getByRole("button", { name: "Delete Task A" })).toBeEnabled();
  });

  it("shows the message when completing fails", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([A]);
    server.use(
      http.post(`${BASE}/tasks/${A.id}/complete/`, () =>
        HttpResponse.json(
          {
            detail: "This task can no longer be completed.",
            code: "invalid_status_transition",
            errors: null,
          },
          { status: 409 },
        ),
      ),
    );
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    const user = userEvent.setup();
    await user.click(within(table).getByRole("button", { name: "Complete Task A" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This task can no longer be completed.",
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
    const { router } = await renderApp("/tasks");
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("button", { name: /^delete review the brief/i }));
    return { user, router, dialog: screen.getByRole("dialog") };
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

  it("refocuses the alert when the same failure repeats (D75)", async () => {
    deletesRespondWith(() =>
      HttpResponse.json(
        { detail: "You can only delete tasks you created.", code: "permission_denied" },
        { status: 403 },
      ),
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveFocus());

    // Focus leaves the alert; the same message arriving again must pull it back.
    act(() => within(dialog).getByRole("button", { name: /cancel/i }).focus());
    expect(within(dialog).getByRole("alert")).not.toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveFocus());
  });

  it("starts with the dialog closed after leaving the list and coming back (D87)", async () => {
    const { router } = await openDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(() => router.navigate({ to: "/dashboard" }));
    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
    await act(() => router.navigate({ to: "/tasks" }));
    await screen.findByRole("table");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
  it("ignores an unknown status in the URL instead of sending it to the API (F10)", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp(`/tasks?status=${encodeURIComponent(JSON.stringify(["BOGUS"]))}`);
    await screen.findByRole("table");
    expect(lastQuery().getAll("status")).toEqual([]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

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

  it("Clear filters empties every filter input", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    const status = encodeURIComponent(JSON.stringify(["PENDING", "IN_PROGRESS"]));
    await renderApp(
      `/tasks?status=${status}&due_date_after=2026-10-01T00:00:00.000Z` +
        "&due_date_before=2026-10-31T23:59:59.000Z&overdue=true",
    );
    await screen.findByRole("table");
    expect(screen.getByRole("checkbox", { name: /pending/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /in progress/i })).toBeChecked();
    expect(screen.getByLabelText(/due after/i)).toHaveValue("2026-10-01");
    expect(screen.getByLabelText(/due before/i)).toHaveValue("2026-10-31");
    expect(screen.getByRole("checkbox", { name: /overdue only/i })).toBeChecked();

    await userEvent.setup().click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /pending/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /in progress/i })).not.toBeChecked();
      expect(screen.getByLabelText(/due after/i)).toHaveValue("");
      expect(screen.getByLabelText(/due before/i)).toHaveValue("");
      expect(screen.getByRole("checkbox", { name: /overdue only/i })).not.toBeChecked();
    });
  });

  it("leaves a box unchecked when Clear filters follows its uncheck before the URL catches up", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(5);
    const { router } = await renderApp("/tasks?overdue=true");
    await screen.findByRole("table");
    const overdue = screen.getByRole("checkbox", { name: /overdue only/i });
    expect(overdue).toBeChecked();

    // Both clicks land before the first navigation commits.
    fireEvent.click(overdue);
    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() => expect(router.state.location.search).toEqual({}));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.getByRole("checkbox", { name: /overdue only/i })).not.toBeChecked();
  });

  it("follows a URL change made elsewhere while the panel stays mounted", async () => {
    signedInAs(SUPERVISOR);
    tasksPaged(60); // three pages at 20
    const status = encodeURIComponent(JSON.stringify(["PENDING"]));
    const { router } = await renderApp(
      `/tasks?status=${status}&due_date_after=2026-10-01T00:00:00.000Z` +
        "&due_date_before=2026-10-31T23:59:59.000Z",
    );
    await screen.findByRole("table");
    expect(screen.getByRole("checkbox", { name: /pending/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /overdue only/i })).not.toBeChecked();

    await act(() =>
      router.navigate({
        to: "/tasks",
        search: {
          status: ["IN_PROGRESS"],
          due_date_after: "2026-10-05T00:00:00.000Z",
          due_date_before: "2026-10-20T23:59:59.000Z",
          overdue: true,
          page: 2,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /pending/i })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: /in progress/i })).toBeChecked();
      expect(screen.getByLabelText(/due after/i)).toHaveValue("2026-10-05");
      expect(screen.getByLabelText(/due before/i)).toHaveValue("2026-10-20");
      expect(screen.getByRole("checkbox", { name: /overdue only/i })).toBeChecked();
    });

    // Putting the URL's values into the fields must not read as the user's
    // edit: a write that ran the listeners would send them back to the URL,
    // which returns the list to page 1. Outlive the 300 ms date debounce.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(router.state.location.search).toMatchObject({ page: 2 });
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

  it("shows the new column and direction after a click", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const user = userEvent.setup();
    await user.click(
      within(await screen.findByRole("table")).getByRole("button", {
        name: /^due date$/i,
      }),
    );
    await waitFor(() => expect(lastQuery().get("ordering")).toBe("due_date"));
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /due date/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(within(table).getByRole("button", { name: /^due date$/i })).toBeInTheDocument();
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
        name: /^created$/i,
      }),
    );
    await waitFor(() => expect(router.state.location.search.ordering).toBe("created_at"));
    expect(
      within(screen.getByRole("table")).getByRole("columnheader", { name: /created/i }),
    ).toHaveAttribute("aria-sort", "ascending");
    await user.click(
      within(screen.getByRole("table")).getByRole("button", {
        name: /^created$/i,
      }),
    );
    await waitFor(() => expect(router.state.location.search.ordering).toBeUndefined());
    expect(router.state.location.href).not.toContain("ordering");
  });
});

describe("sorting and layout below lg (F3, F8)", () => {
  it("offers a Sort by select, showing the default order", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    await screen.findByRole("table");
    expect(screen.getByLabelText(/sort by/i)).toHaveDisplayValue("Newest first");
  });

  it("writes the chosen ordering to the URL and returns to page 1", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()], 60);
    const { router } = await renderApp("/tasks?page=2");
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/sort by/i), "Due date, latest first");
    await waitFor(() => expect(lastQuery().get("ordering")).toBe("-due_date"));
    expect(router.state.location.search.page).toBeUndefined();
  });

  it("writes no ordering for Newest first, the default", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    const { router } = await renderApp("/tasks?ordering=due_date");
    await screen.findByRole("table");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/sort by/i), "Newest first");
    await waitFor(() => expect(router.state.location.search.ordering).toBeUndefined());
  });

  it("keeps the select when a filter empties the list", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp("/tasks");
    await screen.findByText(/no tasks match these filters/i);
    expect(screen.getByLabelText(/sort by/i)).toBeInTheDocument();
  });

  it("switches between table and cards at lg, not md (D69)", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([task()]);
    await renderApp("/tasks");
    const table = await screen.findByRole("table");
    expect(table.parentElement).toHaveClass("hidden", "lg:block");
    expect(table.parentElement).not.toHaveClass("md:block");
    expect(screen.getByRole("article").parentElement).toHaveClass("lg:hidden");
    expect(screen.getByLabelText(/sort by/i).closest("div")).toHaveClass("lg:hidden");
  });
});

describe("returning to the list (F5, D70)", () => {
  const PENDING = encodeURIComponent(JSON.stringify(["PENDING"]));
  const LIST = `/tasks?status=${PENDING}&page=2&ordering=due_date`;
  const EXPECTED = { status: ["PENDING"], page: 2, ordering: "due_date" };

  function detailOf(item: TaskListItem): TaskDetail {
    return {
      ...item,
      description: "",
      created_by: SUPERVISOR,
      completed_at: null,
      updated_at: item.created_at,
      allowed_transitions: ["IN_PROGRESS", "CANCELLED"],
    };
  }

  function serveTask(item: TaskListItem) {
    tasksRespondWith([item], 60);
    server.use(
      http.get(`${BASE}/tasks/${item.id}/`, () => HttpResponse.json(detailOf(item))),
      http.patch(`${BASE}/tasks/${item.id}/`, () => HttpResponse.json(detailOf(item))),
      http.delete(`${BASE}/tasks/${item.id}/`, () => new HttpResponse(null, { status: 204 })),
    );
  }

  async function openFromList(item: TaskListItem) {
    const user = userEvent.setup();
    const table = await screen.findByRole("table");
    await user.click(within(table).getByRole("link", { name: item.title }));
    await screen.findByRole("heading", { level: 1, name: item.title });
    return user;
  }

  it("returns to the same filters, page and sort from Back to tasks", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = await openFromList(item);
    await user.click(screen.getByRole("link", { name: /back to tasks/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("keeps the list through an edit and save", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = await openFromList(item);
    await user.click(screen.getByRole("link", { name: /^edit$/i }));
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await screen.findByRole("heading", { level: 1, name: item.title });
    await user.click(screen.getByRole("link", { name: /back to tasks/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("returns to the same list after deleting the task", async () => {
    signedInAs(SUPERVISOR);
    const item = task({ can_delete: true });
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = await openFromList(item);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^delete$/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("returns to the same list from Back to tasks when opened through a card", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    const { router } = await renderApp(LIST);
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.click(within(screen.getAllByRole("article")[0]).getByRole("link", { name: item.title }));
    await screen.findByRole("heading", { level: 1, name: item.title });
    await user.click(screen.getByRole("link", { name: /back to tasks/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("keeps the list through creating a task from New task", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    server.use(http.post(`${BASE}/tasks/`, () => HttpResponse.json(detailOf(item), { status: 201 })));
    const { router } = await renderApp(LIST);
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.click(screen.getByRole("link", { name: /new task/i }));
    await user.type(await screen.findByLabelText(/title/i), item.title);
    await user.click(screen.getByRole("button", { name: /create task/i }));
    await screen.findByRole("heading", { level: 1, name: item.title });
    await user.click(screen.getByRole("link", { name: /back to tasks/i }));
    await screen.findByRole("table");
    expect(router.state.location.search).toEqual(EXPECTED);
  });

  it("falls back to the plain list for a task opened directly", async () => {
    signedInAs(SUPERVISOR);
    const item = task();
    serveTask(item);
    await renderApp(`/tasks/${item.id}`);
    await screen.findByRole("heading", { level: 1, name: item.title });
    expect(screen.getByRole("link", { name: /back to tasks/i })).toHaveAttribute("href", "/tasks");
  });
});

describe("an impossible date range (F9, D78)", () => {
  const AFTER = encodeURIComponent("2026-10-10T00:00:00.000Z");
  const BEFORE = encodeURIComponent("2026-10-01T23:59:59.000Z");

  it("says why nothing can match, on the Due before field", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp(`/tasks?due_date_after=${AFTER}&due_date_before=${BEFORE}`);
    const before = await screen.findByLabelText(/due before/i);
    expect(before).toHaveAttribute("aria-invalid", "true");
    expect(before).toHaveAccessibleDescription(/later than .due before., so no task can match/i);
    expect(screen.getByLabelText(/due after/i)).toHaveAccessibleDescription(
      /later than .due before., so no task can match/i,
    );
    // The URL still holds what was entered (D45); the empty state still shows.
    // findBy, not getBy: the filters render before the list query settles.
    expect(await screen.findByText(/no tasks match these filters/i)).toBeInTheDocument();
  });

  it("limits each picker to days the other allows", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp(`/tasks?due_date_after=${AFTER}&due_date_before=${BEFORE}`);
    expect(await screen.findByLabelText(/due after/i)).toHaveAttribute("max", "2026-10-01");
    expect(screen.getByLabelText(/due before/i)).toHaveAttribute("min", "2026-10-10");
  });

  it("treats a single-day range as valid", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    const from = encodeURIComponent("2026-10-05T00:00:00.000Z");
    const to = encodeURIComponent("2026-10-05T23:59:59.000Z");
    await renderApp(`/tasks?due_date_after=${from}&due_date_before=${to}`);
    const before = await screen.findByLabelText(/due before/i);
    expect(before).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/so no task can match/i)).not.toBeInTheDocument();
  });

  it("says nothing for a valid range", async () => {
    signedInAs(SUPERVISOR);
    tasksRespondWith([]);
    await renderApp(`/tasks?due_date_after=${BEFORE}&due_date_before=${AFTER}`);
    const before = await screen.findByLabelText(/due before/i);
    expect(before).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/so no task can match/i)).not.toBeInTheDocument();
  });
});
