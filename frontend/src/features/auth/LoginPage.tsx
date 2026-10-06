import { useState } from "react";

import { ApiError } from "../../lib/api-error";
import { useAuth } from "./hooks/useAuth";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      // The router's beforeLoad sends the user to their role's landing page.
    } catch (caught) {
      // Server-side validation surfaced to the user, never swallowed (F3).
      if (caught instanceof ApiError) {
        setError(
          caught.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Those credentials are not valid.",
        );
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
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-sm sm:p-8"
      >
        <h1 className="mb-6 text-xl font-semibold text-slate-900">Sign in</h1>

        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2"
        />

        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 w-full rounded border border-slate-300 px-3 py-2"
        />

        {error !== null && (
          <p role="alert" className="mb-4 text-sm text-status-overdue">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-status-progress px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
