import { Link } from "@tanstack/react-router";

import type { TaskListSearch } from "../../../app/search-params";
import type { TaskListItem } from "../types";
import { OverdueBadge, StatusBadge } from "./StatusBadge";
import { TaskRowActions } from "./TaskRowActions";

interface TaskCardProps {
  task: TaskListItem;
  showAssignee: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  isBusy?: boolean;
  /** Left in history state by the title link, so the detail can return here (D70). */
  listSearch: TaskListSearch;
}

/**
 * The below-`lg` presentation (D69) of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader (spec §11.6).
 */
export function TaskCard({
  task,
  showAssignee,
  onComplete,
  onDelete,
  isBusy = false,
  listSearch,
}: TaskCardProps) {
  return (
    <article className="mb-3 rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-medium">
        <Link
          to="/tasks/$taskId"
          params={{ taskId: task.id }}
          state={{ tasksSearch: listSearch }}
          className="text-status-progress"
        >
          {task.title}
        </Link>
        {task.is_overdue && <OverdueBadge />}
      </h3>
      <dl className="mb-3 grid grid-cols-2 gap-1 text-sm text-slate-600">
        <dt className="font-medium">Status</dt>
        <dd>
          <StatusBadge status={task.status} />
        </dd>
        <dt className="font-medium">Due</dt>
        <dd>{task.due_date === null ? "—" : new Date(task.due_date).toLocaleDateString()}</dd>
        {showAssignee && (
          <>
            <dt className="font-medium">Assignee</dt>
            <dd>
              {task.assignee === null
                ? "Unassigned"
                : `${task.assignee.first_name} ${task.assignee.last_name}`}
            </dd>
          </>
        )}
      </dl>
      <TaskRowActions task={task} onComplete={onComplete} onDelete={onDelete} isBusy={isBusy} />
    </article>
  );
}
