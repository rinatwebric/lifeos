import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/**
 * An empty slot keeps its frame and explains the next step. The icon stays a
 * plain 20px mark: no tinted medallion on top of every empty block.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line px-6 py-10 text-center">
      <Icon className="size-5 text-muted" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-ui font-medium text-content text-balance">{title}</p>
        <p className="mx-auto max-w-sm text-caption text-muted text-pretty">{description}</p>
      </div>
      {action}
    </div>
  );
}
