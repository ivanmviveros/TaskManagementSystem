import { Link, useSearch } from "@tanstack/react-router";

import type { TaskListSearch } from "../../../app/search-params";
import type { TaskListItem } from "../types";

/**
 * A task's title, linking to its detail. It leaves the list's search in history
 * state, so the detail can return to the same filtered, paged, sorted list (D70).
 */
export function TaskTitleLink({ task, className }: { task: TaskListItem; className: string }) {
  // Annotated because the router is not type-registered, so useSearch returns any.
  const listSearch: TaskListSearch = useSearch({ from: "/shell/tasks" });
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      state={{ tasksSearch: listSearch }}
      className={className}
    >
      {task.title}
    </Link>
  );
}
