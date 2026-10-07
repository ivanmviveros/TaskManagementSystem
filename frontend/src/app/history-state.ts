import type { TaskListSearch } from "./search-params";

/**
 * D70: what a link may leave in a history entry. Declared once, so every
 * Link `state` and every `useLocation().state` read is typed.
 */
declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The task list's search when the user left it, to return to it. */
    tasksSearch?: TaskListSearch;
  }
}
