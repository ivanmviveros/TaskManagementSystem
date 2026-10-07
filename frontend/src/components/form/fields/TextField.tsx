import { useStore } from "@tanstack/react-form";
import type { InputHTMLAttributes } from "react";

import { TextField as TextFieldView } from "../../TextField";
import { useFieldContext } from "../form-contexts";
import { serverMessage } from "../server-errors";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "defaultValue" | "onChange" | "onBlur" | "checked"
>;

interface TextFieldProps extends InputProps {
  id: string;
  label: string;
  density?: "default" | "compact";
}

/** A text-like input bound to its form field, showing the field's server error (D80). */
export function TextField(props: TextFieldProps) {
  const field = useFieldContext<string>();
  const value = useStore(field.store, (state) => state.value);
  const error = useStore(field.store, (state) => serverMessage(state.meta.errorMap));
  return (
    <TextFieldView
      {...props}
      value={value}
      error={error}
      onChange={(event) => field.handleChange(event.target.value)}
      onBlur={field.handleBlur}
    />
  );
}
