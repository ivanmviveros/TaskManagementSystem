import { createFormHookContexts } from "@tanstack/react-form";

/**
 * The form and field contexts (D79). A module of its own, so the hook factory
 * (app-form.ts) and the components it registers do not import each other.
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();
