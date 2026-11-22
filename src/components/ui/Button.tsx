import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

/**
 * One primary action per view: inverted ink (white on dark, near-black on
 * light). The accent stays on data, never on chrome.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-content text-canvas hover:opacity-90",
  secondary: "border border-control bg-transparent text-content hover:bg-surface-raised",
  ghost: "text-muted hover:bg-surface-raised hover:text-content",
  danger:
    "border border-danger-border bg-danger-subtle text-danger hover:bg-danger hover:text-danger-content",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-ui",
  md: "h-9 px-4 text-ui",
  lg: "h-10 px-5 text-ui",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-medium transition-[color,background-color,border-color,opacity,scale] duration-fast ease-standard",
        "motion-safe:enabled:active:scale-[0.96]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      ) : null}
      {children}
    </button>
  );
}
