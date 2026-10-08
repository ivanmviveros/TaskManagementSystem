import { useSelector } from "@tanstack/react-form";

import { useFieldContext } from "../form-contexts";
import type { SelectOption } from "./SelectField";

/** A fieldset of checkboxes bound to an array field: each one toggles its value. */
export function CheckboxGroupField<T extends string>({
  legend,
  options,
}: {
  legend: string;
  options: readonly SelectOption<T>[];
}) {
  const field = useFieldContext<T[]>();
  const selected = useSelector(field.store, (state) => state.value);

  function toggle(value: T) {
    field.handleChange((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  return (
    <fieldset className="mb-3">
      <legend className="mb-2 text-sm font-medium text-slate-700">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
