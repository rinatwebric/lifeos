import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full rounded-control border bg-surface px-3 py-2 text-base text-content placeholder:text-muted transition-[border-color] duration-fast ease-standard",
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
