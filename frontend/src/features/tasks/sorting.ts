import type { SortingState } from "@tanstack/react-table";

/**
 * The task list's one sort model (D67). The table header, the below-lg select
 * and URL validation all read this, so they cannot disagree about which
 * orderings exist or what "no ordering" means.
 */

export const SORT_FIELDS = [
  { field: "due_date", label: "Due date" },
  { field: "status", label: "Status" },
  { field: "created_at", label: "Created" },
] as const;

export type SortField = (typeof SORT_FIELDS)[number]["field"];
export type Ordering = SortField | `-${SortField}`;
export type SortDirection = "ascending" | "descending";

/** The API's own default (spec §8.3), so "no parameter" is shown as what it is. */
export const DEFAULT_ORDERING: Ordering = "-created_at";

/** The below-lg select's options, in display order, default first. */
export const SORT_OPTIONS: readonly { value: Ordering; label: string }[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "due_date", label: "Due date, earliest first" },
  { value: "-due_date", label: "Due date, latest first" },
  { value: "status", label: "Status, A–Z" },
  { value: "-status", label: "Status, Z–A" },
];

const ORDERINGS = SORT_FIELDS.flatMap(({ field }) => [field, `-${field}`]) as readonly Ordering[];

/** The six values the UI writes; anything else is dropped by validateSearch (D73). */
export function isOrdering(value: unknown): value is Ordering {
  return typeof value === "string" && (ORDERINGS as readonly string[]).includes(value);
}

/** undefined (or anything unknown) resolves to the default, so it is displayed too. */
export function parseOrdering(ordering: string | undefined): {
  field: SortField;
  direction: SortDirection;
} {
  const resolved = isOrdering(ordering) ? ordering : DEFAULT_ORDERING;
  const descending = resolved.startsWith("-");
  return {
    // Correct by construction: ORDERINGS derives from SORT_FIELDS, and TS cannot
    // narrow a template-literal slice.
    field: (descending ? resolved.slice(1) : resolved) as SortField,
    direction: descending ? "descending" : "ascending",
  };
}

/** Each sortable column's header label, from the same list (D67). */
export const SORT_LABEL = Object.fromEntries(
  SORT_FIELDS.map(({ field, label }) => [field, label]),
) as Record<SortField, string>;

/**
 * The table's sort state for an ordering (D84). None, or anything unknown, is
 * shown as the default, as an active sort (D48).
 */
export function orderingToSorting(ordering: string | undefined): SortingState {
  const { field, direction } = parseOrdering(ordering);
  return [{ id: field, desc: direction === "descending" }];
}

/**
 * The ordering for the table's sort state (D84). Undefined for the default, so
 * the URL stays canonical (D48), and for anything the API does not accept.
 * Reads only the first entry: the table is single-sort (`enableMultiSort: false`).
 */
export function sortingToOrdering(sorting: SortingState): Ordering | undefined {
  const [first] = sorting;
  if (first === undefined) return undefined;
  const ordering = first.desc ? `-${first.id}` : first.id;
  return isOrdering(ordering) && ordering !== DEFAULT_ORDERING ? ordering : undefined;
}
