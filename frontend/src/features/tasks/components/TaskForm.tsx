import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "../../../components/Button";
import { FormError } from "../../../components/FormError";
import { TextField } from "../../../components/TextField";
import { ApiError } from "../../../lib/api-error";
import { useAuth } from "../../auth/hooks/useAuth";
import { useAssignableUsers } from "../../users/hooks/useAssignableUsers";
import type { TaskDetail, TaskStatus } from "../types";
import { STATUS_LABEL, StatusBadge } from "./StatusBadge";

/**
 * Display order only — Pending, In progress, Completed, Cancelled — taken from
 * the label map's declaration order. Which statuses are OFFERED is the API's
 * call (allowed_transitions, D39), never this list's.
 */
const STATUS_ORDER = Object.keys(STATUS_LABEL) as TaskStatus[];

export interface TaskFormValues {
  title: string;
  description: string;
  due_date: string | null;
  assignee: string | null;
  status?: TaskStatus;
}

interface TaskFormProps {
  /** Present in edit mode, absent when creating. */
  task?: TaskDetail;
  onSubmit: (values: TaskFormValues) => Promise<unknown>;
  onCancel: () => void;
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const { user } = useAuth();
  const isEdit = task !== undefined;
  // D15/D16: an Operator cannot choose an assignee — on create it defaults to
  // self, on update it is immutable. Rendering the field would offer a choice
  // that cannot work, so it is omitted rather than disabled.
  const canChooseAssignee = user?.role === "SUPERVISOR";
  const assignable = useAssignableUsers(canChooseAssignee);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date?.slice(0, 10) ?? "");
  const [assignee, setAssignee] = useState(task?.assignee?.id ?? "");
  // D40: ONE snapshot, taken when the form opens, drives the status field: the
  // options, the read-only switch and the "did the user change it?" check. The
  // detail query refetches (30 s staleTime, refetch on focus), and none of those
  // three may follow it — options from the select's own state would drop the
  // original status after a change; read-only from the live task could strand
  // a changed value after a refetch; comparing with the live status would
  // silently undo a change someone else made meanwhile.
  const [initialStatus] = useState(task?.status);
  const [initialTransitions] = useState<TaskStatus[]>(task?.allowed_transitions ?? []);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "PENDING");
  // Kept after `status` on purpose: the filter runs during render, so if it is
  // ever changed to read `status`, a declaration above it would throw a
  // temporal-dead-zone ReferenceError instead of failing the test that guards it.
  const statusOptions = STATUS_ORDER.filter(
    (option) => option === initialStatus || initialTransitions.includes(option),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        title,
        description,
        due_date: dueDate === "" ? null : new Date(`${dueDate}T12:00:00Z`).toISOString(),
        assignee: canChooseAssignee ? (assignee === "" ? null : assignee) : null,
        // Sent only when the user changed it (D40). TaskEditPage omits an
        // undefined status from the PATCH.
        ...(isEdit && status !== initialStatus ? { status } : {}),
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        // Distinguished by `code` alone, never by parsing `detail` — which is
        // exactly why spec §8.7 keeps the two assignee codes separate.
        if (caught.code === "validation_error") {
          setFieldErrors(caught.errors);
          setFormError(null);
        } else if (caught.code === "assignee_not_assignable") {
          setFieldErrors({ assignee: [caught.message] });
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("Could not save. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={isEdit ? "Edit task" : "New task"}>
      <TextField
        id="title"
        label="Title"
        required
        maxLength={200}
        value={title}
        error={fieldErrors?.title?.[0]}
        onChange={(event) => setTitle(event.target.value)}
      />

      <div className="mb-4">
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>

      <TextField
        id="due_date"
        label="Due date"
        type="date"
        value={dueDate}
        error={fieldErrors?.due_date?.[0]}
        onChange={(event) => setDueDate(event.target.value)}
      />

      {canChooseAssignee && (
        <div className="mb-4">
          <label htmlFor="assignee" className="mb-1 block text-sm font-medium text-slate-700">
            Assignee
          </label>
          <select
            id="assignee"
            value={assignee}
            aria-invalid={fieldErrors?.assignee === undefined ? undefined : true}
            aria-describedby={fieldErrors?.assignee === undefined ? undefined : "assignee-error"}
            onChange={(event) => setAssignee(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Unassigned</option>
            {(assignable.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.first_name} {option.last_name} ({option.email})
              </option>
            ))}
          </select>
          {fieldErrors?.assignee !== undefined && (
            <p id="assignee-error" className="mt-1 text-sm text-status-overdue">
              {fieldErrors.assignee[0]}
            </p>
          )}
        </div>
      )}

      {/* Edit mode only: TaskCreateSerializer accepts no status field. */}
      {isEdit && initialTransitions.length > 0 && (
        <div className="mb-4">
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* A terminal task has nothing to choose, so nothing to get wrong. Plain
          text, not a <label>: there is no control for it to label. */}
      {isEdit && initialTransitions.length === 0 && initialStatus !== undefined && (
        <div className="mb-4">
          <p className="mb-1 text-sm font-medium text-slate-700">Status</p>
          <StatusBadge status={initialStatus} />
          <p className="mt-1 text-sm text-slate-500">
            Completed and cancelled tasks keep their status.
          </p>
        </div>
      )}

      <FormError message={formError} />

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create task"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
