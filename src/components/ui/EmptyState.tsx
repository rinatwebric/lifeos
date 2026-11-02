import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface-muted text-muted">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-content">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}