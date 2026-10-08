import { createAppColumnHelper } from "../../components/table/app-table";
import { SortHeader } from "../../components/table/SortHeader";
import { formatDueDate } from "../../lib/dates";
import { OverdueBadge, StatusBadge } from "./components/StatusBadge";
import { TaskRowActions } from "./components/TaskRowActions";
import { TaskTitleLink } from "./components/TaskTitleLink";
import { SORT_LABEL } from "./sorting";
import type { TaskListItem } from "./types";

const columnHelper = createAppColumnHelper<TaskListItem>();
const MUTED = { cellClassName: "p-3 text-slate-600" };

/**
 * The ≥lg task table's columns (D83, D84), at module scope so the table's inputs
 * stay stable. The sortable columns' ids are the API's ordering fields, so a
 * column's sort maps straight to `ordering`. An accessor column sorts unless it
 * opts out, so Title and Assignee set enableSorting: false — otherwise they
 * would announce aria-sort="none" (D68). The Title and Actions cells render
 * context-reading components, so these columns need TaskActionsProvider and the
 * tasks route above the table.
 */
export const taskColumns = columnHelper.columns([
  columnHelper.accessor("title", {
    header: "Title",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <TaskTitleLink
          task={row.original}
          className="text-status-progress underline-offset-2 hover:underline"
        />
        {row.original.is_overdue && <OverdueBadge />}
      </>
    ),
  }),
  columnHelper.accessor("due_date", {
    header: ({ column }) => <SortHeader column={column} label={SORT_LABEL.due_date} />,
    cell: (info) => {
      const due = info.getValue();
      return due === null ? "—" : formatDueDate(due);
    },
    meta: MUTED,
  }),
  columnHelper.accessor("status", {
    header: ({ column }) => <SortHeader column={column} label={SORT_LABEL.status} />,
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("created_at", {
    header: ({ column }) => <SortHeader column={column} label={SORT_LABEL.created_at} />,
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
    meta: MUTED,
  }),
  columnHelper.accessor("assignee", {
    header: "Assignee",
    enableSorting: false,
    cell: (info) => {
      const assignee = info.getValue();
      return assignee === null ? "Unassigned" : `${assignee.first_name} ${assignee.last_name}`;
    },
    meta: MUTED,
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <TaskRowActions task={row.original} />,
  }),
]);
