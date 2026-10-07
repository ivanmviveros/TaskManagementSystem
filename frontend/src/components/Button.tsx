import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  /** "sm" is the pager's compact size; every other button is "md". */
  size?: "md" | "sm";
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-status-progress text-white hover:bg-blue-700",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-status-overdue text-white hover:bg-red-700",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "px-4 py-2",
  sm: "px-3 py-1.5",
};

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
      className={clsx(
        "rounded text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...button}
    />
  );
}
