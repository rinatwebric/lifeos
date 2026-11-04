import { AlertTriangle, CalendarPlus, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { tmpl } from "@/lib/i18n/format";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { BlockType } from "@/types/domain";

import { formatDurationMinutes } from "./usePlannerDay";
import {
  formatBlockCount,
  type PlannerWeek,
  type PlannerWeekDay,
} from "./usePlannerWeek";

/**
 * Week view (iteration 4, unit 6). A read-only grid of the seven days of the
 * selected week: per day the weekday, the planned minutes, the block count,
 * the minutes per block type and a conflict marker. Opening a day is a plain
 * link to the day view — a URL, so the browser back button and a shared link
 * both work.
 *
 * Layout: one list that reflows. Seven columns from `lg`, two on `sm`, one
 * below — the narrow layout is a vertical list, never a horizontal scroller
 * (a 375px screen has no room for seven columns and a sideways scroll would
 * hide days behind an invisible edge). Reading order stays Monday → Sunday
 * because the DOM order never changes.
 */

const TYPE_ORDER: readonly BlockType[] = ["task", "break", "personal"];

function describeWeekConflicts(
  week: PlannerWeek,
  t: { conflictOneDay: string; conflictManyDays: string },
): string {
  const n = week.conflictDays;
  return n === 1 ? t.conflictOneDay : tmpl(t.conflictManyDays, { count: n });
}

function WeekViewSkeleton() {
  const m = useMessages();

  return (
    <Card>
      <div role="status" aria-label={m.planner.loadingWeek}>
        <span className="sr-only">{m.planner.loadingWeek}</span>
        <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
          <div className="h-4 w-1/3 rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
          <div className="h-24 w-full rounded-control bg-surface-muted" />
        </div>
      </div>
    </Card>
  );
}

function WeekViewError({ onRetry }: { onRetry: () => void }) {
  const m = useMessages();

  return (
    <Card>
      <div role="alert" className="space-y-3">
        <p className="text-ui font-medium text-content">{m.planner.loadWeekError}</p>
        <p className="text-ui text-muted text-pretty">
          {m.planner.loadWeekHint}
        </p>
        <Button variant="secondary" size="lg" onClick={onRetry}>
          {m.planner.tryAgain}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The card is one link, so its `aria-label` replaces everything inside it.
 * The markers that matter to a screen reader have to travel in the label —
 * otherwise a conflict would only exist as colour and text that the name
 * override hides.
 */
function dayLinkLabel(
  day: PlannerWeekDay,
  t: { openDayAria: string; openDayToday: string; openDayConflict: string },
): string {
  const markers = [
    day.isToday ? t.openDayToday : null,
    day.hasConflict ? t.openDayConflict : null,
  ].filter((marker): marker is string => marker !== null);

  return `${tmpl(t.openDayAria, { weekday: day.weekdayLong, date: day.dateLabel })}${markers.length > 0 ? ` (${markers.join(", ")})` : ""}`;
}

function WeekDayCard({ day, href }: { day: PlannerWeekDay; href: string }) {
  const m = useMessages();
  const t = m.planner;
  const plannedTypes = TYPE_ORDER.filter((type) => day.totals[type] > 0);

  return (
    <li>
      <Link
        to={href}
        aria-label={dayLinkLabel(day, t)}
        className="flex h-full min-h-11 flex-col gap-3 rounded-card border border-line bg-surface p-3 text-content transition-[color,background-color,border-color] duration-fast ease-standard hover:border-control hover:bg-surface-muted"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="text-ui font-medium">{day.weekdayShort}</p>
          <span className="text-micro text-muted tabular-nums">{day.dateLabel}</span>
        </div>

        {day.isToday ? <Badge tone="accent">{t.today}</Badge> : null}

        {day.isEmpty ? (
          <p className="text-ui text-muted text-pretty">{t.nothingPlanned}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-body font-medium tabular-nums">
              {formatDurationMinutes(day.totals.scheduled)}
            </p>
            <p className="text-micro text-muted tabular-nums">
              {formatBlockCount(day.blockCount, { blocksOne: t.blocksOne, blocksMany: t.blocksMany })}
            </p>
            <dl className="space-y-0.5">
              {plannedTypes.map((type) => (
                <div key={type} className="flex items-baseline justify-between gap-2">
                  <dt className="text-micro text-muted">{m.enums.blockType[type]}</dt>
                  <dd className="text-micro text-content tabular-nums">
                    {formatDurationMinutes(day.totals[type])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {day.hasConflict ? (
          <Badge tone="danger">
            <AlertTriangle className="size-3" aria-hidden="true" />
            {t.conflictBadge}
          </Badge>
        ) : null}

        <span className="mt-auto inline-flex items-center gap-1 text-micro font-medium text-content underline underline-offset-4">
          {t.openDay}
          <ChevronRight className="size-3" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function WeekStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="text-body font-medium text-content tabular-nums">{value}</dd>
    </div>
  );
}

export interface WeekViewProps {
  week: PlannerWeek;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Day view URL for one date key; the page owns the URL shape. */
  dayHref: (dateKey: string) => string;
  /** Next step for the empty week; the page supplies the link. */
  emptyAction?: ReactNode;
}

export function WeekView({
  week,
  isLoading,
  isError,
  onRetry,
  dayHref,
  emptyAction,
}: WeekViewProps) {
  const m = useMessages();
  const t = m.planner;

  if (isLoading) {
    return <WeekViewSkeleton />;
  }

  if (isError) {
    return <WeekViewError onRetry={onRetry} />;
  }

  if (week.isEmpty) {
    return (
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title={t.nothingPlannedWeek}
          description={t.nothingPlannedWeekHint}
          action={emptyAction}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-ui font-medium text-content">{t.weekSummary}</h2>
          <span className="text-micro text-muted tabular-nums">
            {formatBlockCount(week.blockCount, { blocksOne: t.blocksOne, blocksMany: t.blocksMany })}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <WeekStat label={t.scheduled} value={formatDurationMinutes(week.totals.scheduled)} />
          <WeekStat label={t.task} value={formatDurationMinutes(week.totals.task)} />
          <WeekStat label={t.break} value={formatDurationMinutes(week.totals.break)} />
          <WeekStat label={t.personal} value={formatDurationMinutes(week.totals.personal)} />
          <WeekStat label={t.plannedDays} value={tmpl(t.daysOfSeven, { count: week.plannedDays })} />
        </dl>
        <p className="text-micro text-muted tabular-nums">
          {tmpl(t.timesIn, { timeZone: week.timeZone })} · {t.weekRuns}
        </p>
        {week.conflictDays > 0 ? (
          <div className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-ui font-medium text-content">{t.weekCheckHint}</p>
              <p className="text-ui text-muted text-pretty">{describeWeekConflicts(week, t)}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-ui font-medium text-content">{t.days}</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {week.days.map((day) => (
            <WeekDayCard key={day.dateKey} day={day} href={dayHref(day.dateKey)} />
          ))}
        </ul>
        <p className="text-micro text-muted text-pretty">
          {t.openDayHint}
        </p>
      </Card>
    </div>
  );
}
