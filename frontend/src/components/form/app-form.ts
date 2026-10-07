import { createFormHook } from "@tanstack/react-form";

import { CheckboxField } from "./fields/CheckboxField";
import { CheckboxGroupField } from "./fields/CheckboxGroupField";
import { SelectField } from "./fields/SelectField";
import { TextareaField } from "./fields/TextareaField";
import { TextField } from "./fields/TextField";
import { fieldContext, formContext } from "./form-contexts";
import { ServerFormError } from "./ServerFormError";
import { SubmitButton } from "./SubmitButton";

/**
 * The app's one form hook (D79): every form and filter panel uses these field
 * components, so they share one look and one error display. Validation stays
 * on the server; there are no client validators.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, CheckboxField, CheckboxGroupField },
  formComponents: { SubmitButton, ServerFormError },
});
