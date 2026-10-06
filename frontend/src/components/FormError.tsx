/** A non-field error from the server. role="alert" so it is announced (F3). */
export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" className="mb-4 text-sm text-status-overdue">
      {message}
    </p>
  );
}
