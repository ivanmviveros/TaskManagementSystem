import { useState } from "react";

import { Button } from "../../../components/Button";
import { useAppForm } from "../../../components/form/app-form";
import {
  clearServerErrors,
  serverMessage,
  setServerErrors,
  toServerErrors,
} from "../../../components/form/server-errors";
import { useFocusFirstError } from "../../../components/useFocusFirstError";
import { useAuth } from "../../auth/hooks/useAuth";
import { taskSnapshot, toTaskInput, type TaskFormValues } from "../task-form-values";
import type { TaskDetail, TaskStatus } from "../types";
import { AssigneeCombobox } from "./AssigneeCombobox";
import { STATUS_LABEL, StatusBadge } from "./StatusBadge";

/**
 * Display order only — Pending, In progress, Completed, Cancelled — taken from
 * the label map's declaration order. Which statuses are OFFERED is the API's
 * call (allowed_transitions, D39), never this list's.
 */
const STATUS_ORDER = Object.keys(STATUS_LABEL) as TaskStatus[];

interface TaskFormProps {
  /** Present in edit mode, absent when creating. */
  task?: TaskDetail;
  onSubmit: (values: TaskFormValues) => Promise<unknown>;
  onCancel: () => void;
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const { user } = useAuth();
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const isEdit = task !== undefined;
  // D15/D16: an Operator cannot choose an assignee — on create it defaults to
  // self, on update it is immutable. Rendering the field would offer a choice
  // that cannot work, so it is omitted rather than disabled.
  const canChooseAssignee = user?.role === "SUPERVISOR";
  // D40/D81: taken once, when the form opens. useForm re-applies changed
  // defaults to an untouched form on every render, so the live task must never
  // reach it — see taskSnapshot.
  const [snapshot] = useState(() => taskSnapshot(task));
  const { initialStatus, initialTransitions } = snapshot;
  const statusOptions = STATUS_ORDER.filter(
    (option) => option === initialStatus || initialTransitions.includes(option),
  ).map((option) => ({ value: option, label: STATUS_LABEL[option] }));

  const form = useAppForm({
    defaultValues: snapshot.defaults,
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(toTaskInput(value, { canChooseAssignee, isEdit, initialStatus }));
      } catch (caught) {
        setServerErrors(
          formApi,
          toServerErrors(caught, {
            renderedFields: canChooseAssignee
              ? ["title", "due_date", "assignee"]
              : ["title", "due_date"],
            // Distinguished by `code` alone, never by parsing `detail` — which is
            // exactly why spec §8.7 keeps the two assignee codes separate.
            codeToField: { assignee_not_assignable: "assignee" },
            fallback: "Could not save. Try again.",
          }),
        );
        signalFailure();
      }
    },
  });

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        // D80: a standing field error would make the form refuse this submit.
        clearServerErrors(form);
        void form.handleSubmit();
      }}
      noValidate
      aria-label={isEdit ? "Edit task" : "New task"}
    >
      <form.AppField name="title">
        {(field) => <field.TextField id="title" label="Title" required maxLength={200} />}
      </form.AppField>

      <form.AppField name="description">
        {(field) => <field.TextareaField id="description" label="Description" />}
      </form.AppField>

      <form.AppField name="due_date">
        {(field) => <field.TextField id="due_date" label="Due date" type="date" />}
      </form.AppField>

      {canChooseAssignee && (
        <form.AppField name="assignee">
          {(field) => (
            <AssigneeCombobox
              id="assignee"
              label="Assignee"
              value={field.state.value}
              onChange={field.handleChange}
              error={serverMessage(field.state.meta.errorMap)}
            />
          )}
        </form.AppField>
      )}

      {/* Edit mode only: TaskCreateSerializer accepts no status field. */}
      {isEdit && initialTransitions.length > 0 && (
        <form.AppField name="status">
          {(field) => <field.SelectField id="status" label="Status" options={statusOptions} />}
        </form.AppField>
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

      <form.AppForm>
        <form.ServerFormError />
        <div className="flex gap-2">
          <form.SubmitButton label={isEdit ? "Save changes" : "Create task"} pendingLabel="Saving…" />
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form.AppForm>
    </form>
  );
}
