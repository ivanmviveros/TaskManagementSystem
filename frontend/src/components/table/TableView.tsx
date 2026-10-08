import { useTableContext } from "./table-contexts";

function ariaSort(sorted: false | "asc" | "desc") {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

/** The app's table markup (D83): the header groups and rows of the table in context. */
export function TableView() {
  const table = useTableContext();
  return (
    <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id} className="border-b border-slate-200">
            {group.headers.map((header) => (
              <th
                key={header.id}
                scope="col"
                // D68: only a sortable column announces a sort state.
                aria-sort={
                  header.column.getCanSort() ? ariaSort(header.column.getIsSorted()) : undefined
                }
                className="p-3 font-medium text-slate-700"
              >
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="border-b border-slate-100">
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} className={cell.column.columnDef.meta?.cellClassName ?? "p-3"}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
