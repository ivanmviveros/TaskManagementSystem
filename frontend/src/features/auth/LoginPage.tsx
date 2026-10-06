import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "../../components/Button";
import { FormError } from "../../components/FormError";
import { TextField } from "../../components/TextField";
import { ApiError } from "../../lib/api-error";
import { useAuth } from "./hooks/useAuth";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      // The router's beforeLoad sends the user to their role's landing page.
    } catch (caught) {
      if (caught instanceof ApiError) {
        // Branch on STATUS, not on the message: the backend's throttle copy is
        // not a contract, the 429 is.
        if (caught.status === 429) {
          setError("Too many attempts. Wait a minute and try again.");
        } else {
          // Otherwise show what the server said rather than inventing copy (F3).
          setError(caught.message);
          setFieldErrors(caught.errors);
        }
      } else {
        setError("Could not reach the server. Try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="Sign in"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h1>

        <TextField
          id="email"
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          error={fieldErrors?.email?.[0]}
          onChange={(event) => setEmail(event.target.value)}
        />

        <TextField
          id="password"
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          error={fieldErrors?.password?.[0]}
          onChange={(event) => setPassword(event.target.value)}
        />

        <FormError message={error} />

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
