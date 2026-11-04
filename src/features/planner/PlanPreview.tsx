import { AlertTriangle, Clock, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Priority } from "@/types/domain";

import { formatDurationMinutes } from "./usePlannerDay";
import type { PlanPreview, PlanPreviewIssue, PlanPreviewSlot } from "./usePlanPreview";

/**
 * Plan preview panel (iteration 4, unit 8). It renders a proposal and nothing
 * else: Accept, Regenerate and Cancel only call the callbacks they are given.
 * No API call, no cache write, no optimistic block — unit 9 owns the write.
 *
 * Copy follows the project voice (see `.agents/skills/better-writing`): the
 * reader is addressed directly, every empty state names the next step, and no
 * screen shows a raw reason code (`no-window`, `too-long`).
 */

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
  critical: "Critical priority",
};

function slotCountLabel(count: number): string {
  return count === 1 ? "1 slot" : `${count} slots`;
}

function taskCountLabel(count: number): string {
  return count === 1 ? "1 task" : `${count} tasks`;
}

export interface PlanPreviewProps {
  preview: PlanPreview;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onAccept: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
  /** True while a caller saves the accepted slots; the proposal itself is unchanged. */
  isSaving?: boolean;
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="text-body font-medium text-content tabular-nums">{value}</dd>
    </div>
  );
}

function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-control border border-warning-border bg-warning-subtle p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-ui text-content text-pretty">{children}</p>
    </div>
  );
}

function SlotRow({ slot }: { slot: PlanPreviewSlot }) {
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted p-3 sm:flex-row sm:items-start sm:gap-4">
      <p className="flex shrink-0 items-baseline gap-1 text-ui text-content tabular-nums sm:min-w-32">
        <time dateTime={slot.start}>{slot.startLabel}</time>
        <span aria-hidden="true">–</span>
        <span className="sr-only">to</span>
        <time dateTime={slot.end}>{slot.endLabel}</time>
      </p>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-ui font-medium text-content text-pretty">{slot.taskTitle}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{PRIORITY_LABELS[slot.priority]}</Badge>
          <span className="text-micro text-muted tabular-nums">
            {formatDurationMinutes(slot.durationMinutes)}
          </span>
          {slot.overdue ? <Badge tone="danger">Overdue</Badge> : null}
          {slot.crossesMidnight ? <Badge tone="outline">Ends after midnight</Badge> : null}
        </div>
        <p className="text-ui text-muted text-pretty">{slot.reason}</p>
      </div>
    </li>
  );
}

function IssueRow({ issue }: { issue: PlanPreviewIssue }) {
  return (
    <li className="space-y-1.5 rounded-control border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-ui font-medium text-content text-pretty">{issue.taskTitle}</p>
        {issue.estimatedDurationMinutes === null ? null : (
          <span className="text-micro text-muted tabular-nums">
            Estimate: {formatDurationMinutes(issue.estimatedDurationMinutes)}
          </span>
        )}
      </div>
      <p className="text-ui text-muted text-pretty">{issue.explanation}</p>
    </li>
  );
}

