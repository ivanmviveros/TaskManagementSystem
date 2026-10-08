import { ApiError } from "../../../lib/api-error";
import type { DeleteTarget, TaskActionsStore } from "../task-actions-store";
import { useCompleteTask, useDeleteTask } from "./useTaskMutations";

export interface TaskActions {
  complete: (task: { id: string }) => Promise<void>;
  beginDelete: (task: DeleteTarget) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  isDeleting: boolean;
}

/**
 * The task actions a page offers, over its own task-actions store (D87): the
 * store holds what the UI shows, the mutations do the work.
 *
 * `onDeleted` replaces closing the dialog after a successful delete: the detail
 * page navigates back to the list with the dialog still open, as it always has.
 */
export function useTaskActions(
  store: TaskActionsStore,
  { onDeleted }: { onDeleted?: () => Promise<unknown> } = {},
): TaskActions {
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const { actions } = store;

  async function complete(task: { id: string }) {
    actions.startAction(task.id);
    try {
      await completeTask.mutateAsync(task.id);
    } catch (caught) {
      actions.failAction(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again.",
      );
    } finally {
      actions.endAction();
    }
  }

  async function confirmDelete() {
    const target = store.state.delete.pending;
    if (target === null) return;
    actions.clearDeleteError();
    try {
      await deleteTask.mutateAsync(target.id);
      if (onDeleted === undefined) actions.cancelDelete();
      else await onDeleted();
    } catch (caught) {
      actions.failDelete(caught instanceof ApiError ? caught.message : "Could not delete that task.");
    }
  }

  return {
    complete,
    beginDelete: actions.beginDelete,
    cancelDelete: actions.cancelDelete,
    confirmDelete,
    isDeleting: deleteTask.isPending,
  };
}
