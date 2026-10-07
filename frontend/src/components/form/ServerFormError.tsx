import { useSelector } from "@tanstack/react-store";

import { FormError } from "../FormError";
import { useFormContext } from "./form-contexts";
import { formMessageStore } from "./server-errors";

/** The form-level server message, in the role="alert" that D75 focuses (D80). */
export function ServerFormError() {
  const form = useFormContext();
  const message = useSelector(formMessageStore(form));
  return <FormError message={message ?? null} />;
}
