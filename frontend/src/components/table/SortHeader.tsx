import clsx from "clsx";

/** The two column methods a sort button needs; every sortable column has them. */
export interface SortableColumn {
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => undefined | ((event: unknown) => void);
}

/**
 * A sortable column's header button (D68): the plain label as its accessible
 * name, a ▲/▼ glyph and stronger weight on the active column, a faint ↕ on the
 * others. The state itself is announced by the <th>'s aria-sort (TableView).
 */
export function SortHeader({ column, label }: { column: SortableColumn; label: string }) {
  const sorted = column.getIsSorted();
  const active = sorted !== false;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={clsx(
        "inline-flex items-center gap-1 underline-offset-2 hover:underline",
        active ? "font-semibold text-slate-900" : "font-medium text-slate-700",
      )}
    >
      {label}
      <span aria-hidden="true" className={active ? undefined : "text-slate-300"}>
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
      </span>
    </button>
  );
}
