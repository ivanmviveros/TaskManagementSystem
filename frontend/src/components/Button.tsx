import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-status-progress text-white hover:bg-blue-700",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-status-overdue text-white hover:bg-red-700",
};

export function Button({ variant = "primary", className, type, ...button }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={clsx(
        "rounded px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        className,
      )}
      {...button}
    />
  );
}
