import type { ButtonHTMLAttributes } from "react";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonClasses";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** "sm" is the pager's compact size; every other button is "md". */
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type,
  ...button
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      {...button}
    />
  );
}
