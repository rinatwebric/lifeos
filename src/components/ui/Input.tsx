import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-lg border bg-surface px-3 text-sm text-content placeholder:text-muted",
        invalid ? "border-red-500" : "border-line",
        className,
      )}
      {...rest}
    />
  );
}
