import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../test/msw-server";
import { renderApp } from "../../test/render-app";
import type { TaskDetail } from "./types";

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
const TASK_ID = "0199a0f0-0000-7000-8000-0000000000a1";

const DETAIL: TaskDetail = {
  id: TASK_ID,
  title: "Review the brief",
  description: "Read it closely.",
  status: "PENDING",
  allowed_transitions: ["IN_PROGRESS", "CANCELLED"],
  due_date: null,
  assignee: OPERATOR,
  created_by: SUPERVISOR,
  is_overdue: false,
  can_delete: true,
  completed_at: null,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
};

function signedInAs(user: typeof OPERATOR | typeof SUPERVISOR) {
  server.use(http.get(`${BASE}/users/me/`, () => HttpResponse.json(user)));
}

/** GET /users/assignable/ answers with a plain list, not a page (D47). */
function assignableUsers() {
  server.use(http.get(`${BASE}/users/assignable/`, () => HttpResponse.json([OPERATOR, SUPERVISOR])));
}

function taskDetail(overrides: Partial<TaskDetail> = {}) {
  server.use(
    http.get(`${BASE}/tasks/${TASK_ID}/`, () => HttpResponse.json({ ...DETAIL, ...overrides })),
  );
}

/** Records each PATCH body so a test can assert what was — and was not — sent. */
function capturePatches(): { bodies: Record<string, unknown>[] } {
  const record = { bodies: [] as Record<string, unknown>[] };
  server.use(
    http.patch(`${BASE}/tasks/${TASK_ID}/`, async ({ request }) => {
      record.bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(DETAIL);
    }),
  );
  return record;
}

const COMPLETED = {
  status: "COMPLETED" as const,
  completed_at: "2026-10-02T10:00:00Z",
  allowed_transitions: [],
};

