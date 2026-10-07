import { useEffect } from "react";

import { Button } from "../../../components/Button";
import { FormError } from "../../../components/FormError";
import { useModalDialog } from "../../../components/useModalDialog";

interface DeleteTaskDialogProps {
  task: { title: string };
  error: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirms a task deletion and says plainly what it does (D38): the task is
 * soft-deleted, so its record and history remain for the audit trail, but no
 * endpoint restores it — calling this "delete" without saying so would mislead
 * someone about a decision they cannot reverse. Mirrors DeleteUserDialog.
 */
export function DeleteTaskDialog({
  task,
  error,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteTaskDialogProps) {
  const dialogRef = useModalDialog<HTMLDivElement>(onCancel, !isDeleting);

  // D75: the buttons are disabled while the request runs, which drops focus to
  // <body> (outside the aria-modal dialog) in real browsers. On a failure, focus
  // the error, so the trap holds and the message is reached first. Every caller
  // resets `error` to null before each attempt, so a repeat failure with the
  // same message still re-runs this effect.
  useEffect(() => {
    if (error !== null) {
      dialogRef.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
    }
  }, [error, dialogRef]);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-title"
      className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 id="delete-task-title" className="mb-3 text-lg font-semibold text-slate-900">
          Delete &ldquo;{task.title}&rdquo;?
        </h2>
        <p className="mb-2 text-sm text-slate-700">
          The task disappears from every list and from the dashboard. Its record and history are
          kept for the audit trail.
        </p>
        <p className="mb-4 text-sm font-medium text-slate-900">
          There is no way to restore it from this application.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isDeleting} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
