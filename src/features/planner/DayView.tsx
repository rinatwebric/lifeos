import { AlertTriangle, CalendarPlus } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { toDateKey } from "@/lib/dates";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { BlockType } from "@/types/domain";

import { formatDurationMinutes, type PlannerDay, type PlannerDayBlock } from "./usePlannerDay";

function minutesFromLabel(label: string): number {
  const [hours, minutes] = label.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToLabel(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function formatTime(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

function blockCountLabel(
  count: number,
  t: { blocksOne: string; blocksMany: string },
  locale: "en" | "ru",
): string {
  if (count === 1) return t.blocksOne;
  const cat = pluralCategory(locale, count);
  void cat;
  return tmpl(t.blocksMany, { count });
}

function describeConflicts(
  day: PlannerDay,
  t: { conflictBoth: string; conflictOverlap: string; conflictSleep: string },
): string {
  const overlaps = day.overlappingBlocks > 0;
  const sleep = day.sleepBlocks > 0;

  if (overlaps && sleep) return t.conflictBoth;
  if (overlaps) return t.conflictOverlap;
  return t.conflictSleep;
}

function DayTimeline({ day, now }: { day: PlannerDay; now: Date }) {
  const m = useMessages();
  const start = day.scale.startMinutes;
  const span = Math.max(60, day.scale.endMinutes - start);
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round(start + (span * index) / 4));
  const nowMs = now.getTime();
  const nowLabel = formatTime(now, day.timeZone);
  const nowMinutes = minutesFromLabel(nowLabel);
  const showNow =
    day.dateKey === toDateKey(now, day.timeZone) &&
    nowMinutes >= start &&
    nowMinutes <= start + span;
  const nowPercent = ((nowMinutes - start) / span) * 100;

  return (
    <div aria-hidden="true">
      <div className="relative h-12 border-y border-line">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute inset-y-2 w-px bg-line"
            style={{ left: `${((tick - start) / span) * 100}%` }}
          />
        ))}
        {day.blocks.map((block) => {
          const blockStart = minutesFromLabel(block.startLabel);
          const rawEnd = minutesFromLabel(block.endLabel);
          const blockEnd = rawEnd <= blockStart ? rawEnd + 1440 : rawEnd;
          const left = Math.min(100, Math.max(0, ((blockStart - start) / span) * 100));
          const width = Math.min(
            100 - left,
            Math.max(
              1.5,
              ((Math.min(blockEnd, start + span) - Math.max(blockStart, start)) / span) * 100,
            ),
          );
          const isCurrent = Date.parse(block.start) <= nowMs && nowMs < Date.parse(block.end);
          const isPast = Date.parse(block.end) <= nowMs;

          return (
            <span
              key={block.id}
              title={`${block.startLabel}–${block.endLabel} ${block.title}`}
              className={cn(
                "absolute top-3 h-5 rounded-[4px] border",
                isCurrent
                  ? "border-accent bg-accent"
                  : isPast
                    ? "border-transparent bg-muted/25"
                    : "border-control bg-surface",
              )}
              style={{ left: `${left}%`, width: `${Math.max(0, width)}%` }}
            />
          );
        })}
        {showNow ? (
          <span className="absolute inset-y-0 w-px bg-accent" style={{ left: `${nowPercent}%` }} />
        ) : null}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-micro text-muted tabular-nums">
        {ticks.map((tick) => (
          <span key={tick}>{minutesToLabel(tick)}</span>
        ))}
      </div>
      {showNow ? (
        <p className="mt-1 text-micro font-medium text-accent tabular-nums">
          {m.common.now} {nowLabel}
        </p>
      ) : null}
    </div>
  );
}

function DayStat({
  label,
  minutes,
  unavailable = false,
}: {
  label: string;
  minutes: number;
  unavailable?: boolean;
}) {
  const m = useMessages();
  const locale = useLocale();

  return (
    <div className="space-y-0.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="text-body font-medium text-content tabular-nums">
        {unavailable ? m.planner.unknown : formatDurationMinutes(minutes, locale)}
      </dd>
    </div>
  );
}

