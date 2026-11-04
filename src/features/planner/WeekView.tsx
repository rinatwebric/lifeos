import { AlertTriangle, CalendarPlus, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BlockType } from "@/types/domain";

import { formatDurationMinutes } from "./usePlannerDay";
import {
  formatBlockCount,
  WEEK_LENGTH,
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

const TYPE_LABELS: Record<BlockType, string> = {
  task: "Task",
  break: "Break",
  personal: "Personal",
};

const TYPE_ORDER: readonly BlockType[] = ["task", "break", "personal"];

function describeWeekConflicts(week: PlannerWeek): string {
  const days =
    week.conflictDays === 1 ? "One day has blocks" : `${week.conflictDays} days have blocks`;

  return `${days} that share the same time or reach outside your waking hours. They are marked below.`;
}

function WeekViewSkeleton() {
  return (
    <Card>
      <div role="status" aria-label="Loading the week">
        <span className="sr-only">Loading the week…</span>
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
  return (
    <Card>
      <div role="alert" className="space-y-3">
        <p className="text-ui font-medium text-content">Could not load this week</p>
        <p className="text-ui text-muted text-pretty">
          The blocks for this week did not load. Check your connection, then try again.
        </p>
        <Button variant="secondary" size="lg" onClick={onRetry}>
          Try again
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
function dayLinkLabel(day: PlannerWeekDay): string {
  const markers = [day.isToday ? "today" : null, day.hasConflict ? "has a conflict" : null].filter(
    (marker): marker is string => marker !== null,
  );

  return `Open ${day.weekdayLong}, ${day.dateLabel}${markers.length > 0 ? ` (${markers.join(", ")})` : ""}`;
}

function WeekDayCard({ day, href }: { day: PlannerWeekDay; href: string }) {
  const plannedTypes = TYPE_ORDER.filter((type) => day.totals[type] > 0);

  return (
    <li>
      <Link
        to={href}
        aria-label={dayLinkLabel(day)}
        className="flex h-full min-h-11 flex-col gap-3 rounded-card border border-line bg-surface p-3 text-content transition-[color,background-color,border-color] duration-fast ease-standard hover:border-control hover:bg-surface-muted"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="text-ui font-medium">{day.weekdayShort}</p>
          <span className="text-micro text-muted tabular-nums">{day.dateLabel}</span>
        </div>

        {day.isToday ? <Badge tone="accent">Today</Badge> : null}

        {day.isEmpty ? (
          <p className="text-ui text-muted text-pretty">Nothing planned</p>
        ) : (
          <div className="space-y-1">
            <p className="text-body font-medium tabular-nums">
              {formatDurationMinutes(day.totals.scheduled)}
            </p>
            <p className="text-micro text-muted tabular-nums">{formatBlockCount(day.blockCount)}</p>
            <dl className="space-y-0.5">
              {plannedTypes.map((type) => (
                <div key={type} className="flex items-baseline justify-between gap-2">
                  <dt className="text-micro text-muted">{TYPE_LABELS[type]}</dt>
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
            Conflict
          </Badge>
        ) : null}

        <span className="mt-auto inline-flex items-center gap-1 text-micro font-medium text-content underline underline-offset-4">
          Open day
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
          title="Nothing planned for this week"
          description="Time blocks appear here once they are scheduled. Open your tasks and choose what to work on next, then come back to see the week fill up."
          action={emptyAction}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-ui font-medium text-content">Week summary</h2>
          <span className="text-micro text-muted tabular-nums">
            {formatBlockCount(week.blockCount)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <WeekStat label="Scheduled" value={formatDurationMinutes(week.totals.scheduled)} />
          <WeekStat label="Task" value={formatDurationMinutes(week.totals.task)} />
          <WeekStat label="Break" value={formatDurationMinutes(week.totals.break)} />
          <WeekStat label="Personal" value={formatDurationMinutes(week.totals.personal)} />
          <WeekStat label="Planned days" value={`${week.plannedDays} of ${WEEK_LENGTH}`} />
        </dl>
        <p className="text-micro text-muted tabular-nums">
          Times shown in {week.timeZone} · week runs Monday to Sunday
        </p>
        {week.conflictDays > 0 ? (
          <div className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-ui font-medium text-content">Check the schedule</p>
              <p className="text-ui text-muted text-pretty">{describeWeekConflicts(week)}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <h2 className="text-ui font-medium text-content">Days</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {week.days.map((day) => (
            <WeekDayCard key={day.dateKey} day={day} href={dayHref(day.dateKey)} />
          ))}
        </ul>
        <p className="text-micro text-muted text-pretty">
          Open a day to see its blocks and the time still free for planning.
        </p>
      </Card>
    </div>
  );
}
