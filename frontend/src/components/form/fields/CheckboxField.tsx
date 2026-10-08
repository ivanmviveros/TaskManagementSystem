import { useSelector } from "@tanstack/react-form";
import clsx from "clsx";

import { useFieldContext } from "../form-contexts";

/** A single checkbox bound to a boolean form field, its label wrapping it. */
export function CheckboxField({
  label,
  density = "default",
}: {
  label: string;
  density?: "default" | "compact";
}) {
  const field = useFieldContext<boolean>();
  const checked = useSelector(field.store, (state) => state.value);
  return (
    <label
      className={clsx(
        "flex items-center text-sm text-slate-700",
        density === "compact" ? "gap-1.5" : "mb-4 gap-2",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => field.handleChange(event.target.checked)}
        onBlur={field.handleBlur}
      />
      {label}
    </label>
  );
}
