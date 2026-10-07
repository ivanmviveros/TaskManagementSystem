import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "../../../components/Button";
import { FormError } from "../../../components/FormError";
import { TextField } from "../../../components/TextField";
import { useFocusFirstError } from "../../../components/useFocusFirstError";
import { ApiError } from "../../../lib/api-error";
import { useAuth } from "../../auth/hooks/useAuth";
import { ROLES, type Role } from "../../auth/types";
import type { UserDetail } from "../types";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};

export interface UserFormValues {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
}

interface UserFormProps {
  user?: UserDetail;
  onSubmit: (values: UserFormValues) => Promise<unknown>;
  onCancel: () => void;
}

export function UserForm({ user, onSubmit, onCancel }: UserFormProps) {
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const isEdit = user !== undefined;
  const { user: currentUser } = useAuth();
  // D66: an Admin's own role and active flag are not theirs to change. The
  // values are still submitted, unchanged, which the API accepts.
  const isSelf = user !== undefined && user.id === currentUser?.id;
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "OPERATOR");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ email, password, first_name: firstName, last_name: lastName, role, is_active: isActive });
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === "validation_error") {
          setFieldErrors(caught.errors);
        } else if (caught.code === "email_already_in_use") {
          // Against the field, not the form: it is the email that is wrong.
          setFieldErrors({ email: [caught.message] });
        } else {
          setFormError(caught.message);
        }
      } else {
        setFormError("Could not save. Try again.");
      }
      signalFailure();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate aria-label={isEdit ? "Edit user" : "New user"}>
      <TextField
        id="email"
        label="Email"
        type="email"
        required
        value={email}
        // The backend does not accept an email change on update, so the field
        // is read-only in edit mode rather than silently discarded.
        readOnly={isEdit}
        error={fieldErrors?.email?.[0]}
        onChange={(event) => setEmail(event.target.value)}
      />

      <TextField
        id="first_name"
        label="First name"
        required
        value={firstName}
        error={fieldErrors?.first_name?.[0]}
        onChange={(event) => setFirstName(event.target.value)}
      />

      <TextField
        id="last_name"
        label="Last name"
        required
        value={lastName}
        error={fieldErrors?.last_name?.[0]}
        onChange={(event) => setLastName(event.target.value)}
      />

      <TextField
        id="password"
        label={isEdit ? "New password (leave blank to keep the current one)" : "Password"}
        type="password"
        autoComplete="new-password"
        required={!isEdit}
        value={password}
        error={fieldErrors?.password?.[0]}
        onChange={(event) => setPassword(event.target.value)}
      />

      {isSelf ? (
        <div className="mb-4">
          {/* Plain text, not a <label>: there is no control to label. */}
          <p className="mb-1 text-sm font-medium text-slate-700">Role</p>
          <p className="text-sm text-slate-900">{ROLE_LABEL[role]}</p>
          <p className="mt-1 text-sm text-slate-500">
            You can&apos;t change your own role or deactivate your own account.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-slate-700">
            Role
          </label>
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>
                {ROLE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
      )}

      {isEdit && !isSelf && (
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active (can sign in)
        </label>
      )}

      <FormError message={formError} />

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create user"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
