import { useSelector } from "@tanstack/react-form";

import { Button } from "../Button";
import { useFormContext } from "./form-contexts";

/** The submit button: disabled, showing its pending label, while the form submits. */
export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const form = useFormContext();
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  return (
    <Button type="submit" disabled={isSubmitting} className={className}>
      {isSubmitting ? pendingLabel : label}
    </Button>
  );
}
