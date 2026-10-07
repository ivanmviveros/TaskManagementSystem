import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/Button";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { ApiError } from "../../lib/api-error";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { OverdueBadge, StatusBadge } from "./components/StatusBadge";
import { TaskNotFound } from "./components/TaskNotFound";
import { useCompleteTask, useDeleteTask } from "./hooks/useTaskMutations";
import { useTask } from "./hooks/useTasks";
import { useTasksBackSearch } from "./hooks/useTasksBackSearch";

export function TaskDetailPage() {
  const { taskId } = useParams({ from: "/shell/tasks/$taskId" });
  const navigate = useNavigate();
  const back = useTasksBackSearch();
  const { data: task, isPending, isError, error } = useTask(taskId);
  const complete = useCompleteTask();
  const remove = useDeleteTask();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isPending) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Loading task…
      </p>
    );
  }

  if (isError || task === undefined) {
    if (error instanceof ApiError && error.status === 404) {
      return <TaskNotFound backSearch={back} />;
    }
    return (
      <section>
        <p role="alert" className="mb-4 text-sm text-status-overdue">
          {error instanceof ApiError ? error.message : "Could not load that task."}
        </p>
        <ButtonLink variant="secondary" to="/tasks" search={back}>
          Back to tasks
        </ButtonLink>
      </section>
    );
  }

  // Completion is offered only while the task is still open: COMPLETED and
  // CANCELLED are terminal (D19), and the API answers 409 for either.
  const isOpen = task.status === "PENDING" || task.status === "IN_PROGRESS";

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "Something went wrong. Try again.",
      );
    }
  }

  async function confirmDelete() {
    setDeleteError(null);
    try {
      // taskId, not task.id: a function DECLARATION is hoisted, so TypeScript
      // does not carry the early return's narrowing into it — `task` would still
      // be TaskDetail | undefined here (TS18048). The route param is a string.
      await remove.mutateAsync(taskId);
      await navigate({ to: "/tasks", search: back });
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError ? caught.message : "Could not delete that task.",
      );
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{task.title}</h1>
        <StatusBadge status={task.status} />
        {task.is_overdue && <OverdueBadge />}
      </div>

      <FormError message={actionError} />

      <dl className="mb-6 grid grid-cols-1 gap-2 rounded-lg bg-white p-4 text-sm shadow-sm sm:grid-cols-[10rem_1fr] sm:p-6">
        <dt className="font-medium text-slate-700">Description</dt>
        <dd className="text-slate-600">
          {task.description === "" ? "No description" : task.description}
        </dd>
        <dt className="font-medium text-slate-700">Due date</dt>
        <dd className="text-slate-600">
          {task.due_date === null ? "No deadline" : new Date(task.due_date).toLocaleString()}
        </dd>
        <dt className="font-medium text-slate-700">Assignee</dt>
        <dd className="text-slate-600">
          {task.assignee === null
            ? "Unassigned"
            : `${task.assignee.first_name} ${task.assignee.last_name}`}
        </dd>
        <dt className="font-medium text-slate-700">Created by</dt>
        <dd className="text-slate-600">
          {task.created_by.first_name} {task.created_by.last_name}
        </dd>
        {task.completed_at !== null && (
          <>
            <dt className="font-medium text-slate-700">Completed</dt>
            <dd className="text-slate-600">{new Date(task.completed_at).toLocaleString()}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {isOpen && (
          <Button onClick={() => void run(() => complete.mutateAsync(task.id))}>
            Mark complete
          </Button>
        )}
        <ButtonLink
          variant="secondary"
          to="/tasks/$taskId/edit"
          params={{ taskId: task.id }}
          state={{ tasksSearch: back }}
        >
          Edit
        </ButtonLink>
        {task.can_delete && (
          <Button
            variant="danger"
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
          >
            Delete
          </Button>
        )}
        <ButtonLink variant="secondary" to="/tasks" search={back}>
          Back to tasks
        </ButtonLink>
      </div>

      {confirmingDelete && (
        <DeleteTaskDialog
          task={task}
          error={deleteError}
          isDeleting={remove.isPending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </section>
  );
}
