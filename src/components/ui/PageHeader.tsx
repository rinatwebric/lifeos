import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Small label above the title (date, section, status). */
  eyebrow?: string;
  /** Extra classes for the title (e.g. serif display on the dashboard). */
  titleClassName?: string;
}

export function PageHeader({ title, description, actions, eyebrow, titleClassName }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-micro font-medium tracking-wide text-muted uppercase">{eyebrow}</p>
        ) : null}
        <h1 className={cn("text-heading font-semibold tracking-tight text-balance text-content sm:text-title", titleClassName)}>{title}</h1>
        <p className="max-w-2xl text-ui text-muted text-pretty">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
