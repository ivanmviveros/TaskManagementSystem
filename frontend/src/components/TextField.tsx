import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** A server-side field error, rendered beside the input (F3). */
  error?: string;
}

export function TextField({ id, label, error, className, ...input }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        className={clsx(
          "w-full rounded border px-3 py-2 text-slate-900",
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
