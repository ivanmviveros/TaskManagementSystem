import { createAppColumnHelper } from "../../components/table/app-table";
import { ROLE_LABEL } from "../auth/types";
import { UserRowActions } from "./components/UserRowActions";
import type { UserDetail } from "./types";

const columnHelper = createAppColumnHelper<UserDetail>();
const MUTED = { cellClassName: "p-3 text-slate-600" };

/**
 * The ≥md user table's columns (D83), at module scope so the table's inputs
 * stay stable. Nothing sorts: the API offers no ordering for users. The Actions
 * cell renders UserRowActions, so these columns need UserListProvider above the table.
 */
export const userColumns = columnHelper.columns([
  columnHelper.display({
    id: "name",
    header: "Name",
    cell: ({ row }) => `${row.original.first_name} ${row.original.last_name}`,
  }),
  columnHelper.accessor("email", { header: "Email", cell: (info) => info.getValue(), meta: MUTED }),
  columnHelper.accessor("role", {
    header: "Role",
    // F13: the label, never the stored value.
    cell: (info) => ROLE_LABEL[info.getValue()],
    meta: MUTED,
  }),
  columnHelper.accessor("is_active", {
    header: "Active",
    cell: (info) => (info.getValue() ? "Yes" : "No"),
    meta: MUTED,
  }),
  columnHelper.display({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <UserRowActions user={row.original} />,
  }),
]);
