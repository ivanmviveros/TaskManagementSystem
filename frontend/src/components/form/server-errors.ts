import type { AnyFormApi } from "@tanstack/react-form";

import { ApiError } from "../../lib/api-error";

/** What a failed submit shows: one form-level message and one message per field (D80). */
export interface ServerErrors {
  form?: string;
  fields: Record<string, string>;
}

export interface ServerErrorOptions {
  /** The fields this form renders an error for. No other key reaches `fields`. */
  renderedFields: readonly string[];
  /**
   * Error codes that belong to one field, decided by `code`, never by parsing `detail`.
   * Ignored for a field the form does not render: its message goes to the alert instead (D75).
   */
  codeToField?: Readonly<Record<string, string>>;
  /** The message for anything that is not an ApiError. */
  fallback: string;
}

/**
 * The one mapping from a failed save to what the form shows (D80). Only the
 * keys a form renders an error for reach `fields`: Form writes `fields[name]`
 * to EVERY registered field, so an error keyed on, say, `description` would
 * otherwise appear under a textarea that never showed one, and D75 would focus
 * it instead of the alert.
 */
export function toServerErrors(
  error: unknown,
  { renderedFields, codeToField = {}, fallback }: ServerErrorOptions,
): ServerErrors {
  if (!(error instanceof ApiError)) return { form: fallback, fields: {} };
  if (error.code === "validation_error") {
    const fields: Record<string, string> = {};
    for (const name of renderedFields) {
      const message = error.fieldError(name);
      if (message !== undefined) fields[name] = message;
    }
    // An error keyed on a field this form does not render would otherwise
    // vanish; the alert carries it, and D75 focuses the alert.
    return Object.keys(fields).length > 0 ? { fields } : { form: error.message, fields };
  }
  const field = codeToField[error.code];
  if (field !== undefined && renderedFields.includes(field)) {
    return { fields: { [field]: error.message } };
  }
  return { form: error.message, fields: {} };
}

/**
 * The only part of a form these helpers touch. A concrete `FormApi` is not
 * assignable to `AnyFormApi`: its `TSubmitMeta` is `never`, which surfaces through
 * the contravariant `listeners` callbacks ("any is not assignable to never").
 * The helpers only need `setErrorMap`, hence the `Pick`.
 */
export type ServerErrorTarget = Pick<AnyFormApi, "setErrorMap">;

/** Writes the errors into the form's `onServer` slot: the form and every registered field. */
export function setServerErrors(form: ServerErrorTarget, errors: ServerErrors): void {
  form.setErrorMap({ onServer: { form: errors.form, fields: errors.fields } });
}

/**
 * Empties the `onServer` slot, form and fields. Call it before every submit: while
 * an onServer error stands, form-core refuses to submit at all (D80). The
 * `fields` key is required — `{ onServer: undefined }` clears only the form-level
 * message and leaves every field error, still blocking the submit.
 */
export function clearServerErrors(form: ServerErrorTarget): void {
  form.setErrorMap({ onServer: { form: undefined, fields: {} } });
}

/** The message setServerErrors left in an `onServer` slot, if any. */
export function serverMessage(errorMap: { onServer?: unknown }): string | undefined {
  return typeof errorMap.onServer === "string" ? errorMap.onServer : undefined;
}
