import { createTableHookContexts } from "@tanstack/react-table";

import type { AppTableFeatures } from "./table-features";

/**
 * The table contexts (D83). A module of its own: TableView and Pagination
 * import their hook from here, never from app-table.ts, which imports them —
 * Table's docs warn that such a cycle breaks Vite HMR.
 */
export const { tableContext, cellContext, headerContext, useTableContext } =
  createTableHookContexts<AppTableFeatures>();
