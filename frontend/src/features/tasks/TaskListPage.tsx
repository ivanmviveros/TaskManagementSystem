import { Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/Button";
import { FormError } from "../../components/FormError";
import { ApiError } from "../../lib/api-error";
import { useAuth } from "../auth/hooks/useAuth";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { Pagination } from "./components/Pagination";
import { TaskCard } from "./components/TaskCard";
import { TaskFilters } from "./components/TaskFilters";
import { TaskTable } from "./components/TaskTable";
import { useCompleteTask, useDeleteTask } from "./hooks/useTaskMutations";
import { useTasks } from "./hooks/useTasks";
import type { TaskFilters as Filters, TaskListItem } from "./types";

const PAGE_SIZE = 20;

export function TaskListPage() {
  const { user } = useAuth();
  // Seeded from the URL so the dashboard's drill-through links land on the
  // filtered list they promise, and so a filtered view is shareable. Thereafter
  // it is local UI state — never the Query cache and never Context.
  const search = useSearch({ from: "/shell/tasks" });
  const [filters, setFilters] = useState<Filters>({
    status: search.status as Filters["status"],
    due_date_after: search.due_date_after,
    due_date_before: search.due_date_before,
    overdue: search.overdue,
    ordering: search.ordering,
    page: search.page ?? 1,
    page_size: PAGE_SIZE,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isPending, isError, error } = useTasks(filters);
  const complete = useCompleteTask();
  const remove = useDeleteTask();

  // An Operator's list is already scoped to themselves, so the column is noise.
  const showAssignee = user?.role === "SUPERVISOR";

  /** Any filter change resets to page 1 — otherwise a filter applied on page 3
   *  shows an empty page and looks like "no results". */
  function applyFilters(next: Filters) {
    setFilters({ ...next, page: 1, page_size: PAGE_SIZE });
  }

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
        <Link to="/tasks/new" className="ml-auto">
          <Button>New task</Button>
        </Link>
      </div>

      <TaskFilters filters={filters} onChange={applyFilters} />
      <FormError message={actionError} />

      {isPending && (
        <p role="status" className="text-sm text-slate-500">
          Loading tasks…
        </p>
      )}

      {isError && (
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
        <>
          {/* The table collapses to stacked cards below md (spec §11.6). */}
          <div className="hidden overflow-x-auto md:block">
            <TaskTable
              tasks={data.results}
              showAssignee={showAssignee}
              ordering={filters.ordering}
              onOrderingChange={(ordering) => setFilters({ ...filters, ordering, page: 1 })}
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
            page={filters.page ?? 1}
            pageSize={PAGE_SIZE}
            hasNext={data.next !== null}
            hasPrevious={data.previous !== null}
            onPageChange={(page) => setFilters({ ...filters, page })}
          />
        </>
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
