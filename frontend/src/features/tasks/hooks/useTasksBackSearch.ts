import { useLocation } from "@tanstack/react-router";

import { validateTaskListSearch, type TaskListSearch } from "../../../app/search-params";

/**
 * The task list search to return to (D70): what a list link left in this
 * history entry, validated like a URL because history state is just as
 * hand-editable. With none — a deep link, the dashboard — it resolves to the
 * plain list. The result always carries every key, undefined where unset.
 */
export function useTasksBackSearch(): TaskListSearch {
  const left = useLocation({ select: (location) => location.state.tasksSearch });
  return validateTaskListSearch((left ?? {}) as Record<string, unknown>);
}
