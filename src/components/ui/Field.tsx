import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

interface FieldChildProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  invalid?: boolean;
}

/**
 * Label + control wiring. The child control receives `id`,
 * `aria-describedby` (hint and/or error) and the invalid flag via cloning,
 * so every input stays labelled and its error is announced.
 */
export function Field({ id, label, hint, error, required, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement<FieldChildProps>(children)
    ? cloneElement(children as ReactElement<FieldChildProps>, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        invalid: error ? true : undefined,
      })
    : children;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-ui font-medium text-content">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-muted">
            {" *"}
          </span>
        ) : null}
      </label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-micro text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