function IssueGroup({
  title,
  intro,
  empty,
  issues,
}: {
  title: string;
  intro: string;
  empty: string;
  issues: readonly PlanPreviewIssue[];
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-ui font-medium text-content">{title}</h3>
      {issues.length === 0 ? (
        <p className="text-ui text-muted text-pretty">{empty}</p>
      ) : (
        <>
          <p className="text-ui text-muted text-pretty">{intro}</p>
          <ul className="space-y-3">
            {issues.map((issue) => (
              <IssueRow key={issue.taskId} issue={issue} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PreviewSlotList({ preview }: { preview: PlanPreview }) {
  if (!preview.summary.hasFreeWindows) {
    return (
      <PreviewNotice>
        There is no free time left on this day. Free up time or pick another day, then build the
        plan again.
      </PreviewNotice>
    );
  }

  if (preview.slots.length === 0) {
    return (
      <p className="text-ui text-muted text-pretty">
        No slot fits into this day. The tasks that could not be placed are listed below.
      </p>
    );
  }

  return (
    <>
      <p className="text-micro text-muted">Times shown in {preview.timeZone}.</p>
      <ol className="space-y-3">
        {preview.slots.map((slot) => (
          <SlotRow key={`${slot.taskId}-${slot.start}`} slot={slot} />
        ))}
      </ol>
    </>
  );
}

export function PlanPreview({
  preview,
  isLoading = false,
  isError = false,
  onRetry,
  onAccept,
  onRegenerate,
  onCancel,
  isSaving = false,
}: PlanPreviewProps) {
  if (isLoading) {
    return <PlanPreviewSkeleton />;
  }

  if (isError) {
    return <PlanPreviewError onRetry={onRetry} />;
  }

  const { summary } = preview;
  const hasNothingToPlan = summary.candidateCount === 0 && summary.needsEstimateCount === 0;

  return (
    <Card className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-heading text-content">Plan preview</h2>
        <p className="text-ui text-muted text-pretty">Nothing is saved until you accept.</p>
      </header>

      {!summary.hasWakingHours ? (
        <EmptyState
          icon={Clock}
          title="Set your waking hours first"
          description="The plan is built between your wake-up and sleep time. Add both in Settings, then build the plan again."
        />
      ) : hasNothingToPlan ? (
        <EmptyState
          icon={ListChecks}
          title="No open tasks to plan"
          description="Add a task with a time estimate, then build the plan again."
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <PreviewStat label="Planned" value={formatDurationMinutes(summary.plannedMinutes)} />
            <PreviewStat
              label="Left to place"
              value={
                summary.unplacedMinutes > 0
                  ? formatDurationMinutes(summary.unplacedMinutes)
                  : "None"
              }
            />
            <PreviewStat
              label="Needs an estimate"
              value={
                summary.needsEstimateCount > 0 ? taskCountLabel(summary.needsEstimateCount) : "None"
              }
            />
          </dl>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-ui font-medium text-content">Suggested slots</h3>
              <span className="text-micro text-muted tabular-nums">
                {slotCountLabel(summary.slotCount)}
              </span>
            </div>
            <PreviewSlotList preview={preview} />
          </section>

          <IssueGroup
            title="Not placed today"
            intro="These tasks have an estimate but found no room on this day."
            empty="Every task with an estimate fits into this day."
            issues={preview.doesNotFit}
          />

          <IssueGroup
            title="Needs an estimate"
            intro="The planner reserves time only for tasks with an estimate."
            empty="Every open task has an estimate."
            issues={preview.needsEstimate}
          />
        </>
      )}

      <footer className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            onClick={onAccept}
            disabled={!preview.canAccept || isSaving}
            loading={isSaving}
          >
            Accept plan
          </Button>
          <Button size="lg" variant="secondary" onClick={onRegenerate} disabled={isSaving}>
            Regenerate
          </Button>
          <Button size="lg" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {preview.canAccept ? null : (
          <p className="text-micro text-muted text-pretty">
            Accept stays off while no slot is planned. Regenerate after changing the day, or cancel
            to leave the schedule as it is.
          </p>
        )}
      </footer>
    </Card>
  );
}

function PlanPreviewSkeleton() {
  return (
    <Card>
      <div role="status" aria-label="Building the plan">
        <span className="sr-only">Building the plan…</span>
        <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
          <div className="h-4 w-1/3 rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
          <div className="h-14 w-full rounded-control bg-surface-muted" />
        </div>
      </div>
    </Card>
  );
}

function PlanPreviewError({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card>
      <div role="alert" className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-ui font-medium text-content">Could not build the plan</p>
          <p className="text-ui text-muted text-pretty">
            The tasks and blocks for this day did not load. Check your connection, then try again.
          </p>
          {onRetry ? (
            <Button variant="secondary" size="lg" className="mt-1" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
