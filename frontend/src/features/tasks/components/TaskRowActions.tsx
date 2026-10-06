import { Button } from "../../../components/Button";
import type { TaskListItem } from "../types";

interface TaskRowActionsProps {
  task: TaskListItem;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  isBusy?: boolean;
}

/**
 * The UX mirror of D27. `task.can_delete` comes from the API, which applies the
 * same predicate the permission class enforces — so the UI never offers a delete
 * the backend would refuse, and the rule is not duplicated here (F7).
 */
export function TaskRowActions({ task, onComplete, onDelete, isBusy = false }: TaskRowActionsProps) {
  const isOpen = task.status === "PENDING" || task.status === "IN_PROGRESS";
  return (
    <div className="flex flex-wrap gap-2">
      {isOpen && (
        <Button
          variant="secondary"
          disabled={isBusy}
          onClick={() => onComplete(task.id)}
          aria-label={`Complete ${task.title}`}
        >
          Complete
        </Button>
      )}
      {task.can_delete && (
        <Button
          variant="danger"
          disabled={isBusy}
          onClick={() => onDelete(task.id)}
          aria-label={`Delete ${task.title}`}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
