import clsx from "clsx";

import type { TaskStatus } from "../types";

/** Uses the status.* tokens from tailwind.config.js, never arbitrary hex. */
const TOKEN: Record<TaskStatus, string> = {
  PENDING: "bg-status-pending",
  IN_PROGRESS: "bg-status-progress",
  COMPLETED: "bg-status-completed",
  CANCELLED: "bg-status-cancelled",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={clsx(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white",
        TOKEN[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function OverdueBadge() {
  return (
    <span className="ml-2 inline-block rounded-full bg-status-overdue px-2 py-0.5 text-xs font-medium text-white">
      Overdue
    </span>
  );
}
