import { FieldApi, FormApi } from "@tanstack/react-form";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../lib/api-error";
import { clearServerErrors, serverMessage, setServerErrors, toServerErrors } from "./server-errors";

const OPTIONS = {
  renderedFields: ["title", "due_date"],
  codeToField: { assignee_not_assignable: "assignee" },
  fallback: "Could not save. Try again.",
} as const;

const invalid = (errors: Record<string, string[]>) =>
  new ApiError(400, "Invalid input.", "validation_error", errors);

describe("toServerErrors", () => {
  it("puts each rendered field's first message on that field, with no form message", () => {
    expect(toServerErrors(invalid({ title: ["Blank.", "Second."] }), OPTIONS)).toEqual({
      fields: { title: "Blank." },
    });
  });

  it("sends an error on a field the form does not render to the alert instead (D75)", () => {
    expect(toServerErrors(invalid({ description: ["Too long."] }), OPTIONS)).toEqual({
      form: "Invalid input.",
      fields: {},
    });
  });

  it("never puts a key outside renderedFields into fields (D80)", () => {
    expect(
      toServerErrors(invalid({ title: ["Blank."], description: ["Too long."] }), OPTIONS),
    ).toEqual({ fields: { title: "Blank." } });
  });

  it("routes a field-specific code to its field, by code alone", () => {
    const error = new ApiError(400, "Not assignable.", "assignee_not_assignable");
    expect(toServerErrors(error, OPTIONS)).toEqual({ fields: { assignee: "Not assignable." } });
  });

  it("shows any other API error's message as the form message", () => {
    const error = new ApiError(409, "Invalid transition.", "invalid_status_transition");
    expect(toServerErrors(error, OPTIONS)).toEqual({ form: "Invalid transition.", fields: {} });
  });

  it("falls back for anything that is not an API error", () => {
    expect(toServerErrors(new TypeError("offline"), OPTIONS)).toEqual({
      form: "Could not save. Try again.",
      fields: {},
    });
  });
});

describe("setServerErrors and clearServerErrors", () => {
  function mountedForm() {
    const form = new FormApi({ defaultValues: { title: "", due_date: "" } });
    form.mount();
    const title = new FieldApi({ form, name: "title" });
    const due = new FieldApi({ form, name: "due_date" });
    title.mount();
    due.mount();
    return { form, title, due };
  }

  it("writes the form message and each field's message into the onServer slot", () => {
    const { form, title, due } = mountedForm();
    setServerErrors(form, { form: "Whole form.", fields: { title: "Blank." } });
    expect(serverMessage(form.state.errorMap)).toBe("Whole form.");
    expect(serverMessage(title.state.meta.errorMap)).toBe("Blank.");
    expect(serverMessage(due.state.meta.errorMap)).toBeUndefined();
  });

  it("clears the form message AND every field's message", () => {
    const { form, title } = mountedForm();
    setServerErrors(form, { form: "Whole form.", fields: { title: "Blank." } });
    clearServerErrors(form);
    expect(serverMessage(form.state.errorMap)).toBeUndefined();
    expect(serverMessage(title.state.meta.errorMap)).toBeUndefined();
  });
});
