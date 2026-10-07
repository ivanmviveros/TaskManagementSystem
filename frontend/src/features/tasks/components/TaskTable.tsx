import { Link } from "@tanstack/react-router";
import clsx from "clsx";

import type { TaskListSearch } from "../../../app/search-params";
import { SORT_FIELDS, nextOrdering, parseOrdering } from "../sorting";
import type { TaskListItem } from "../types";
import { OverdueBadge, StatusBadge } from "./StatusBadge";
import { TaskRowActions } from "./TaskRowActions";

interface TaskTableProps {
  tasks: TaskListItem[];
  /** Hidden for an Operator, whose list is self-scoped so the column is noise. */
  showAssignee: boolean;
  ordering: string | undefined;
  onOrderingChange: (ordering: string | undefined) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  busyId?: string | null;
  /** Left in history state by each title link, so the detail can return here (D70). */
  listSearch: TaskListSearch;
}

export function TaskTable({
  tasks,
  showAssignee,
  ordering,
  onOrderingChange,
  onComplete,
  onDelete,
  busyId = null,
  listSearch,
}: TaskTableProps) {
  const sort = parseOrdering(ordering);
  return (
    <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th scope="col" className="p-3 font-medium text-slate-700">
            Title
          </th>
          {SORT_FIELDS.map(({ field, label }) => {
            const active = sort.field === field;
            return (
              <th
                key={field}
                scope="col"
                // D68: the state a screen reader announces, and the visible glyph below.
                aria-sort={active ? sort.direction : "none"}
                className="p-3 font-medium text-slate-700"
              >
                <button
                  type="button"
                  onClick={() => onOrderingChange(nextOrdering(ordering, field))}
                  className={clsx(
                    "inline-flex items-center gap-1 underline-offset-2 hover:underline",
                    active ? "font-semibold text-slate-900" : "font-medium text-slate-700",
                  )}
                >
                  {label}
                  <span aria-hidden="true" className={active ? undefined : "text-slate-300"}>
                    {active ? (sort.direction === "ascending" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </th>
            );
          })}
          {showAssignee && (
            <th scope="col" className="p-3 font-medium text-slate-700">
              Assignee
            </th>
          )}
          <th scope="col" className="p-3 font-medium text-slate-700">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id} className="border-b border-slate-100">
            <td className="p-3">
              <Link
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
                state={{ tasksSearch: listSearch }}
                className="text-status-progress underline-offset-2 hover:underline">
                {task.title}
              </Link>
              {task.is_overdue && <OverdueBadge />}
            </td>
            <td className="p-3 text-slate-600">
              {task.due_date === null ? "—" : new Date(task.due_date).toLocaleDateString()}
            </td>
            <td className="p-3">
              <StatusBadge status={task.status} />
            </td>
            <td className="p-3 text-slate-600">
              {new Date(task.created_at).toLocaleDateString()}
            </td>
            {showAssignee && (
              <td className="p-3 text-slate-600">
                {task.assignee === null
                  ? "Unassigned"
                  : `${task.assignee.first_name} ${task.assignee.last_name}`}
              </td>
            )}
            <td className="p-3">
              <TaskRowActions
                task={task}
                onComplete={onComplete}
                onDelete={onDelete}
                isBusy={busyId === task.id}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
