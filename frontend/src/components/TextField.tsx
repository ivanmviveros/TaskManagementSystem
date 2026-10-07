import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** A server-side field error, rendered beside the input (F3). */
  error?: string;
  /** "compact" is the filter bar's look: smaller text, auto width, no bottom margin. */
  density?: "default" | "compact";
}

export function TextField({
  id,
  label,
  error,
  density = "default",
  className,
  ...input
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const compact = density === "compact";
  return (
    <div className={compact ? undefined : "mb-4"}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={clsx(
          "rounded border px-3 py-2",
          compact ? "text-sm" : "w-full text-slate-900",
          error === undefined ? "border-slate-300" : "border-status-overdue",
          className,
        )}
        {...input}
      />
      {error !== undefined && (
        <p id={errorId} className="mt-1 text-sm text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
