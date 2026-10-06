import { apiClient } from "../../../lib/api-client";
import type { Paginated } from "../../tasks/types";
import type { UserCreateInput, UserDetail, UserFilters, UserMinimal, UserUpdateInput } from "../types";

export function buildUserQuery(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.role !== undefined) params.set("role", filters.role);
  if (filters.is_active !== undefined) params.set("is_active", String(filters.is_active));
  if (filters.search !== undefined && filters.search !== "") params.set("search", filters.search);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.page_size !== undefined) params.set("page_size", String(filters.page_size));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export const listUsers = (filters: UserFilters) =>
  apiClient.get<Paginated<UserDetail>>(`/users/${buildUserQuery(filters)}`);

export const getUser = (id: string) => apiClient.get<UserDetail>(`/users/${id}/`);

export const createUser = (input: UserCreateInput) =>
  apiClient.post<UserDetail>("/users/", input);

export const updateUser = (id: string, input: UserUpdateInput) =>
  apiClient.patch<UserDetail>(`/users/${id}/`, input);

export const deleteUser = (id: string) => apiClient.delete(`/users/${id}/`);

/**
 * Users who may hold a task: the assignee picker's options.
 *
 * Admins are excluded client-side as well as server-side (D17) so the picker
 * never offers an assignee the API would reject with assignee_not_assignable.
 */
export const listAssignableUsers = () =>
  apiClient.get<Paginated<UserMinimal>>("/users/?page_size=100");
