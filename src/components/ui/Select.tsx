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
        "h-10 w-full rounded-control border bg-surface px-3 text-base text-content transition-[border-color] duration-fast ease-standard",
        "sm:text-ui",
        "focus:border-focus",
        "disabled:cursor-not-allowed disabled:opacity-60",
        invalid ? "border-danger" : "border-control",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
