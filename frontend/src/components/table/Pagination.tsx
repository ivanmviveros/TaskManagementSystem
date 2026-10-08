import { useId } from "react";

import { PAGE_SIZES, pageWindow } from "../../lib/pagination";
import { Button } from "../Button";
import { useTableContext } from "./table-contexts";

/**
 * The pager, reading the table's pagination model (D85). Numbered pages need
 * the row count, which the API's `count` gives (D52). Every move goes through
 * the table, whose onPaginationChange decides push or replace (D47).
 */
export function Pagination() {
  const table = useTableContext();
  const sizeId = useId();
  const { pageIndex, pageSize } = table.state.pagination;
  const count = table.getRowCount();
  const totalPages = Math.max(1, table.getPageCount());
  const current = Math.min(Math.max(pageIndex + 1, 1), totalPages);
  const first = count === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, count);
  // From the clamped `current`, as before, so an out-of-range page still has a
  // working Prev; the table's own getCanPreviousPage reads the raw index.
  const atStart = current === 1;
  const atEnd = current === totalPages;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="Pagination" className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={atStart}
          onClick={() => table.setPageIndex(0)}
          aria-label="First page"
        >
          « <span className="hidden sm:inline">First</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={atStart}
          onClick={() => table.setPageIndex(current - 2)}
          aria-label="Previous page"
        >
          ‹ <span className="hidden sm:inline">Prev</span>
        </Button>

        {/* Up to thirteen controls do not fit a phone; below sm the count replaces the numbers (D49). */}
        <ul className="hidden items-center gap-1 sm:flex">
          {pageWindow(current, totalPages).map((item, index) =>
            item === "gap" ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-slate-500">
                …
              </li>
            ) : (
              // Keyed by page number, so the button just clicked is the same
              // element once it becomes the current page (D55).
              <li key={item}>
                <Button
                  variant={item === current ? "primary" : "secondary"}
                  size="sm"
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? "page" : undefined}
                  onClick={() => {
                    if (item !== current) table.setPageIndex(item - 1);
                  }}
                >
                  {item}
                </Button>
              </li>
            ),
          )}
        </ul>
        <span className="px-2 text-sm text-slate-600 sm:hidden">
          Page {current} of {totalPages}
        </span>

        <Button
          variant="secondary"
          size="sm"
          disabled={atEnd}
          onClick={() => table.setPageIndex(current)}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span> ›
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={atEnd}
          onClick={() => table.setPageIndex(totalPages - 1)}
          aria-label="Last page"
        >
          <span className="hidden sm:inline">Last</span> »
        </Button>
      </nav>

      <p className="text-sm text-slate-600">
        {first}–{last} of {count}
      </p>

      <div className="flex items-center gap-2">
        <label htmlFor={sizeId} className="text-sm text-slate-700">
          Rows per page
        </label>
        <select
          id={sizeId}
          value={pageSize}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
