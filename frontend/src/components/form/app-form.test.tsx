import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api-error";
import { useAppForm } from "./app-form";
import { clearServerErrors, setServerErrors, toServerErrors } from "./server-errors";

/** The smallest form wired the way every app form is (spec §5.2). */
function Harness({ save }: { save: (values: { email: string }) => Promise<unknown> }) {
  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value, formApi }) => {
      try {
        await save(value);
      } catch (caught) {
        setServerErrors(
          formApi,
          toServerErrors(caught, { renderedFields: ["email"], fallback: "Could not save." }),
        );
      }
    },
  });
  return (
    <form
      noValidate
      aria-label="Harness"
      onSubmit={(event) => {
        event.preventDefault();
        clearServerErrors(form);
        void form.handleSubmit();
      }}
    >
      <form.AppField name="email">{(field) => <field.TextField id="email" label="Email" />}</form.AppField>
      <form.AppForm>
        <form.ServerFormError />
        <form.SubmitButton label="Save" pendingLabel="Saving…" />
      </form.AppForm>
    </form>
  );
}

/** A form with one checkbox group, to exercise the group's updater-based toggle. */
function GroupHarness({ save }: { save: (values: { status: ("A" | "B")[] }) => void }) {
  const form = useAppForm({
    defaultValues: { status: [] as ("A" | "B")[] },
    onSubmit: ({ value }) => {
      save(value);
    },
  });
  return (
    <form
      noValidate
      aria-label="Group harness"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="status">
        {(field) => (
          <field.CheckboxGroupField
            legend="Status"
            options={[
              { value: "A", label: "A" },
              { value: "B", label: "B" },
            ]}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton label="Save" pendingLabel="Saving…" />
      </form.AppForm>
    </form>
  );
}

const taken = () => new ApiError(400, "Invalid input.", "validation_error", { email: ["Taken."] });

describe("useAppForm", () => {
  it("shows a field's server error beside it and marks the input invalid", async () => {
    render(<Harness save={() => Promise.reject(taken())} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Taken.")).toHaveAttribute("id", "email-error");
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a form-level message in the alert", async () => {
    render(<Harness save={() => Promise.reject(new ApiError(409, "Conflict.", "conflict"))} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conflict.");
  });

  it("submits again after a server error, and clears the old one (D80)", async () => {
    const save = vi.fn().mockRejectedValueOnce(taken()).mockResolvedValueOnce(undefined);
    render(<Harness save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Taken.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Taken.")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("disables the button and shows its pending label while submitting", async () => {
    render(<Harness save={() => new Promise(() => {})} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("toggles a checkbox group's values in a fieldset", async () => {
    const save = vi.fn();
    render(<GroupHarness save={save} />);
    expect(screen.getByRole("group", { name: "Status" })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("A"));
    await user.click(screen.getByLabelText("B"));
    await user.click(screen.getByLabelText("A"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ status: ["B"] }));
  });
});
