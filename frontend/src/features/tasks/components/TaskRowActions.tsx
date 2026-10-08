import { useSelector } from "@tanstack/react-store";

import { Button } from "../../../components/Button";
import { useTaskActionsContext } from "../task-actions-context";
import type { TaskListItem } from "../types";

/**
 * The UX mirror of D27. `task.can_delete` comes from the API, which applies the
 * same predicate the permission class enforces — so the UI never offers a delete
 * the backend would refuse, and the rule is not duplicated here (F7).
 *
 * Must render inside TaskActionsProvider: it reads the page's store and actions from it.
 */
export function TaskRowActions({ task }: { task: TaskListItem }) {
  const { store, actions } = useTaskActionsContext();
  // The busy flip notifies only this row's selector (D87).
  const isBusy = useSelector(store, (state) => state.busyId === task.id);
  const isOpen = task.status === "PENDING" || task.status === "IN_PROGRESS";
  return (
    <div className="flex flex-wrap gap-2">
      {isOpen && (
        <Button
          variant="secondary"
          disabled={isBusy}
          onClick={() => void actions.complete(task)}
          aria-label={`Complete ${task.title}`}
        >
          Complete
        </Button>
      )}
      {task.can_delete && (
        <Button
          variant="danger"
          disabled={isBusy}
          onClick={() => actions.beginDelete(task)}
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
