export type FieldErrors = Record<string, string[]> | null;

/** The normalized shape of every backend error (spec §8.7). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: FieldErrors;

  constructor(status: number, detail: string, code: string, errors: FieldErrors = null) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  /** First message for a field, for rendering beside the input. */
  fieldError(field: string): string | undefined {
    return this.errors?.[field]?.[0];
  }
}
