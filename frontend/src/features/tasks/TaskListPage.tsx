import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { functionalUpdate } from "@tanstack/react-table";
import clsx from "clsx";
import { useEffect, useMemo } from "react";

import type { TaskListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { useAppTable } from "../../components/table/app-table";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, routePaginationChange, type PageSize } from "../../lib/pagination";
import { useAuth } from "../auth/hooks/useAuth";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { TaskCard } from "./components/TaskCard";
import { TaskFilters, type FilterPatch } from "./components/TaskFilters";
import { TaskSortSelect } from "./components/TaskSortSelect";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTasks } from "./hooks/useTasks";
import { orderingToSorting, sortingToOrdering, type Ordering } from "./sorting";
import { TaskActionsProvider } from "./task-actions-context";
import { initialTaskActionsState, taskActions } from "./task-actions-store";
import { taskColumns } from "./task-columns";
import type { TaskFilters as Filters, TaskListItem } from "./types";

type SearchUpdate = (prev: TaskListSearch) => TaskListSearch;

const NO_TASKS: TaskListItem[] = [];

export function TaskListPage() {
  const { user } = useAuth();
  // The URL is the list's only state (D45): a dashboard card, a refresh, Back
  // and a shared link all arrive here the same way. Annotated because the
  // router is not type-registered, so useSearch returns any.
  const search: TaskListSearch = useSearch({ from: "/shell/tasks" });
  // A path, not the route id useSearch takes: given the id, navigate warns.
  const navigate = useNavigate({ from: "/tasks" });
  const page = search.page ?? 1;
  const pageSize: PageSize = search.page_size ?? DEFAULT_PAGE_SIZE;
  const filters: Filters = {
    status: search.status,
    due_date_after: search.due_date_after,
    due_date_before: search.due_date_before,
    overdue: search.overdue,
    ordering: search.ordering,
    page,
    page_size: pageSize,
  };
  // The page's UI state (D87): one store per mount, so it starts clean on every visit.
  const store = useCreateStore(initialTaskActionsState, taskActions);
  const actions = useTaskActions(store);
  const actionError = useSelector(store, (state) => state.actionError);
  const pendingDelete = useSelector(store, (state) => state.delete.pending);
  const deleteError = useSelector(store, (state) => state.delete.error);

  const { data, isPending, isError, error, isPlaceholderData } = useTasks(filters);

  // An Operator's list is already scoped to themselves, so the column is noise.
  const showAssignee = user?.role === "SUPERVISOR";

  /**
   * Edits replace the history entry and keep the scroll position; only a page
   * move is navigation (D47). The updater form reads the latest URL, so a
   * draft committing late cannot undo a newer change (D46).
   */
  function editSearch(update: SearchUpdate) {
    void navigate({ search: update, replace: true, resetScroll: false });
  }

  /** Any filter change resets to page 1 — otherwise a filter applied on page 3
   *  shows an empty page and looks like "no results". */
  function applyFilters(patch: FilterPatch) {
    editSearch((prev) => ({ ...prev, ...patch, page: undefined }));
  }

  function clearFilters() {
    // Filters and ordering go, as before; the page size is a preference, not a filter.
    editSearch((prev) => ({ page_size: prev.page_size }));
  }

  function setPageSize(next: PageSize) {
    editSearch((prev) => ({ ...prev, page_size: next, page: undefined }));
  }

  /** A sort change is an edit, like a filter: replace, keep scroll, page 1 (D47). */
  function setOrdering(ordering: Ordering | undefined) {
    editSearch((prev) => ({ ...prev, ordering, page: undefined }));
  }

  function goToPage(next: number) {
    void navigate({ search: (prev: TaskListSearch) => ({ ...prev, page: next }) });
  }

  // Memoised because orderingToSorting returns a new array on every call and the
  // table compares controlled state shallowly: unmemoised, it would be seen as a
  // change and re-published on every render. The pagination and column-visibility
  // objects are flat, so their memos are only for uniformity.
  const sorting = useMemo(() => orderingToSorting(search.ordering), [search.ordering]);
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize }), [page, pageSize]);
  const columnVisibility = useMemo(() => ({ assignee: showAssignee }), [showAssignee]);
  // The table owns no state: the URL's sort, page and size go in, and every
  // change goes back out as a navigation (D83–D85).
  const table = useAppTable({
    columns: taskColumns,
    data: data?.results ?? NO_TASKS,
    rowCount: data?.count ?? 0,
    state: { sorting, pagination, columnVisibility },
    onSortingChange: (updater) => setOrdering(sortingToOrdering(functionalUpdate(updater, sorting))),
    onPaginationChange: (updater) =>
      routePaginationChange(updater, pagination, { goToPage, setPageSize }),
  });

  // A page past the end is a 404 — a stale link, or the last row of the last
  // page deleted. Page 1 never 404s, so this cannot loop (D54).
  const pageOutOfRange = error instanceof ApiError && error.status === 404 && page > 1;
  useEffect(() => {
    if (!pageOutOfRange) return;
    void navigate({
      search: (prev: TaskListSearch) => ({ ...prev, page: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [pageOutOfRange, navigate]);

  return (
    <TaskActionsProvider value={{ store, actions }}>
      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
          <ButtonLink to="/tasks/new" state={{ tasksSearch: search }} className="ml-auto">
            New task
          </ButtonLink>
        </div>

        <TaskFilters filters={filters} onChange={applyFilters} onClear={clearFilters} />
        <FormError message={actionError} />
        {/* Outside the results, so it survives an empty result (spec §4.3). */}
        <TaskSortSelect ordering={filters.ordering} onChange={setOrdering} className="lg:hidden" />

        {isPending && (
          <p role="status" className="text-sm text-slate-500">
            Loading tasks…
          </p>
        )}

        {isError && !pageOutOfRange && (
          <p role="alert" className="text-sm text-status-overdue">
            {error instanceof ApiError ? error.message : "Could not load tasks."}
          </p>
        )}

        {data !== undefined && data.results.length === 0 && (
          <p className="rounded-lg bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            No tasks match these filters.
          </p>
        )}

        {data !== undefined && data.results.length > 0 && (
          // The previous page stays while the next loads (D53).
          <div
            aria-busy={isPlaceholderData}
            className={clsx("transition-opacity", isPlaceholderData && "opacity-60")}
          >
            <table.AppTable>
              {/* Cards below lg, not md (D69): at md the table's six columns and two
                  action buttons do not fit, so badges and actions wrapped. */}
              <div className="hidden overflow-x-auto lg:block">
                <table.TableView />
              </div>
              <div className="lg:hidden">
                {table.getRowModel().rows.map((row) => (
                  <TaskCard key={row.id} task={row.original} showAssignee={showAssignee} />
                ))}
              </div>
              <table.Pagination />
            </table.AppTable>
          </div>
        )}

        {pendingDelete !== null && (
          <DeleteTaskDialog
            task={pendingDelete}
            error={deleteError}
            isDeleting={actions.isDeleting}
            onConfirm={() => void actions.confirmDelete()}
            onCancel={actions.cancelDelete}
          />
        )}
      </section>
    </TaskActionsProvider>
  );
}
