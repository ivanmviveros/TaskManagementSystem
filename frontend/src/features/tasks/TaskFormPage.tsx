import { useNavigate, useParams } from "@tanstack/react-router";

import { TaskForm, type TaskFormValues } from "./components/TaskForm";
import { useCreateTask, useUpdateTask } from "./hooks/useTaskMutations";
import { useTask } from "./hooks/useTasks";

/**
 * Creation is a ROUTE, not a modal: it is deep-linkable, guarded by exactly the
 * same mechanism as every other route, and keeps create and edit as one
 * component with two modes rather than two divergent surfaces.
 */
export function TaskCreatePage() {
  const navigate = useNavigate();
  const create = useCreateTask();

  async function handleSubmit(values: TaskFormValues) {
    const task = await create.mutateAsync({
      title: values.title,
      description: values.description,
      due_date: values.due_date,
      // Omitted for an Operator, whose task the server assigns to them (D16);
      // an explicit null would be refused as choosing a different assignee.
      ...(values.assignee === undefined ? {} : { assignee: values.assignee }),
    });
    await navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">New task</h1>
      <div className="max-w-xl rounded-lg bg-white p-4 shadow-sm sm:p-6">
        <TaskForm onSubmit={handleSubmit} onCancel={() => void navigate({ to: "/tasks" })} />
      </div>
    </section>
  );
}

export function TaskEditPage() {
  const { taskId } = useParams({ from: "/shell/tasks/$taskId/edit" });
  const navigate = useNavigate();
  const { data: task, isPending, isError } = useTask(taskId);
  const update = useUpdateTask(taskId);

  if (isPending) return <p role="status">Loading task…</p>;
  if (isError || task === undefined)
    return (
      <p role="alert" className="text-status-overdue">
        Could not load that task.
      </p>
    );

  async function handleSubmit(values: TaskFormValues) {
    await update.mutateAsync({
      title: values.title,
      description: values.description,
      due_date: values.due_date,
      ...(values.status === undefined ? {} : { status: values.status }),
      // Omitted when the actor may not choose it (an Operator, D15); null is
      // sent as-is, because null is how a PATCH unassigns (D32).
      ...(values.assignee === undefined ? {} : { assignee: values.assignee }),
    });
    await navigate({ to: "/tasks/$taskId", params: { taskId } });
  }

  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Edit task</h1>
      <div className="max-w-xl rounded-lg bg-white p-4 shadow-sm sm:p-6">
        <TaskForm
          task={task}
          onSubmit={handleSubmit}
          onCancel={() => void navigate({ to: "/tasks/$taskId", params: { taskId } })}
        />
      </div>
    </section>
  );
}
