import { ROLES, type Role } from "../features/auth/types";
import { isOrdering, type Ordering } from "../features/tasks/sorting";
import { TASK_STATUSES, type TaskStatus } from "../features/tasks/types";
import { isPageSize, type PageSize } from "../lib/pagination";

/**
 * The URL is the lists' only state (D45), so these are the single parse
 * boundary for it. Anything a validator cannot use becomes undefined — the
 * list's default — rather than reaching the API or a control that cannot
 * show it (D48).
 */
export interface TaskListSearch {
  status?: TaskStatus[];
  due_date_after?: string;
  due_date_before?: string;
  overdue?: boolean;
  ordering?: Ordering;
  page?: number;
  page_size?: PageSize;
}

export interface UserListSearch {
  role?: Role;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: PageSize;
}

/** Coerces one raw search value into a string array, tolerating a single value. */
function asArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value !== "") return [value];
  return undefined;
}

/** Statuses the API knows, or undefined when none survive (D73). */
function asStatuses(value: unknown): TaskStatus[] | undefined {
  const known = asArray(value)?.filter((status): status is TaskStatus =>
    (TASK_STATUSES as string[]).includes(status),
  );
  return known === undefined || known.length === 0 ? undefined : known;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Free text. A hand-written ?search=2026 arrives as a number (spec §1.2.4). */
function asText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return asString(value);
}

function asPage(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

function asPageSize(value: unknown): PageSize | undefined {
  const size = typeof value === "string" ? Number(value) : value;
  return isPageSize(size) ? size : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function asRole(value: unknown): Role | undefined {
  return ROLES.find((role) => role === value);
}

export function validateTaskListSearch(search: Record<string, unknown>): TaskListSearch {
  return {
    status: asStatuses(search.status),
    due_date_after: asString(search.due_date_after),
    due_date_before: asString(search.due_date_before),
    // true only: the UI never sets false, and overdue=false means something else to the API.
    overdue: search.overdue === true || search.overdue === "true" ? true : undefined,
    ordering: isOrdering(search.ordering) ? search.ordering : undefined,
    page: asPage(search.page),
    page_size: asPageSize(search.page_size),
  };
}

export function validateUserListSearch(search: Record<string, unknown>): UserListSearch {
  return {
    role: asRole(search.role),
    is_active: asBoolean(search.is_active),
    search: asText(search.search),
    page: asPage(search.page),
    page_size: asPageSize(search.page_size),
  };
}
