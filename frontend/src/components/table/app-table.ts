import { createTableHook } from "@tanstack/react-table";

import { Pagination } from "./Pagination";
import { TableView } from "./TableView";
import { cellContext, headerContext, tableContext } from "./table-contexts";
import { appTableFeatures } from "./table-features";

/**
 * Every table's shared setup (D83, D84). The server sorts and pages; one sort at
 * a time, and a click on the active column flips it rather than removing it;
 * rows are keyed by id, so every table's rows must carry a string `id`. A table owns no state: each page passes `state` from the
 * URL and writes changes back with `navigate`.
 */
export const { useAppTable, createAppColumnHelper } = createTableHook({
  features: appTableFeatures,
  getRowId: (row: { id: string }) => row.id,
  manualSorting: true,
  manualPagination: true,
  autoResetPageIndex: false,
  enableMultiSort: false,
  enableSortingRemoval: false,
  sortDescFirst: false,
  tableContext,
  cellContext,
  headerContext,
  tableComponents: { TableView, Pagination },
});
