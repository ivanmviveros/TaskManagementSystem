import { useState } from "react";

import { Button } from "../../../components/Button";
import { useAppForm } from "../../../components/form/app-form";
import {
  clearServerErrors,
  setServerErrors,
  toServerErrors,
} from "../../../components/form/server-errors";
import { useFocusFirstError } from "../../../components/useFocusFirstError";
import { useAuth } from "../../auth/hooks/useAuth";
import { ROLE_LABEL, ROLES, type Role } from "../../auth/types";
import type { UserDetail } from "../types";

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

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }));

export function UserForm({ user, onSubmit, onCancel }: UserFormProps) {
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const isEdit = user !== undefined;
  const { user: currentUser } = useAuth();
  // D66: an Admin's own role and active flag are not theirs to change. The
  // values are still submitted, unchanged, which the API accepts.
  const isSelf = user !== undefined && user.id === currentUser?.id;
  // D81: taken once. UserEditPage passes the live query result, which refetches
  // on focus, and useForm re-applies changed defaults to an untouched form.
  const [defaults] = useState<UserFormValues>(() => ({
    email: user?.email ?? "",
    password: "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    role: user?.role ?? "OPERATOR",
    is_active: user?.is_active ?? true,
  }));

  const form = useAppForm({
    defaultValues: defaults,
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(value);
      } catch (caught) {
        setServerErrors(
          formApi,
          toServerErrors(caught, {
            renderedFields: ["email", "first_name", "last_name", "password"],
            // Against the field, not the form: it is the email that is wrong.
            codeToField: { email_already_in_use: "email" },
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
      aria-label={isEdit ? "Edit user" : "New user"}
    >
      <form.AppField name="email">
        {(field) => (
          <field.TextField
            id="email"
            label="Email"
            type="email"
            required
            // The backend does not accept an email change on update, so the field
            // is read-only in edit mode rather than silently discarded.
            readOnly={isEdit}
          />
        )}
      </form.AppField>

      <form.AppField name="first_name">
        {(field) => <field.TextField id="first_name" label="First name" required />}
      </form.AppField>

      <form.AppField name="last_name">
        {(field) => <field.TextField id="last_name" label="Last name" required />}
      </form.AppField>

      <form.AppField name="password">
        {(field) => (
          <field.TextField
            id="password"
            label={isEdit ? "New password (leave blank to keep the current one)" : "Password"}
            type="password"
            autoComplete="new-password"
            required={!isEdit}
          />
        )}
      </form.AppField>

      {isSelf ? (
        <div className="mb-4">
          {/* Plain text, not a <label>: there is no control to label. */}
          <p className="mb-1 text-sm font-medium text-slate-700">Role</p>
          <p className="text-sm text-slate-900">{ROLE_LABEL[defaults.role]}</p>
          <p className="mt-1 text-sm text-slate-500">
            You can&apos;t change your own role or deactivate your own account.
          </p>
        </div>
      ) : (
        <form.AppField name="role">
          {(field) => <field.SelectField id="role" label="Role" options={ROLE_OPTIONS} />}
        </form.AppField>
      )}

      {isEdit && !isSelf && (
        <form.AppField name="is_active">
          {(field) => <field.CheckboxField label="Active (can sign in)" />}
        </form.AppField>
      )}

      <form.AppForm>
        <form.ServerFormError />
        <div className="flex gap-2">
          <form.SubmitButton label={isEdit ? "Save changes" : "Create user"} pendingLabel="Saving…" />
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form.AppForm>
    </form>
  );
}
