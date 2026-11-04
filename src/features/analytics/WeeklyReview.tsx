import { ListOrdered } from "lucide-react";

import { Card } from "@/components/ui/Card";

interface WeeklyReviewProps {
  lines: string[];
}

const WEEKLY_REVIEW_COPY = {
  title: "Weekly review",
  description: "A deterministic summary of the current week — no model involved.",
  empty: "Nothing to review yet: no tasks due, no habit obligations, no active goals this week.",
} as const;

export function WeeklyReview({ lines }: WeeklyReviewProps) {
  return (
    <Card>
      <div className="space-y-1">
        <h2 className="text-title font-semibold text-content">{WEEKLY_REVIEW_COPY.title}</h2>
        <p className="text-ui text-muted">{WEEKLY_REVIEW_COPY.description}</p>
      </div>
      {lines.length === 0 ? (
        <p className="text-ui text-muted mt-3">{WEEKLY_REVIEW_COPY.empty}</p>
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
