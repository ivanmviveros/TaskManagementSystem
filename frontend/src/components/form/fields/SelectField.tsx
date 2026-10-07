import { useStore } from "@tanstack/react-form";
import clsx from "clsx";

import { useFieldContext } from "../form-contexts";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  id: string;
  label: string;
  options: readonly SelectOption<T>[];
  density?: "default" | "compact";
}

/** A select bound to its form field. The options fix which values it can hold. */
export function SelectField<T extends string>({
  id,
  label,
  options,
  density = "default",
}: SelectFieldProps<T>) {
  const field = useFieldContext<T>();
  const value = useStore(field.store, (state) => state.value);
  const compact = density === "compact";
  return (
    <div className={compact ? undefined : "mb-4"}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        // The options come from `options`, so the value is always a T.
        onChange={(event) => field.handleChange(event.target.value as T)}
        onBlur={field.handleBlur}
        className={clsx("rounded border border-slate-300 px-3 py-2", compact ? "text-sm" : "w-full")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
