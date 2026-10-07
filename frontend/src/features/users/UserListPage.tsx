import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/Button";
import { ApiError } from "../../lib/api-error";
import { Pagination } from "../tasks/components/Pagination";
import type { Role } from "../auth/types";
import { DeleteUserDialog } from "./components/DeleteUserDialog";
import { UserCard } from "./components/UserCard";
import { UserTable } from "./components/UserTable";
import { useDeleteUser, useUsers } from "./hooks/useUsers";
import type { UserDetail, UserFilters } from "./types";

const PAGE_SIZE = 20;
const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "OPERATOR"];

export function UserListPage() {
  const [filters, setFilters] = useState<UserFilters>({ page: 1, page_size: PAGE_SIZE });
  const [pendingDelete, setPendingDelete] = useState<UserDetail | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, error } = useUsers(filters);
  const remove = useDeleteUser();

  /** Any filter change resets to page 1, or a filter applied on page 3 looks empty. */
  function applyFilters(next: UserFilters) {
    setFilters({ ...next, page: 1, page_size: PAGE_SIZE });
  }

  function beginDelete(user: UserDetail) {
    setDeleteError(null);
    setPendingDelete(user);
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "Could not deactivate that user.",
      );
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Users</h1>
        <Link to="/users/new" className="ml-auto">
          <Button>New user</Button>
        </Link>
      </div>

      <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label htmlFor="search" className="mb-1 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              id="search"
              type="search"
              value={filters.search ?? ""}
              onChange={(event) =>
                applyFilters({ ...filters, search: event.target.value || undefined })
              }
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="role-filter" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="role-filter"
              value={filters.role ?? ""}
              onChange={(event) =>
                applyFilters({ ...filters, role: (event.target.value || undefined) as Role })
              }
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={filters.is_active === false}
              onChange={(event) =>
                applyFilters({ ...filters, is_active: event.target.checked ? false : undefined })
              }
            />
            Inactive only
          </label>
        </div>
      </section>

      {isPending && (
        <p role="status" className="text-sm text-slate-500">
          Loading users…
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-status-overdue">
          {error instanceof ApiError ? error.message : "Could not load users."}
        </p>
      )}

      {data !== undefined && data.results.length === 0 && (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          No users match these filters.
        </p>
      )}

      {data !== undefined && data.results.length > 0 && (
        <>
          {/* The table collapses to stacked cards below md (spec §5.2). */}
          <div className="hidden overflow-x-auto md:block">
            <UserTable users={data.results} onDelete={beginDelete} />
          </div>
          <div className="md:hidden">
            {data.results.map((user) => (
              <UserCard key={user.id} user={user} onDelete={beginDelete} />
            ))}
          </div>

          <Pagination
            count={data.count}
            page={filters.page ?? 1}
            pageSize={PAGE_SIZE}
            hasNext={data.next !== null}
            hasPrevious={data.previous !== null}
            onPageChange={(page) => setFilters({ ...filters, page })}
          />
        </>
      )}

      {pendingDelete !== null && (
        <DeleteUserDialog
          user={pendingDelete}
          error={deleteError}
          isDeleting={remove.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