describe("TaskForm", () => {
  it("creates a task and invalidates the list", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    let created = false;
    server.use(
      http.post(`${BASE}/tasks/`, async ({ request }) => {
        const body = (await request.json()) as { title: string };
        created = body.title === "Ship the thing";
        return HttpResponse.json(DETAIL, { status: 201 });
      }),
    );
    taskDetail();
    await renderApp("/tasks/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/title/i), "Ship the thing");
    await user.click(screen.getByRole("button", { name: /create task/i }));
    await waitFor(() => expect(created).toBe(true));
  });

  it("omits the assignee field entirely for an Operator", async () => {
    // D15/D16: on create the backend defaults it to self, on update it is
    // immutable — so rendering the field would offer a choice that cannot work.
    signedInAs(OPERATOR);
    await renderApp("/tasks/new");
    await screen.findByLabelText(/title/i);
    expect(screen.queryByLabelText(/assignee/i)).not.toBeInTheDocument();
  });

  it("renders the assignee field for a Supervisor, populated from GET /users/assignable/", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    await renderApp("/tasks/new");
    const select = await screen.findByLabelText(/assignee/i);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /omar operator/i })).toBeInTheDocument(),
    );
    expect(select).toBeInTheDocument();
  });

  it("offers every assignable user the API reports, beyond one page", async () => {
    // D47: the picker used to page /users/ at its 100-row cap, so everyone past
    // the first page was unassignable. Which users are assignable (never an
    // Admin, D17) is now the server's answer, tested in test_api_assignable.py.
    signedInAs(SUPERVISOR);
    const many = Array.from({ length: 150 }, (_, i) => ({
      ...OPERATOR,
      id: `0199a0f0-0000-7000-8000-${String(i).padStart(12, "0")}`,
      email: `operator${i}@demo.local`,
      first_name: `Op${i}`,
    }));
    server.use(http.get(`${BASE}/users/assignable/`, () => HttpResponse.json(many)));
    await renderApp("/tasks/new");
    const select = await screen.findByLabelText(/assignee/i);
    // 150 users plus the "Unassigned" option.
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(151));
    expect(within(select).getByRole("option", { name: /operator149@demo\.local/ })).toBeInTheDocument();
  });

  it("renders the status select in edit mode only", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    await renderApp("/tasks/new");
    await screen.findByLabelText(/title/i);
    // TaskCreateSerializer accepts no status field: a new task is always
    // PENDING, so a select on create would offer a choice the API discards.
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it("renders the status select when editing", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    expect(await screen.findByLabelText(/status/i)).toBeInTheDocument();
  });

  it("never offers COMPLETED in the status select", async () => {
    // Completion is a button hitting /complete/, mirroring D18's single path.
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByLabelText(/status/i);
    expect(screen.queryByRole("option", { name: /^completed$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^cancelled$/i })).toBeInTheDocument();
  });

  it("surfaces a 400 assignee_not_assignable against the assignee field", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    server.use(
      http.post(`${BASE}/tasks/`, () =>
        HttpResponse.json(
          {
            detail: "An Admin cannot be assigned tasks.",
            code: "assignee_not_assignable",
            errors: null,
          },
          { status: 400 },
        ),
      ),
    );
    await renderApp("/tasks/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/title/i), "Doomed");
    await user.click(screen.getByRole("button", { name: /create task/i }));
    const select = await screen.findByLabelText(/assignee/i);
    await waitFor(() => expect(select).toHaveAttribute("aria-invalid", "true"));
    expect(await screen.findByText(/an admin cannot be assigned tasks/i)).toBeInTheDocument();
  });

  it("surfaces a 409 invalid_status_transition as a form-level message", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    server.use(
      http.patch(`${BASE}/tasks/${TASK_ID}/`, () =>
        HttpResponse.json(
          {
            detail: "That status change is not allowed from the task's current status.",
            code: "invalid_status_transition",
            errors: null,
          },
          { status: 409 },
        ),
      ),
    );
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByRole("combobox", { name: /status/i }), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/status change is not allowed/i);
  });

  it("shows a completed task's status read-only, with no status control", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail(COMPLETED);
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByLabelText(/title/i);
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText(/keep their status/i)).toBeInTheDocument();
  });

  it("shows a cancelled task's status read-only too", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail({ status: "CANCELLED", allowed_transitions: [] });
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByLabelText(/title/i);
    expect(screen.queryByRole("combobox", { name: /status/i })).not.toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("saves a completed task without sending a status", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail(COMPLETED);
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patches.bodies).toHaveLength(1));
    expect(patches.bodies[0]).not.toHaveProperty("status");
  });

  it("offers a pending task's status and its transitions, and sends a changed status", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const select = await screen.findByRole("combobox", { name: /status/i });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Pending",
      "In progress",
      "Cancelled",
    ]);
    const user = userEvent.setup();
    await user.selectOptions(select, "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patches.bodies).toHaveLength(1));
    expect(patches.bodies[0]).toMatchObject({ status: "IN_PROGRESS" });
  });

  it("keeps Pending on offer after changing a pending task to In progress", async () => {
    // The options come from the snapshot, not from the select's own state —
    // otherwise picking In progress would drop Pending and the change could
    // not be undone (D40).
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const select = await screen.findByRole("combobox", { name: /status/i });
    const user = userEvent.setup();
    await user.selectOptions(select, "IN_PROGRESS");
    expect(within(select).getByRole("option", { name: "Pending" })).toBeInTheDocument();
  });

  it("saves an untouched pending task without sending a status", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    taskDetail();
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(patches.bodies).toHaveLength(1));
    expect(patches.bodies[0]).not.toHaveProperty("status");
  });

  it("does not undo a status someone else changed while the form was open", async () => {
    // D40. A focus refetch brings the task back IN_PROGRESS while this form,
    // opened on PENDING, is untouched. Comparing against the LIVE task would
    // send PENDING and silently revert the other person's change.
    signedInAs(SUPERVISOR);
    assignableUsers();
    let gets = 0;
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () => {
        gets += 1;
        return HttpResponse.json(
          gets === 1
            ? DETAIL
            : { ...DETAIL, status: "IN_PROGRESS", allowed_transitions: ["PENDING", "CANCELLED"] },
        );
      }),
    );
    const patches = capturePatches();
    await renderApp(`/tasks/${TASK_ID}/edit`);
    await screen.findByRole("combobox", { name: /status/i });
    try {
      // renderApp does not expose its QueryClient; the test client's default
      // staleTime of 0 makes a focus event refetch the active detail query.
      act(() => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      // The UI deliberately does not change on refetch, so count the GETs —
      // otherwise this could pass without the refetch ever happening.
      await waitFor(() => expect(gets).toBe(2));
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /save changes/i }));
      await waitFor(() => expect(patches.bodies).toHaveLength(1));
      expect(patches.bodies[0]).not.toHaveProperty("status");
    } finally {
      // Restores the shared singleton. isFocused() then resolves to true, which
      // fires one more focus refetch that may still be in flight when afterEach
      // resets the MSW handlers. Other tests also end with refetches in flight;
      // if this one ever flakes on onUnhandledRequest, look here first.
      focusManager.setFocused(undefined);
    }
  });
});

