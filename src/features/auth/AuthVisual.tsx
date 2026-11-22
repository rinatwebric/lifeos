import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/I18nContext";

interface DayRowProps {
  time: string;
  title: string;
  meta: string;
  accent?: boolean;
}

function DayRow({ time, title, meta, accent = false }: DayRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-[2.75rem_1fr] items-start gap-3 rounded-[14px] px-3.5 py-3.5",
        accent ? "bg-accent text-accent-content" : "bg-surface-raised text-content",
      )}
    >
      <span
        className={cn(
          "pt-0.5 text-caption tabular-nums",
          accent ? "text-accent-content" : "text-muted",
        )}
      >
        {time}
      </span>
      <div>
        <p className="text-ui leading-tight font-medium">{title}</p>
        <p
          className={cn(
            "mt-1 text-caption leading-snug",
            accent ? "text-accent-content" : "text-muted",
          )}
        >
          {meta}
        </p>
      </div>
    </div>
  );
}

/**
 * The product in miniature: a plausible day with one focus block, not a
 * decorative diagram. The panel is illustrative, so it stays out of the
 * accessibility tree; the headline and form carry the real page.
 */
export function AuthVisual() {
  const t = useMessages().auth.layout;

  return (
    <div aria-hidden="true" className="w-full max-w-[540px] rounded-[28px] bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-ui font-medium text-content">{t.dayTitle}</p>
          <p className="mt-0.5 text-caption text-muted">{t.daySubtitle}</p>
        </div>
        <p className="text-caption text-muted tabular-nums">{t.dayTotal}</p>
      </div>

      <div className="mt-5 space-y-2.5">
        <DayRow time="09:00" title={t.dayFocus} meta={t.dayFocusMeta} accent />
        <DayRow time="12:30" title={t.dayWalk} meta={t.dayWalkMeta} />
        <DayRow time="16:00" title={t.dayReview} meta={t.dayReviewMeta} />
      </div>
    </div>
  );
}
