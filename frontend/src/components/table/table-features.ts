import {
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Every table's features (D83). No row models: the server sorts and pages, so
 * the table only keeps the state and the column APIs.
 */
export const appTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  /** Type-only: what a column may carry in `meta`. */
  columnMeta: {} as { cellClassName?: string },
});

export type AppTableFeatures = typeof appTableFeatures;