describe("TaskDetailPage", () => {
  it("shows the complete button only for a non-terminal task", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ status: "PENDING" });
    await renderApp(`/tasks/${TASK_ID}`);
    expect(await screen.findByRole("button", { name: /mark complete/i })).toBeInTheDocument();
  });

  it("hides the complete button for a completed task", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ status: "COMPLETED", completed_at: "2026-10-02T10:00:00Z" });
    await renderApp(`/tasks/${TASK_ID}`);
    await screen.findByRole("heading", { name: /review the brief/i });
    expect(screen.queryByRole("button", { name: /mark complete/i })).not.toBeInTheDocument();
  });

  it("completes a task through POST /complete/ and refreshes the detail", async () => {
    signedInAs(SUPERVISOR);
    let completed = false;
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () =>
        HttpResponse.json(
          completed
            ? { ...DETAIL, status: "COMPLETED", completed_at: "2026-10-02T10:00:00Z" }
            : DETAIL,
        ),
      ),
      http.post(`${BASE}/tasks/${TASK_ID}/complete/`, () => {
        completed = true;
        return HttpResponse.json({
          ...DETAIL,
          status: "COMPLETED",
          completed_at: "2026-10-02T10:00:00Z",
        });
      }),
    );
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /mark complete/i }));
    // The invalidation refetches, so the task becomes terminal: the action
    // disappears and the completion timestamp appears. Asserting on behaviour
    // rather than on the word "Completed", which matches both the status badge
    // and the definition-list label.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /mark complete/i })).not.toBeInTheDocument(),
    );
    // Two matches once complete: the status badge and the completion-date label.
    expect(screen.getAllByText(/^completed$/i)).toHaveLength(2);
  });

  function deletesRespondWith(response: () => Response) {
    const record = { count: 0 };
    server.use(
      http.delete(`${BASE}/tasks/${TASK_ID}/`, () => {
        record.count += 1;
        return response();
      }),
    );
    return record;
  }

  it("does not refetch the task it just deleted", async () => {
    // Invalidating the whole ["tasks"] prefix used to refetch the deleted task's
    // own detail query — a guaranteed 404 against the real API, logged to the
    // console just before navigating away (D49).
    signedInAs(SUPERVISOR);
    let detailGets = 0;
    server.use(
      http.get(`${BASE}/tasks/${TASK_ID}/`, () => {
        detailGets += 1;
        return HttpResponse.json({ ...DETAIL, can_delete: true });
      }),
    );
    deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^delete$/i }));
    await screen.findByRole("heading", { name: /^tasks$/i });
    expect(detailGets).toBe(1);
  });

  it("deletes after confirmation and returns to the task list", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(await screen.findByRole("heading", { name: /^tasks$/i })).toBeInTheDocument();
    expect(deletes.count).toBe(1);
  });

  it("stays on the task when the confirmation is cancelled", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    const deletes = deletesRespondWith(() => new HttpResponse(null, { status: 204 }));
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /review the brief/i })).toBeInTheDocument();
    expect(deletes.count).toBe(0);
  });

  it("keeps the dialog open and shows the error when deletion fails", async () => {
    signedInAs(SUPERVISOR);
    taskDetail({ can_delete: true });
    deletesRespondWith(() =>
      HttpResponse.json(
        { detail: "You can only delete tasks you created.", code: "permission_denied" },
        { status: 403 },
      ),
    );
    await renderApp(`/tasks/${TASK_ID}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/only delete tasks you created/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
