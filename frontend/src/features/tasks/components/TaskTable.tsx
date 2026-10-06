import { Link } from "@tanstack/react-router";

import type { TaskListItem } from "../types";
import { OverdueBadge, StatusBadge } from "./StatusBadge";
import { TaskRowActions } from "./TaskRowActions";

interface TaskTableProps {
  tasks: TaskListItem[];
  /** Hidden for an Operator, whose list is self-scoped so the column is noise. */
  showAssignee: boolean;
  ordering: string | undefined;
  onOrderingChange: (ordering: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  busyId?: string | null;
}

const SORTABLE: { field: string; label: string }[] = [
  { field: "due_date", label: "Due date" },
  { field: "status", label: "Status" },
  { field: "created_at", label: "Created" },
];

function nextOrdering(current: string | undefined, field: string): string {
  return current === field ? `-${field}` : field;
}

export function TaskTable({
  tasks,
  showAssignee,
  ordering,
  onOrderingChange,
  onComplete,
  onDelete,
  busyId = null,
}: TaskTableProps) {
  return (
    <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th scope="col" className="p-3 font-medium text-slate-700">
            Title
          </th>
          {SORTABLE.map(({ field, label }) => (
            <th key={field} scope="col" className="p-3 font-medium text-slate-700">
              <button
                type="button"
                onClick={() => onOrderingChange(nextOrdering(ordering, field))}
                aria-label={`Sort by ${label.toLowerCase()}`}
                className="font-medium text-slate-700 underline-offset-2 hover:underline"
              >
                {label}
              </button>
            </th>
          ))}
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
              <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="text-status-progress underline-offset-2 hover:underline">
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
