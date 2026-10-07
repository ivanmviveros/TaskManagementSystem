import { describe, expect, it } from "vitest";

import { createTaskActionsStore } from "./task-actions-store";

describe("task-actions store", () => {
  it("starts with no dialog, no busy row and no error", () => {
    expect(createTaskActionsStore().state).toEqual({
      delete: { pending: null, error: null },
      busyId: null,
      actionError: null,
    });
  });

  it("startAction marks the row busy and clears the last error", () => {
    const store = createTaskActionsStore();
    store.actions.failAction("old");
    store.actions.startAction("t1");
    expect(store.state.busyId).toBe("t1");
    expect(store.state.actionError).toBeNull();
  });

  it("failAction keeps the row busy until endAction", () => {
    const store = createTaskActionsStore();
    store.actions.startAction("t1");
    store.actions.failAction("Something went wrong. Try again.");
    expect(store.state).toMatchObject({ busyId: "t1", actionError: "Something went wrong. Try again." });
    store.actions.endAction();
    expect(store.state).toMatchObject({ busyId: null, actionError: "Something went wrong. Try again." });
  });

  it("carries the delete-flow actions", () => {
    const store = createTaskActionsStore();
    store.actions.beginDelete({ id: "t1", title: "Review the brief" });
    expect(store.state.delete.pending).toEqual({ id: "t1", title: "Review the brief" });
  });
});
