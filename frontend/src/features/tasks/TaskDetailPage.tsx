import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useNavigate, useParams } from "@tanstack/react-router";

import { Button } from "../../components/Button";
import { ButtonLink } from "../../components/ButtonLink";
import { FormError } from "../../components/FormError";
import { ApiError } from "../../lib/api-error";
import { formatDueDate } from "../../lib/dates";
import { DeleteTaskDialog } from "./components/DeleteTaskDialog";
import { OverdueBadge, StatusBadge } from "./components/StatusBadge";
import { TaskNotFound } from "./components/TaskNotFound";
import { useTaskActions } from "./hooks/useTaskActions";
import { useTask } from "./hooks/useTasks";
import { useTasksBackSearch } from "./hooks/useTasksBackSearch";
import { initialTaskActionsState, taskActions } from "./task-actions-store";

export function TaskDetailPage() {
  const { taskId } = useParams({ from: "/shell/tasks/$taskId" });
  const navigate = useNavigate();
  const back = useTasksBackSearch();
  const { data: task, isPending, isError, error } = useTask(taskId);
  // The page's UI state (D87). After a delete the page returns to the list it
  // came from (D70), with the dialog still open until it leaves.
  const store = useCreateStore(initialTaskActionsState, taskActions);
  const actions = useTaskActions(store, {
    onDeleted: () => navigate({ to: "/tasks", search: back }),
  });
  const actionError = useSelector(store, (state) => state.actionError);
  const confirmingDelete = useSelector(store, (state) => state.delete.pending !== null);
  const deleteError = useSelector(store, (state) => state.delete.error);

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
          {task.due_date === null ? "No deadline" : formatDueDate(task.due_date)}
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
        {isOpen && <Button onClick={() => void actions.complete(task)}>Mark complete</Button>}
        <ButtonLink
          variant="secondary"
          to="/tasks/$taskId/edit"
          params={{ taskId: task.id }}
          state={{ tasksSearch: back }}
        >
          Edit
        </ButtonLink>
        {task.can_delete && (
          <Button variant="danger" onClick={() => actions.beginDelete(task)}>
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
          isDeleting={actions.isDeleting}
          onConfirm={() => void actions.confirmDelete()}
          onCancel={actions.cancelDelete}
        />
      )}
    </section>
  );
}
