import { AlertTriangle, CalendarPlus } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { BlockType } from "@/types/domain";

import { formatDurationMinutes, type PlannerDay, type PlannerDayBlock } from "./usePlannerDay";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  task: "Task",
  break: "Break",
  personal: "Personal",
};

function blockCountLabel(count: number): string {
  return `${count} ${count === 1 ? "block" : "blocks"}`;
}

function describeConflicts(day: PlannerDay): string {
  const overlaps = day.overlappingBlocks > 0;
  const sleep = day.sleepBlocks > 0;

  if (overlaps && sleep) {
    return "Some blocks share the same time, and some sit outside your waking hours. They are marked below.";
  }

  if (overlaps) {
    return "Some blocks share the same time. They are marked below.";
  }

  return "Some blocks sit outside your waking hours. They are marked below.";
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
  return (
    <div className="space-y-0.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="text-body font-medium text-content tabular-nums">
        {unavailable ? "Unknown" : formatDurationMinutes(minutes)}
      </dd>
    </div>
  );
}

function DayBlockRow({ block }: { block: PlannerDayBlock }) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted p-3 sm:flex-row sm:items-start sm:gap-4">
      <p className="flex shrink-0 items-baseline gap-1 text-ui text-content tabular-nums sm:min-w-32">
        <time dateTime={block.start}>{block.startLabel}</time>
        <span aria-hidden="true">–</span>
        <span className="sr-only">to</span>
        <time dateTime={block.end}>{block.endLabel}</time>
      </p>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-ui font-medium text-content text-pretty">{block.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={block.blockType === "task" ? "neutral" : "outline"}>
            {BLOCK_TYPE_LABELS[block.blockType]}
          </Badge>
          <span className="text-micro text-muted tabular-nums">
            {formatDurationMinutes(block.durationMinutes)}
          </span>
          {block.overlaps ? <Badge tone="danger">Overlaps</Badge> : null}
          {block.crossesSleep ? <Badge tone="danger">Outside waking hours</Badge> : null}
        </div>
      </div>
    </li>
  );
}

function DayViewSkeleton() {
  return (
    <Card>
      <div role="status" aria-label="Loading the day">
        <span className="sr-only">Loading the day…</span>
        <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
          <div className="h-4 w-1/3 rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
        </div>
      </div>
    </Card>
  );
}

function DayViewError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div role="alert" className="space-y-3">
        <p className="text-ui font-medium text-content">Could not load this day</p>
        <p className="text-ui text-muted text-pretty">
          The blocks for this day did not load. Check your connection, then try again.
        </p>
        <Button variant="secondary" size="lg" onClick={onRetry}>
          Try again
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
}

export function DayView({ day, isLoading, isError, onRetry, emptyAction }: DayViewProps) {
  if (isLoading) {
    return <DayViewSkeleton />;
  }

  if (isError) {
    return <DayViewError onRetry={onRetry} />;
  }

  if (day.isEmpty) {
    return (
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title="Nothing planned for this day"
          description="Time blocks appear here once they are scheduled. In the meantime, open your tasks and choose what to work on next."
          action={emptyAction}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-ui font-medium text-content">Day summary</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <DayStat label="Scheduled" minutes={day.totals.scheduled} />
          <DayStat label="Task" minutes={day.totals.task} />
          <DayStat label="Break" minutes={day.totals.break} />
          <DayStat label="Personal" minutes={day.totals.personal} />
          <DayStat label="Free" minutes={day.totals.free} unavailable={!day.hasWakingHours} />
        </dl>
        <p className="text-micro text-muted tabular-nums">
          Times shown in {day.timeZone} · day runs {day.scale.startLabel}–{day.scale.endLabel}
        </p>
        {day.hasConflicts ? (
          <div className="flex items-start gap-2 rounded-control border border-danger-border bg-danger-subtle p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-ui font-medium text-content">Check the schedule</p>
              <p className="text-ui text-muted text-pretty">{describeConflicts(day)}</p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-ui font-medium text-content">Blocks</h2>
          <span className="text-micro text-muted tabular-nums">
            {blockCountLabel(day.blocks.length)}
          </span>
        </div>
        <ol className="space-y-3">
          {day.blocks.map((block) => (
            <DayBlockRow key={block.id} block={block} />
          ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-ui font-medium text-content">Free time</h2>
        {!day.hasWakingHours ? (
          <p className="text-ui text-muted text-pretty">
            Free time is calculated from your waking hours. Set your wake-up and sleep time in
            Settings to see the free windows for this day.
          </p>
        ) : day.free.length === 0 ? (
          <p className="text-ui text-muted text-pretty">
            No free time left on this day. Your blocks fill every window between wake-up and sleep.
          </p>
        ) : (
          <>
            <p className="text-micro text-muted text-pretty">
              Free time is what remains after your blocks, working hours and study hours.
            </p>
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
                    {formatDurationMinutes(window.durationMinutes)}
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
