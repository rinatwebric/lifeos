import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Extra classes for the title (kept for screen-specific typography). */
  titleClassName?: string;
}

/**
 * The screen's one h1 and its finding. No eyebrow: the first line of the
 * description carries the date, scope or fact in plain sentence case.
 */
export function PageHeader({ title, description, actions, titleClassName }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1
          className={cn(
            "text-[22px] leading-tight font-semibold tracking-[-0.02em] text-content text-balance sm:text-title",
            titleClassName,
          )}
        >
          {title}
        </h1>
        <p className="max-w-2xl text-caption leading-relaxed text-muted text-pretty">
          {description}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
