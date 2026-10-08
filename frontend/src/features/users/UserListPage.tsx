import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useMemo } from "react";

import type { UserListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { useAppTable } from "../../components/table/app-table";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, routePaginationChange, type PageSize } from "../../lib/pagination";
import { DeleteUserDialog } from "./components/DeleteUserDialog";
import { UserCard } from "./components/UserCard";
import { UserFilters, type UserFilterPatch } from "./components/UserFilters";
import { useDeleteUser, useUsers } from "./hooks/useUsers";
import type { UserDetail, UserFilters as Filters } from "./types";
import { UserListProvider } from "./user-list-context";
import { userColumns } from "./user-columns";
import { initialUserListState, userListActions } from "./user-list-store";

type SearchUpdate = (prev: UserListSearch) => UserListSearch;

const NO_USERS: UserDetail[] = [];

export function UserListPage() {
  // The URL is the list's only state (D45). Annotated because the router is
  // not type-registered, so useSearch returns any.
  const search: UserListSearch = useSearch({ from: "/shell/users" });
  // A path, not the route id useSearch takes: given the id, navigate warns.
  const navigate = useNavigate({ from: "/users" });
  const page = search.page ?? 1;
  const pageSize: PageSize = search.page_size ?? DEFAULT_PAGE_SIZE;
  const filters: Filters = {
    role: search.role,
    is_active: search.is_active,
    search: search.search,
    page,
    page_size: pageSize,
  };
  // The page's UI state (D87): one store per mount, so it starts clean on every visit.
  const store = useCreateStore(initialUserListState, userListActions);
  const pendingDelete = useSelector(store, (state) => state.delete.pending);
  const deleteError = useSelector(store, (state) => state.delete.error);

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

  function setPageSize(next: PageSize) {
    editSearch((prev) => ({ ...prev, page_size: next, page: undefined }));
  }

  function goToPage(next: number) {
    void navigate({ search: (prev: UserListSearch) => ({ ...prev, page: next }) });
  }

  // The table owns no state: the URL's page and size go in, changes go back out
  // as navigations (D83, D85). The table compares controlled state shallowly, so
  // a flat { pageIndex, pageSize } needs no memo to avoid a render loop; it is
  // memoised only for uniformity with the task list.
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize }), [page, pageSize]);
  const table = useAppTable({
    columns: userColumns,
    data: data?.results ?? NO_USERS,
    rowCount: data?.count ?? 0,
    enableSorting: false,
    state: { pagination },
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, { goToPage, setPageSize }),
  });

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

  async function confirmDelete() {
    const target = store.state.delete.pending;
    if (target === null) return;
    store.actions.clearDeleteError();
    try {
      await remove.mutateAsync(target.id);
      store.actions.cancelDelete();
    } catch (caught) {
      store.actions.failDelete(
        caught instanceof ApiError ? caught.message : "Could not deactivate that user.",
      );
    }
  }

  return (
    <UserListProvider value={{ store }}>
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <ButtonLink to="/users/new" className="ml-auto">
            New user
          </ButtonLink>
        </div>

        <UserFilters filters={search} onChange={applyFilters} />

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
            <table.AppTable>
              {/* The table collapses to stacked cards below md (spec §5.2). */}
              <div className="hidden overflow-x-auto md:block">
                <table.TableView />
              </div>
              <div className="md:hidden">
                {table.getRowModel().rows.map((row) => (
                  <UserCard key={row.id} user={row.original} />
                ))}
              </div>
              <table.Pagination />
            </table.AppTable>
          </div>
        )}

        {pendingDelete !== null && (
          <DeleteUserDialog
            user={pendingDelete}
            error={deleteError}
            isDeleting={remove.isPending}
            onConfirm={() => void confirmDelete()}
            onCancel={store.actions.cancelDelete}
          />
        )}
      </section>
    </UserListProvider>
  );
}
