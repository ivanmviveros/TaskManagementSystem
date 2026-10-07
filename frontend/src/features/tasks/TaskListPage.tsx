import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect } from "react";

import type { TaskListSearch } from "../../app/search-params";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { Pagination } from "../../components/Pagination";
import { ApiError } from "../../lib/api-error";
import { DEFAULT_PAGE_SIZE, type PageSize } from "../../lib/pagination";
import { useAuth } from "../auth/hooks/useAuth";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { TaskCard } from "./components/TaskCard";
import { TaskFilters, type FilterPatch } from "./components/TaskFilters";
import { TaskSortSelect } from "./components/TaskSortSelect";
import { TaskTable } from "./components/TaskTable";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTasks } from "./hooks/useTasks";
import type { Ordering } from "./sorting";
import { TaskActionsProvider } from "./task-actions-context";
import { initialTaskActionsState, taskActions } from "./task-actions-store";
import type { TaskFilters as Filters } from "./types";

type SearchUpdate = (prev: TaskListSearch) => TaskListSearch;

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
            {/* Cards below lg, not md (D69): at md the table's six columns and two
                action buttons do not fit, so badges and actions wrapped. */}
            <div className="hidden overflow-x-auto lg:block">
              <TaskTable
                tasks={data.results}
                showAssignee={showAssignee}
                ordering={filters.ordering}
                onOrderingChange={setOrdering}
                listSearch={search}
              />
            </div>
            <div className="lg:hidden">
              {data.results.map((task) => (
                <TaskCard key={task.id} task={task} showAssignee={showAssignee} listSearch={search} />
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
