/**
 * A non-field error from the server. role="alert" so it is announced (F3).
 * tabIndex -1 so useFocusFirstError can focus it without adding a Tab stop (D75).
 */
export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" tabIndex={-1} className="mb-4 text-sm text-status-overdue">
      {message}
    </p>
  );
}
