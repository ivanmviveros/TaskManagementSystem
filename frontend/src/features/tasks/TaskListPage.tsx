import { useNavigate, useSearch } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useState } from "react";

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
import { TaskTable } from "./components/TaskTable";
import { useCompleteTask, useDeleteTask } from "./hooks/useTaskMutations";
import { useTasks } from "./hooks/useTasks";
import type { TaskFilters as Filters, TaskListItem } from "./types";

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
    status: search.status as Filters["status"],
    due_date_after: search.due_date_after,
    due_date_before: search.due_date_before,
    overdue: search.overdue,
    ordering: search.ordering,
    page,
    page_size: pageSize,
  };
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, error, isPlaceholderData } = useTasks(filters);
  const complete = useCompleteTask();
  const remove = useDeleteTask();

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

  async function runAction(id: string, action: (id: string) => Promise<unknown>) {
    setActionError(null);
    setBusyId(id);
    try {
      await action(id);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  /** Looked up at click time and stored as the object, so a refetch while the
   *  dialog is open cannot make it disappear. */
  function beginDelete(id: string) {
    const target = data?.results.find((candidate) => candidate.id === id);
    if (target === undefined) return;
    setDeleteError(null);
    setPendingDelete(target);
  }

  async function confirmDelete() {
    if (pendingDelete === null) return;
    setDeleteError(null);
    try {
      await remove.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "Could not delete that task.",
      );
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Tasks</h1>
        <ButtonLink to="/tasks/new" className="ml-auto">
          New task
        </ButtonLink>
      </div>

      <TaskFilters filters={filters} onChange={applyFilters} onClear={clearFilters} />
      <FormError message={actionError} />

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
          {/* The table collapses to stacked cards below md (spec §11.6). */}
          <div className="hidden overflow-x-auto md:block">
            <TaskTable
              tasks={data.results}
              showAssignee={showAssignee}
              ordering={filters.ordering}
              onOrderingChange={(ordering) =>
                editSearch((prev) => ({ ...prev, ordering, page: undefined }))
              }
              onComplete={(id) => void runAction(id, complete.mutateAsync)}
              onDelete={beginDelete}
              busyId={busyId}
            />
          </div>
          <div className="md:hidden">
            {data.results.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                showAssignee={showAssignee}
                onComplete={(id) => void runAction(id, complete.mutateAsync)}
                onDelete={beginDelete}
                isBusy={busyId === task.id}
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
        <DeleteTaskDialog
          task={pendingDelete}
          error={deleteError}
          isDeleting={remove.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
