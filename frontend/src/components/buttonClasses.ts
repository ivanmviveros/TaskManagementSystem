import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "danger";
/** "sm" is the pager's compact size; every other button is "md". */
export type ButtonSize = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-status-progress text-white hover:bg-blue-700",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
  danger: "bg-status-overdue text-white hover:bg-red-700",
};

const SIZES: Record<ButtonSize, string> = {
  md: "px-4 py-2",
  sm: "px-3 py-1.5",
};

/**
 * The button look, shared by Button and ButtonLink so a link styled as a button
 * cannot drift from a real one. Its own module rather than an export of
 * Button.tsx, so that file keeps exporting only a component (Fast Refresh).
 */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return clsx(
    "rounded text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
    SIZES[size],
    VARIANTS[variant],
    className,
  );
}
