import { ListOrdered } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { useMessages } from "@/lib/i18n/I18nContext";

interface WeeklyReviewProps {
  lines: string[];
}

export function WeeklyReview({ lines }: WeeklyReviewProps) {
  const t = useMessages().weeklyReview;

  return (
    <Card>
      <div className="space-y-1">
        <h2 className="text-title font-semibold text-content">{t.title}</h2>
        <p className="text-ui text-muted">{t.description}</p>
      </div>
      {lines.length === 0 ? (
        <p className="text-ui text-muted mt-3">{t.empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-ui text-content">
              <ListOrdered className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
