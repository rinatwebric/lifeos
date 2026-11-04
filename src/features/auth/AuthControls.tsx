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
      <label htmlFor={id} className="block text-ui font-medium text-content">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "w-full rounded-control border bg-surface px-3 py-2 text-base text-content",
          "placeholder:text-muted focus:border-focus disabled:cursor-not-allowed disabled:opacity-60",
          "transition-[border-color] duration-fast ease-standard sm:text-ui",
          error ? "border-danger" : "border-control",
          className,
        )}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-micro text-danger">
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
      className="h-11 w-full rounded-control bg-accent px-4 py-2 text-ui font-medium text-accent-content transition-[opacity] duration-fast ease-standard hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
        "rounded-control border px-3 py-2 text-ui",
        tone === "error" && "border-danger-border bg-danger-subtle text-danger",
        tone === "success" && "border-success-border bg-success-subtle text-success",
        tone === "info" && "border-line bg-surface-muted text-muted",
      )}
    >
      {children}
    </div>
  );
}
