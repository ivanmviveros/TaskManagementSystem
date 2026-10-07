import { createStore } from "@tanstack/react-store";

import { IDLE_DELETE, deleteFlowActions, type DeleteFlow } from "../../lib/delete-flow";
import type { StoreApi } from "../../lib/store-api";

/** What the delete dialog needs: the list and detail payloads both satisfy it. */
export type DeleteTarget = { id: string; title: string };

/**
 * The task list's and detail page's UI state (D87): the delete dialog, the row
 * whose action is in flight, and the last action's failure. Each page creates
 * its own with useCreateStore, so it starts clean on every visit.
 */
export type TaskActionsState = {
  delete: DeleteFlow<DeleteTarget>;
  busyId: string | null;
  actionError: string | null;
};

/** Frozen: every store created from it shares this one object. */
export const initialTaskActionsState: TaskActionsState = Object.freeze({
  delete: IDLE_DELETE,
  busyId: null,
  actionError: null,
});

export const taskActions = (api: StoreApi<TaskActionsState>) => ({
  ...deleteFlowActions(api),
  startAction: (id: string) => api.setState((state) => ({ ...state, busyId: id, actionError: null })),
  failAction: (message: string) => api.setState((state) => ({ ...state, actionError: message })),
  endAction: () => api.setState((state) => ({ ...state, busyId: null })),
});

/** For unit tests. Pages create theirs with useCreateStore (spec §4.0). */
export const createTaskActionsStore = () => createStore(initialTaskActionsState, taskActions);
export type TaskActionsStore = ReturnType<typeof createTaskActionsStore>;
