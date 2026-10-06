import { apiClient } from "../../../lib/api-client";
import type {
  Paginated,
  TaskCreateInput,
  TaskDetail,
  TaskFilters,
  TaskListItem,
  TaskStats,
  TaskUpdateInput,
} from "../types";

/**
 * Builds the query string for §8.4.
 *
 * `status` is appended REPEATEDLY rather than comma-joined, because the backend
 * uses a MultipleChoiceFilter which reads repeated parameters — a single
 * `status=A,B` would be rejected as an invalid choice.
 */
export function buildTaskQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  for (const status of filters.status ?? []) params.append("status", status);
  if (filters.due_date_after !== undefined) params.set("due_date_after", filters.due_date_after);
  if (filters.due_date_before !== undefined) params.set("due_date_before", filters.due_date_before);
  if (filters.overdue !== undefined) params.set("overdue", String(filters.overdue));
  if (filters.assignee !== undefined) params.set("assignee", filters.assignee);
  if (filters.ordering !== undefined) params.set("ordering", filters.ordering);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.page_size !== undefined) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export const listTasks = (filters: TaskFilters) =>
  apiClient.get<Paginated<TaskListItem>>(`/tasks/${buildTaskQuery(filters)}`);

export const getTask = (id: string) => apiClient.get<TaskDetail>(`/tasks/${id}/`);

export const createTask = (input: TaskCreateInput) =>
  apiClient.post<TaskDetail>("/tasks/", input);

export const updateTask = (id: string, input: TaskUpdateInput) =>
  apiClient.patch<TaskDetail>(`/tasks/${id}/`, input);

/** The ONLY path to COMPLETED (D18). */
export const completeTask = (id: string) =>
  apiClient.post<TaskDetail>(`/tasks/${id}/complete/`, {});

export const deleteTask = (id: string) => apiClient.delete(`/tasks/${id}/`);

export const getTaskStats = () => apiClient.get<TaskStats>("/tasks/stats/");
