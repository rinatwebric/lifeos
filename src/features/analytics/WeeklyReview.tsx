import { Card } from "@/components/ui/Card";
import { useMessages } from "@/lib/i18n/I18nContext";

interface WeeklyReviewProps {
  lines: string[];
}

export function WeeklyReview({ lines }: WeeklyReviewProps) {
  const t = useMessages().weeklyReview;

  return (
    <Card>
      <div className="space-y-1.5">
        <h2 className="text-[15px] font-medium text-content">{t.title}</h2>
        <p className="text-caption leading-relaxed text-muted">{t.description}</p>
      </div>
      {lines.length === 0 ? (
        <p className="mt-4 text-ui text-muted">{t.empty}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {lines.map((line) => (
            <li key={line} className="py-3 text-ui leading-relaxed text-content">
              {line}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
