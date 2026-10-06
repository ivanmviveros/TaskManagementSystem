import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/Button";
import { ApiError } from "../../lib/api-error";
import { Pagination } from "../tasks/components/Pagination";
import type { Role } from "../auth/types";
import { DeleteUserDialog } from "./components/DeleteUserDialog";
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="p-3 font-medium text-slate-700">
                    Name
                  </th>
                  <th scope="col" className="p-3 font-medium text-slate-700">
                    Email
                  </th>
                  <th scope="col" className="p-3 font-medium text-slate-700">
                    Role
                  </th>
                  <th scope="col" className="p-3 font-medium text-slate-700">
                    Active
                  </th>
                  <th scope="col" className="p-3 font-medium text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="p-3">
                      {user.first_name} {user.last_name}
                    </td>
                    <td className="p-3 text-slate-600">{user.email}</td>
                    <td className="p-3 text-slate-600">{user.role}</td>
                    <td className="p-3 text-slate-600">{user.is_active ? "Yes" : "No"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <Link to="/users/$userId" params={{ userId: user.id }}>
                          <Button variant="secondary" aria-label={`Edit ${user.email}`}>
                            Edit
                          </Button>
                        </Link>
                        <Button
                          variant="danger"
                          aria-label={`Deactivate ${user.email}`}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(user);
                          }}
                        >
                          Deactivate
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
