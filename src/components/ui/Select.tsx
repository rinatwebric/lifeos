import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-content",
        invalid ? "border-red-500" : "border-line",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
