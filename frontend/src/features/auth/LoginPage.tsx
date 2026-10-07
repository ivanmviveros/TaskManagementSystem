import { useAppForm } from "../../components/form/app-form";
import {
  clearServerErrors,
  setServerErrors,
  type ServerErrors,
} from "../../components/form/server-errors";
import { useFocusFirstError } from "../../components/useFocusFirstError";
import { ApiError } from "../../lib/api-error";
import { useAuth } from "./hooks/useAuth";

const LOGIN_DEFAULTS = { email: "", password: "" };

/**
 * Sign-in's own error rules, unlike the shared mapper: the message always shows,
 * beside any field errors, and a 429 gets fixed copy.
 */
function loginErrors(error: unknown): ServerErrors {
  if (!(error instanceof ApiError)) {
    return { form: "Could not reach the server. Try again.", fields: {} };
  }
  // Branch on STATUS, not on the message: the backend's throttle copy is not a
  // contract, the 429 is.
  if (error.status === 429) {
    return { form: "Too many attempts. Wait a minute and try again.", fields: {} };
  }
  // Otherwise show what the server said rather than inventing copy (F3).
  const fields: Record<string, string> = {};
  for (const name of ["email", "password"]) {
    const message = error.fieldError(name);
    if (message !== undefined) fields[name] = message;
  }
  return { form: error.message, fields };
}

export function LoginPage() {
  const { signIn } = useAuth();
  const { ref: formRef, signalFailure } = useFocusFirstError<HTMLFormElement>();
  const form = useAppForm({
    defaultValues: LOGIN_DEFAULTS,
    onSubmit: async ({ value, formApi }) => {
      try {
        await signIn(value.email, value.password);
        // The router's beforeLoad sends the user to their role's landing page.
      } catch (caught) {
        setServerErrors(formApi, loginErrors(caught));
        signalFailure();
      }
    },
  });

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          // D80: a standing server error would make the form refuse this submit.
          clearServerErrors(form);
          void form.handleSubmit();
        }}
        noValidate
        aria-label="Sign in"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h1>

        <form.AppField name="email">
          {(field) => (
            <field.TextField
              id="email"
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          )}
        </form.AppField>

        <form.AppField name="password">
          {(field) => (
            <field.TextField
              id="password"
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </form.AppField>

        <form.AppForm>
          <form.ServerFormError />
          <form.SubmitButton label="Sign in" pendingLabel="Signing in…" className="w-full" />
        </form.AppForm>
      </form>
    </main>
  );
}
