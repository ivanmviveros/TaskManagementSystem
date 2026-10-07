import { useStore } from "@tanstack/react-form";

import { useFieldContext } from "../form-contexts";

/** A textarea bound to its form field. No form routes an error here (D80). */
export function TextareaField({ id, label, rows = 4 }: { id: string; label: string; rows?: number }) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        className="w-full rounded border border-slate-300 px-3 py-2"
      />
    </div>
  );
}
