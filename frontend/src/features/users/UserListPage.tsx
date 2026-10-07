import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useState } from "react";

import type { UserListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { Pagination } from "../../components/Pagination";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../lib/pagination";
import { useSearchParamDraft } from "../../lib/useSearchParamDraft";
import { useAuth } from "../auth/hooks/useAuth";
import { ROLE_LABEL, ROLES, type Role } from "../auth/types";
import { DeleteUserDialog } from "./components/DeleteUserDialog";
import { UserCard } from "./components/UserCard";
import { UserTable } from "./components/UserTable";
import { useDeleteUser, useUsers } from "./hooks/useUsers";
import type { UserDetail, UserFilters } from "./types";

type SearchUpdate = (prev: UserListSearch) => UserListSearch;
type UserFilterPatch = Partial<Pick<UserListSearch, "role" | "is_active" | "search">>;

export function UserListPage() {
  const { user: currentUser } = useAuth();
  // The URL is the list's only state (D45). Annotated because the router is
  // not type-registered, so useSearch returns any.
  const search: UserListSearch = useSearch({ from: "/shell/users" });
  // A path, not the route id useSearch takes: given the id, navigate warns.
  const navigate = useNavigate({ from: "/users" });
  const page = search.page ?? 1;
  const pageSize: PageSize = search.page_size ?? DEFAULT_PAGE_SIZE;
  const filters: UserFilters = {
    role: search.role,
    is_active: search.is_active,
    search: search.search,
    page,
    page_size: pageSize,
  };
  const [pendingDelete, setPendingDelete] = useState<UserDetail | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, error, isPlaceholderData } = useUsers(filters);
  const remove = useDeleteUser();

  /** Edits replace the history entry and keep the scroll position (D47). */
  function editSearch(update: SearchUpdate) {
    void navigate({ search: update, replace: true, resetScroll: false });
  }

  /** Any filter change resets to page 1, or a filter applied on page 3 looks empty. */
  function applyFilters(patch: UserFilterPatch) {
    editSearch((prev) => ({ ...prev, ...patch, page: undefined }));
  }

  // Typed text goes through a draft: the router's transition would revert a
  // controlled input bound straight to the URL (D50).
  const searchDraft = useSearchParamDraft(search.search ?? "", (value) =>
    applyFilters({ search: value === "" ? undefined : value }),
  );

  function setPageSize(next: PageSize) {
    editSearch((prev) => ({ ...prev, page_size: next, page: undefined }));
  }

  function goToPage(next: number) {
    void navigate({ search: (prev: UserListSearch) => ({ ...prev, page: next }) });
  }

  // A page past the end is a 404; page 1 never is, so this cannot loop (D54).
  const pageOutOfRange = error instanceof ApiError && error.status === 404 && page > 1;
  useEffect(() => {
    if (!pageOutOfRange) return;
    void navigate({
      search: (prev: UserListSearch) => ({ ...prev, page: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [pageOutOfRange, navigate]);

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
        <ButtonLink to="/users/new" className="ml-auto">
          New user
        </ButtonLink>
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
              value={searchDraft.draft}
              onChange={(event) => searchDraft.setDraft(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="role-filter" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              id="role-filter"
              value={search.role ?? ""}
              onChange={(event) =>
                applyFilters({ role: (event.target.value || undefined) as Role | undefined })
              }
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={search.is_active === false}
              onChange={(event) =>
                applyFilters({ is_active: event.target.checked ? false : undefined })
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

      {isError && !pageOutOfRange && (
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
        // The previous page stays while the next loads (D53).
        <div
          aria-busy={isPlaceholderData}
          className={clsx("transition-opacity", isPlaceholderData && "opacity-60")}
        >
          {/* The table collapses to stacked cards below md (spec §5.2). */}
          <div className="hidden overflow-x-auto md:block">
            <UserTable
              users={data.results}
              onDelete={beginDelete}
              currentUserId={currentUser?.id}
            />
          </div>
          <div className="md:hidden">
            {data.results.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onDelete={beginDelete}
                currentUserId={currentUser?.id}
              />
            ))}
          </div>

          <Pagination
            count={data.count}
            page={page}
            pageSize={pageSize}
            onPageChange={goToPage}
            onPageSizeChange={setPageSize}
          />
        </div>
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
