import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

interface PhasePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: string;
  detail: string;
  footer?: ReactNode;
}

/**
 * Honest placeholder for modules that are specified in the PRD but not built yet.
 * It keeps navigation functional without inventing data or dead buttons.
 */
export function PhasePlaceholder({
  title,
  description,
  icon,
  phase,
  detail,
  footer,
}: PhasePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Card>
        <EmptyState icon={icon} title={`Planned for ${phase}`} description={detail} />
      </Card>

      {footer ? <div className="text-xs text-muted">{footer}</div> : null}
    </div>
  );
}
