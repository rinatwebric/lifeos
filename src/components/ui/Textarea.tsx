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
        "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-content placeholder:text-muted",
        invalid ? "border-red-500" : "border-line",
        className,
      )}
      {...rest}
    />
  );
}
