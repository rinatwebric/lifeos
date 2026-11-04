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
        "h-10 w-full rounded-control border bg-surface px-3 text-base text-content placeholder:text-muted transition-[border-color] duration-fast ease-standard",
        "sm:text-ui",
        "focus:border-focus",
        "disabled:cursor-not-allowed disabled:opacity-60",
        invalid ? "border-danger" : "border-control",
        className,
      )}
      {...rest}
    />
  );
}