function DayBlockRow({
  block,
  onEdit,
  nowMs,
}: {
  block: PlannerDayBlock;
  onEdit?: (block: PlannerDayBlock) => void;
  nowMs: number;
}) {
  const m = useMessages();
  const t = m.planner;
  const locale = useLocale();
  const isCurrent = Date.parse(block.start) <= nowMs && nowMs < Date.parse(block.end);
  const isPast = Date.parse(block.end) <= nowMs;
  const content = (
    <>
      <p
        className={cn(
          "flex shrink-0 items-baseline gap-1 text-ui tabular-nums sm:min-w-32",
          isPast ? "text-muted" : "text-content",
        )}
      >
        <time dateTime={block.start}>{block.startLabel}</time>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{m.common.to}</span>
        <time dateTime={block.end}>{block.endLabel}</time>
      </p>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p
          className={cn("text-ui font-medium text-pretty", isPast ? "text-muted" : "text-content")}
        >
          {block.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={block.blockType === "task" ? "neutral" : "outline"}>
            {m.enums.blockType[block.blockType]}
          </Badge>
          <span className="text-micro text-muted tabular-nums">
            {formatDurationMinutes(block.durationMinutes, locale)}
          </span>
          {block.overlaps ? <Badge tone="danger">{t.overlapsBadge}</Badge> : null}
          {block.crossesSleep ? <Badge tone="danger">{t.outsideBadge}</Badge> : null}
        </div>
      </div>
    </>
  );

  // The row is one hit area once the page passes a handler: an overlay button
  // instead of a nested icon, so the row keeps its layout and the markup stays
  // valid (a <button> may not wrap the row's block content). The hover tint
  // lives on the row, never on the overlay: an opaque overlay would cover the
  // text it sits on.
  return (
    <li
      className={cn(
        "relative flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4",
        isPast && "bg-surface-muted/40",
        isCurrent && "bg-accent-subtle/30",
        onEdit &&
          "transition-[background-color] duration-fast ease-standard hover:bg-surface-muted",
      )}
    >
      {isCurrent ? (
        <span className="absolute inset-y-4 left-0 w-0.5 bg-accent" aria-hidden="true" />
      ) : null}
      {content}
      {onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(block)}
          aria-label={tmpl(t.editBlock, {
            title: block.title,
            start: block.startLabel,
            end: block.endLabel,
          })}
          className="absolute inset-0 cursor-pointer"
        />
      ) : null}
    </li>
  );
}

function DayViewSkeleton() {
  const m = useMessages();

  return (
    <Card>
      <div role="status" aria-label={m.planner.loadingDay}>
        <span className="sr-only">{m.planner.loadingDay}</span>
        <div className="space-y-3" aria-hidden="true">
          <div className="h-4 w-1/3 rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
        </div>
      </div>
    </Card>
  );
}

function DayViewError({ onRetry }: { onRetry: () => void }) {
  const m = useMessages();

  return (
    <Card>
      <div role="alert" className="space-y-3">
        <p className="text-ui font-medium text-content">{m.planner.loadDayError}</p>
        <p className="text-ui text-muted text-pretty">{m.planner.loadDayHintLong}</p>
        <Button variant="secondary" size="lg" onClick={onRetry}>
          {m.planner.tryAgain}
        </Button>
      </div>
    </Card>
  );
}

export interface DayViewProps {
  day: PlannerDay;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Next step for the empty state; the page supplies the link. */
  emptyAction?: ReactNode;
  /**
   * Opens the block editor. Without it the rows stay static text, so the view
   * keeps working for readers that only render the day.
   */
  onEditBlock?: (block: PlannerDayBlock) => void;
}

export function DayView({
  day,
  isLoading,
  isError,
  onRetry,
  emptyAction,
  onEditBlock,
}: DayViewProps) {
  const m = useMessages();
  const t = m.planner;
  const locale = useLocale();
  const now = new Date();
  const nowMs = now.getTime();

  if (isLoading) {
    return <DayViewSkeleton />;
  }

  if (isError) {
    return <DayViewError onRetry={onRetry} />;
  }

  if (day.isEmpty) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title={t.nothingPlannedDay}
        description={t.nothingPlannedDayHintLong}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-ui font-medium text-content">{t.daySummary}</h2>
        <DayTimeline day={day} now={now} />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <DayStat label={t.scheduled} minutes={day.totals.scheduled} />
          <DayStat label={t.task} minutes={day.totals.task} />
          <DayStat label={t.break} minutes={day.totals.break} />
          <DayStat label={t.personal} minutes={day.totals.personal} />
          <DayStat label={t.free} minutes={day.totals.free} unavailable={!day.hasWakingHours} />
        </dl>
        <p className="text-micro text-muted tabular-nums">
          {tmpl(t.timesIn, { timeZone: day.timeZone })} ·{" "}
          {tmpl(t.dayRuns, { start: day.scale.startLabel, end: day.scale.endLabel })}
        </p>
        {day.hasConflicts ? (
          <div className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-ui font-medium text-content">{t.checkSchedule}</p>
              <p className="text-ui text-muted text-pretty">{describeConflicts(day, t)}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-ui font-medium text-content">{t.blocks}</h2>
          <span className="text-micro text-muted tabular-nums">
            {blockCountLabel(day.blocks.length, t, locale)}
          </span>
        </div>
        <ol className="space-y-3">
          {day.blocks.map((block) => (
            <DayBlockRow key={block.id} block={block} onEdit={onEditBlock} nowMs={nowMs} />
          ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-ui font-medium text-content">{t.freeTime}</h2>
        {!day.hasWakingHours ? (
          <p className="text-ui text-muted text-pretty">{t.freeTimeNoWaking}</p>
        ) : day.free.length === 0 ? (
          <p className="text-ui text-muted text-pretty">{t.freeTimeFull}</p>
        ) : (
          <>
            <p className="text-micro text-muted text-pretty">{t.freeTimeRemainsLong}</p>
            <ul className="space-y-2">
              {day.free.map((window) => (
                <li
                  key={`${window.startMinutes}-${window.endMinutes}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-control border border-line px-3 py-2"
                >
                  <span className="text-ui text-content tabular-nums">
                    {window.startLabel} – {window.endLabel}
                  </span>
                  <span className="text-micro text-muted tabular-nums">
                    {formatDurationMinutes(window.durationMinutes, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

export type { BlockType };
