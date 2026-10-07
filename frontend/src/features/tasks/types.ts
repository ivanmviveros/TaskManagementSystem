import type { CurrentUser } from "../auth/types";
import type { Ordering } from "./sorting";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** Every status, in display order. One list, as D56 did for ROLES (D73). */
export const TASK_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/** The §8.3 pagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** TaskListSerializer (spec §8.2). Note: no created_by — the list does not join it. */
export interface TaskListItem {
  id: string; // UUIDv7 string, never a number (D28)
  title: string;
  status: TaskStatus;
  due_date: string | null;
  assignee: CurrentUser | null;
  is_overdue: boolean;
  /**
   * D27, reported by the API rather than re-derived here. The list payload has
   * no created_by, so the frontend cannot compute this — and re-deriving an
   * authorization rule client-side is how the UI and the API drift (F7).
   */
  can_delete: boolean;
  created_at: string;
}

/** TaskDetailSerializer (spec §8.2). */
export interface TaskDetail extends TaskListItem {
  description: string;
  created_by: CurrentUser;
  completed_at: string | null;
  updated_at: string;
  /**
   * D39: the statuses a PATCH may move this task to, reported by the API from
   * its transition table rather than re-derived here. Empty for a terminal
   * task; never contains COMPLETED, which only the complete action reaches.
   */
  allowed_transitions: TaskStatus[];
}

export interface TaskStats {
  total: number;
  by_status: Record<TaskStatus, number>;
  overdue: number;
  due_next_7_days: number;
}

/** Local UI state, mirrored into the query string. */
export interface TaskFilters {
  status?: TaskStatus[];
  due_date_after?: string;
  due_date_before?: string;
  overdue?: boolean;
  assignee?: string;
  ordering?: Ordering;
  page?: number;
  page_size?: number;
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  due_date?: string | null;
  assignee?: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  due_date?: string | null;
  assignee?: string | null;
  status?: TaskStatus;
}
