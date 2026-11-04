import { CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDurationMinutes } from "@/features/planner/usePlannerDay";
import type { BlockType } from "@/types/domain";

import {
  useDashboardSchedule,
  type DashboardScheduleBlock,
  type DashboardScheduleTotals,
} from "./useDashboardSchedule";

/**
 * Compact "Schedule" card: the next blocks of today, how loaded the day is,
 * and one way into the planner (PRD §9.4 — an empty area explains the next
 * step). One blocks query for the card, never one per block; the data comes
 * from `useDashboardSchedule`.
 */

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  task: "Task",
  break: "Break",
  personal: "Personal",
};

const TYPE_ORDER: readonly BlockType[] = ["task", "break", "personal"];

/** 44px tall link target, so the card stays reachable on touch. */
const OPEN_PLANNER_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 text-ui font-medium text-content underline-offset-4 hover:underline";

function typeBreakdown(totals: DashboardScheduleTotals): string {
  return TYPE_ORDER.filter((type) => totals[type] > 0)
    .map((type) => `${BLOCK_TYPE_LABELS[type]} ${formatDurationMinutes(totals[type])}`)
    .join(" · ");
}

function ScheduleSkeleton() {
  return (
    <div role="status" aria-label="Loading today's schedule">
      <span className="sr-only">Loading today&apos;s schedule…</span>
      <div className="space-y-3" aria-hidden="true">
        <div className="h-4 w-3/4 rounded-control bg-surface-muted motion-safe:animate-pulse" />
        <div className="h-4 w-full rounded-control bg-surface-muted motion-safe:animate-pulse" />
        <div className="h-4 w-2/3 rounded-control bg-surface-muted motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function ScheduleError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-3">
      <p className="text-ui font-medium text-content">Could not load today&apos;s schedule</p>
      <p className="text-ui text-muted text-pretty">Check your connection, then try again.</p>
      <Button variant="secondary" size="lg" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ScheduleEmptyState({ allPast }: { allPast: boolean }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-ui font-medium text-content text-balance">
          {allPast ? "Today's blocks are done" : "Nothing scheduled today"}
        </p>
        <p className="text-ui text-muted text-pretty">
          {allPast
            ? "Open the planner to add another block to the rest of your day."
            : "Time blocks you plan for today show up here with their times and titles."}
        </p>
      </div>
      <Link to="/planner" className={OPEN_PLANNER_CLASS}>
        Open planner
      </Link>
    </div>
  );
}

function ScheduleBlockRow({ block }: { block: DashboardScheduleBlock }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p className="flex shrink-0 items-baseline gap-1 text-ui text-content tabular-nums">
        <time dateTime={block.start}>{block.startLabel}</time>
        <span aria-hidden="true">–</span>
        <span className="sr-only">to</span>
        <time dateTime={block.end}>{block.endLabel}</time>
      </p>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-ui font-medium text-content text-pretty">{block.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={block.blockType === "task" ? "neutral" : "outline"}>
            {BLOCK_TYPE_LABELS[block.blockType]}
          </Badge>
          <span className="text-micro text-muted tabular-nums">
            {formatDurationMinutes(block.durationMinutes)}
          </span>
        </div>
      </div>
    </li>
  );
}

export interface ScheduleCardProps {
  /** Keeps "today" in step with the rest of the Dashboard. */
  now?: Date;
}

export function ScheduleCard({ now }: ScheduleCardProps) {
  const { schedule, isLoading, isError, retry } = useDashboardSchedule({ now });
  const breakdown = typeBreakdown(schedule.totals);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-ui font-medium text-content">Schedule</h2>
        <CalendarDays className="size-4.5 text-muted" aria-hidden="true" />
      </div>

      {isLoading ? (
        <ScheduleSkeleton />
      ) : isError ? (
        <ScheduleError onRetry={retry} />
      ) : schedule.isEmpty ? (
        <ScheduleEmptyState allPast={false} />
      ) : schedule.isAllPast ? (
        <ScheduleEmptyState allPast />
      ) : (
        <>
          <ol className="space-y-3">
            {schedule.blocks.map((block) => (
              <ScheduleBlockRow key={block.id} block={block} />
            ))}
          </ol>

          <div className="space-y-2 border-t border-line pt-3">
            <dl className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <dt className="text-micro text-muted">Scheduled today</dt>
                <dd className="text-ui font-medium text-content tabular-nums">
                  {formatDurationMinutes(schedule.totals.scheduled)}
                </dd>
              </div>
              <div className="space-y-0.5">
                <dt className="text-micro text-muted">Blocks today</dt>
                <dd className="text-ui font-medium text-content tabular-nums">
                  {schedule.dayBlockCount}
                </dd>
              </div>
            </dl>
            {breakdown ? (
              <p className="text-micro text-muted text-pretty tabular-nums">{breakdown}</p>
            ) : null}
            <Link to="/planner" className={OPEN_PLANNER_CLASS}>
              Open planner
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
