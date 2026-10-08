import { describe, expect, it } from "vitest";

import { taskSnapshot, toTaskInput } from "./task-form-values";
import type { TaskDetail } from "./types";

const OPERATOR = {
  id: "0199a0f0-0000-7000-8000-00000000op01",
  email: "operator@demo.local",
  first_name: "Omar",
  last_name: "Operator",
  role: "OPERATOR" as const,
};

const DETAIL: TaskDetail = {
  id: "0199a0f0-0000-7000-8000-0000000000a1",
  title: "Review the brief",
  description: "Read it closely.",
  status: "PENDING",
  allowed_transitions: ["IN_PROGRESS", "CANCELLED"],
  due_date: null,
  assignee: OPERATOR,
  created_by: OPERATOR,
  is_overdue: false,
  can_delete: true,
  completed_at: null,
  created_at: "2026-10-01T09:00:00Z",
  updated_at: "2026-10-01T09:00:00Z",
};

describe("taskSnapshot", () => {
  it("gives a new task empty defaults, Pending, and no transitions", () => {
    expect(taskSnapshot(undefined)).toEqual({
      defaults: { title: "", description: "", due_date: "", assignee: null, status: "PENDING" },
      initialStatus: undefined,
      initialTransitions: [],
    });
  });

  it("takes an existing task's values, with the due date as its UTC day (D76)", () => {
    const snapshot = taskSnapshot({ ...DETAIL, due_date: "2026-09-28T12:00:00Z" });
    expect(snapshot.defaults).toEqual({
      title: "Review the brief",
      description: "Read it closely.",
      due_date: "2026-09-28",
      assignee: OPERATOR,
      status: "PENDING",
    });
    expect(snapshot.initialStatus).toBe("PENDING");
    expect(snapshot.initialTransitions).toEqual(["IN_PROGRESS", "CANCELLED"]);
  });
});

describe("toTaskInput", () => {
  const draft = taskSnapshot(DETAIL).defaults;
  const create = { canChooseAssignee: true, isEdit: false, initialStatus: undefined };
  const edit = { canChooseAssignee: true, isEdit: true, initialStatus: "PENDING" as const };

  it("sends no deadline as null, and a day as noon UTC (D76)", () => {
    expect(toTaskInput({ ...draft, due_date: "" }, create).due_date).toBeNull();
    expect(toTaskInput({ ...draft, due_date: "2026-10-07" }, create).due_date).toBe(
      "2026-10-07T12:00:00.000Z",
    );
  });

  it("omits the assignee when the actor may not choose one (D32)", () => {
    expect(toTaskInput(draft, { ...create, canChooseAssignee: false })).not.toHaveProperty(
      "assignee",
    );
  });

  it("sends null for Unassigned and the id for a chosen user (D32)", () => {
    expect(toTaskInput({ ...draft, assignee: null }, create).assignee).toBeNull();
    expect(toTaskInput(draft, create).assignee).toBe(OPERATOR.id);
  });

  it("never sends a status on create", () => {
    expect(toTaskInput({ ...draft, status: "IN_PROGRESS" }, create)).not.toHaveProperty("status");
  });

  it("sends a status on edit only when it changed (D40)", () => {
    expect(toTaskInput(draft, edit)).not.toHaveProperty("status");
    expect(toTaskInput({ ...draft, status: "IN_PROGRESS" }, edit).status).toBe("IN_PROGRESS");
  });
});
