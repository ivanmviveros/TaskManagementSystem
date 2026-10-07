import clsx from "clsx";
import { useId } from "react";

import { DEFAULT_ORDERING, SORT_OPTIONS, type Ordering } from "../sorting";

interface TaskSortSelectProps {
  ordering: Ordering | undefined;
  onChange: (ordering: Ordering | undefined) => void;
  className?: string;
}

/**
 * The sort control where the table — and so its sortable headers — is not
 * shown (F3, D69). Writes the same `ordering` search param as the headers.
 */
export function TaskSortSelect({ ordering, onChange, className }: TaskSortSelectProps) {
  const id = useId();
  return (
    <div className={clsx("mb-3 flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Sort by
      </label>
      <select
        id={id}
        value={ordering ?? DEFAULT_ORDERING}
        // The default is written as no parameter, so the URL stays canonical (D48).
        onChange={(event) => {
          // The options come from SORT_OPTIONS, so the value is always an Ordering.
          const value = event.target.value as Ordering;
          onChange(value === DEFAULT_ORDERING ? undefined : value);
        }}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
