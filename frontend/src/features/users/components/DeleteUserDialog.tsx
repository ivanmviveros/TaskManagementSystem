import { Button } from "../../../components/Button";
import { FormError } from "../../../components/FormError";
import type { UserDetail } from "../types";

interface DeleteUserDialogProps {
  user: UserDetail;
  error: string | null;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * States plainly what deletion actually does (spec §16.1): the user is hidden
 * from the API and cannot log in, but the row and its audit trail remain, and
 * there is NO restore path through the API. Calling this "delete" without
 * saying so would mislead an Admin about a decision they cannot reverse.
 */
export function DeleteUserDialog({
  user,
  error,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteUserDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-user-title"
      className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 id="delete-user-title" className="mb-3 text-lg font-semibold text-slate-900">
          Deactivate {user.first_name} {user.last_name}?
        </h2>
        <p className="mb-2 text-sm text-slate-700">
          This deactivates the account rather than erasing it. {user.email} will no longer be
          able to sign in and will disappear from the API, but the record and its history are
          kept for the audit trail.
        </p>
        <p className="mb-4 text-sm font-medium text-slate-900">
          There is no way to restore the account through this application, though the email
          address becomes available for a new account.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
