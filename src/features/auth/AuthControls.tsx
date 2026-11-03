import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

/** Label + input + field error. Error text lives in `role="alert"`. */
export function AuthField({ id, label, error, className, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-content">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content",
          "placeholder:text-muted focus:border-focus disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-red-400" : "border-line",
          className,
        )}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface AuthSubmitProps {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}

/** Submit button: disabled while the request is in flight (double-submit guard). */
export function AuthSubmit({ pending, pendingLabel, children }: AuthSubmitProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-content transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

interface AuthAlertProps {
  tone: "error" | "success" | "info";
  children: ReactNode;
}

/** Form-level feedback covering PRD §9.4 error/success states. */
export function AuthAlert({ tone, children }: AuthAlertProps) {
  const role = tone === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "error" &&
          "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
        tone === "success" &&
          "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200",
        tone === "info" && "border-line bg-surface-muted text-muted",
      )}
    >
      {children}
    </div>
  );
}
