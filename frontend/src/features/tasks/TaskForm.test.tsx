import { screen, waitFor } from "@testing-library/react";
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

function assignableUsers() {
  server.use(
    http.get(`${BASE}/users/`, () =>
      HttpResponse.json({
        count: 2,
        next: null,
        previous: null,
        results: [OPERATOR, SUPERVISOR],
      }),
    ),
  );
}

function taskDetail(overrides: Partial<TaskDetail> = {}) {
  server.use(
    http.get(`${BASE}/tasks/${TASK_ID}/`, () => HttpResponse.json({ ...DETAIL, ...overrides })),
  );
}

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

  it("renders the assignee field for a Supervisor, populated from GET /users/", async () => {
    signedInAs(SUPERVISOR);
    assignableUsers();
    await renderApp("/tasks/new");
    const select = await screen.findByLabelText(/assignee/i);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /omar operator/i })).toBeInTheDocument(),
    );
    expect(select).toBeInTheDocument();
  });

  it("never offers an Admin as an assignee", async () => {
    // D17: assigning to an Admin would create a task nobody can open.
    signedInAs(SUPERVISOR);
    server.use(
      http.get(`${BASE}/users/`, () =>
        HttpResponse.json({
          count: 2,
          next: null,
          previous: null,
          results: [
            OPERATOR,
            {
              id: "0199a0f0-0000-7000-8000-00000000ad01",
              email: "admin@demo.local",
              first_name: "Ada",
              last_name: "Admin",
              role: "ADMIN",
            },
          ],
        }),
      ),
    );
    await renderApp("/tasks/new");
    await screen.findByLabelText(/assignee/i);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /omar operator/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /ada admin/i })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/status change is not allowed/i);
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
});
