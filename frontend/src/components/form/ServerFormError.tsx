import { useSelector } from "@tanstack/react-form";

import { FormError } from "../FormError";
import { useFormContext } from "./form-contexts";
import { serverMessage } from "./server-errors";

/** The form-level server message, in the role="alert" that D75 focuses (D80). */
export function ServerFormError() {
  const form = useFormContext();
  const message = useSelector(form.store, (state) => serverMessage(state.errorMap) ?? null);
  return <FormError message={message} />;
}
