import { AlertTriangle, Clock, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatLongDate, localDateTimeToIso } from "@/lib/dates";
import { tmpl } from "@/lib/i18n/format";
import { useIntlLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { Priority } from "@/types/domain";

import { formatDurationMinutes } from "./usePlannerDay";
import type {
  PlanPreview,
  PlanPreviewAlreadyPlanned,
  PlanPreviewIssue,
  PlanPreviewSlot,
} from "./usePlanPreview";

/**
 * Plan preview panel (iteration 4, unit 8). It renders a proposal and nothing
 * else: Accept, Regenerate and Cancel only call the callbacks they are given.
 * No API call, no cache write, no optimistic block — unit 9 owns the write.
 */

function priorityLabel(priority: Priority, t: Record<Priority, string>): string {
  return t[priority];
}

function slotCountLabel(count: number, t: { slotsOne: string; slotsMany: string }): string {
  return count === 1 ? t.slotsOne : tmpl(t.slotsMany, { count });
}

function taskCountLabel(count: number, t: { tasksOne: string; tasksMany: string }): string {
  return count === 1 ? t.tasksOne : tmpl(t.tasksMany, { count });
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
  const m = useMessages();
  const t = m.planner;
  const priorityLabels: Record<Priority, string> = {
    low: t.lowPriority,
    medium: t.mediumPriority,
    high: t.highPriority,
    critical: t.criticalPriority,
  };

  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted p-3 sm:flex-row sm:items-start sm:gap-4">
      <p className="flex shrink-0 items-baseline gap-1 text-ui text-content tabular-nums sm:min-w-32">
        <time dateTime={slot.start}>{slot.startLabel}</time>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{m.common.to}</span>
        <time dateTime={slot.end}>{slot.endLabel}</time>
      </p>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-ui font-medium text-content text-pretty">{slot.taskTitle}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{priorityLabel(slot.priority, priorityLabels)}</Badge>
          <span className="text-micro text-muted tabular-nums">
            {formatDurationMinutes(slot.durationMinutes)}
          </span>
          {slot.overdue ? <Badge tone="danger">{m.enums.overdue}</Badge> : null}
          {slot.crossesMidnight ? <Badge tone="outline">{t.endsAfterMidnight}</Badge> : null}
        </div>
        <p className="text-ui text-muted text-pretty">{slot.reason}</p>
      </div>
    </li>
  );
}

function AlreadyPlannedRow({ entry }: { entry: PlanPreviewAlreadyPlanned }) {
  const m = useMessages();

  return (
    <li className="flex flex-col gap-1 rounded-control border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-ui font-medium text-content text-pretty">{entry.taskTitle}</p>
        <p className="flex shrink-0 items-baseline gap-1 text-ui text-muted tabular-nums">
          <time dateTime={entry.start}>{entry.startLabel}</time>
          <span aria-hidden="true">–</span>
          <span className="sr-only">{m.common.to}</span>
          <time dateTime={entry.end}>{entry.endLabel}</time>
        </p>
        {entry.estimatedDurationMinutes === null ? null : (
          <span className="text-micro text-muted tabular-nums">
            {tmpl(m.planner.estimate, { duration: formatDurationMinutes(entry.estimatedDurationMinutes) })}
          </span>
        )}
      </div>
      <p className="text-ui text-muted text-pretty">{entry.explanation}</p>
    </li>
  );
}

function IssueRow({ issue }: { issue: PlanPreviewIssue }) {
  const m = useMessages();

  return (
    <li className="space-y-1.5 rounded-control border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-ui font-medium text-content text-pretty">{issue.taskTitle}</p>
        {issue.estimatedDurationMinutes === null ? null : (
          <span className="text-micro text-muted tabular-nums">
            {tmpl(m.planner.estimate, { duration: formatDurationMinutes(issue.estimatedDurationMinutes) })}
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
  const m = useMessages();
  const t = m.planner;

  if (!preview.summary.hasFreeWindows) {
    return <PreviewNotice>{t.noFreeTime}</PreviewNotice>;
  }

  if (preview.slots.length === 0) {
    if (preview.alreadyPlanned.length > 0) {
      return <p className="text-ui text-muted text-pretty">{t.noSlots}</p>;
    }

    return <p className="text-ui text-muted text-pretty">{t.noSlotFits}</p>;
  }

  return (
    <>
      <p className="text-micro text-muted">{tmpl(t.timesIn, { timeZone: preview.timeZone })}.</p>
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
  const m = useMessages();
  const t = m.planner;
  const intl = useIntlLocale();

  if (isLoading) {
    return <PlanPreviewSkeleton />;
  }

  if (isError) {
    return <PlanPreviewError onRetry={onRetry} />;
  }

  const { summary } = preview;
  const hasNothingToPlan =
    summary.candidateCount === 0 &&
    summary.needsEstimateCount === 0 &&
    preview.alreadyPlanned.length === 0;

  const planDate = formatLongDate(
    new Date(localDateTimeToIso(`${preview.dateKey}T12:00`, preview.timeZone)),
    preview.timeZone,
    intl,
  );

  return (
    <Card className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-heading text-content">{t.planPreview}</h2>
        <p className="text-ui text-muted text-pretty">{tmpl(t.planFor, { date: planDate })}</p>
        <p className="text-ui text-muted text-pretty">{t.notSavedHint}</p>
      </header>

      {!summary.hasWakingHours ? (
        <EmptyState
          icon={Clock}
          title={t.setWakingFirst}
          description={t.wakingHint}
        />
      ) : hasNothingToPlan ? (
        <EmptyState
          icon={ListChecks}
          title={t.noOpenTasks}
          description={t.noOpenTasksHint}
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <PreviewStat label={t.planned} value={formatDurationMinutes(summary.plannedMinutes)} />
            <PreviewStat
              label={t.leftToPlace}
              value={
                summary.unplacedMinutes > 0
                  ? formatDurationMinutes(summary.unplacedMinutes)
                  : t.none
              }
            />
            <PreviewStat
              label={t.needsEstimate}
              value={
                summary.needsEstimateCount > 0 ? taskCountLabel(summary.needsEstimateCount, t) : t.none
              }
            />
          </dl>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-ui font-medium text-content">{t.suggestedSlots}</h3>
              <span className="text-micro text-muted tabular-nums">
                {slotCountLabel(summary.slotCount, t)}
              </span>
            </div>
            <PreviewSlotList preview={preview} />
          </section>

          <IssueGroup
            title={t.notPlaced}
            intro={t.notPlacedHint}
            empty={t.allFit}
            issues={preview.doesNotFit}
          />

          {preview.alreadyPlanned.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-ui font-medium text-content">{t.alreadyPlanned}</h3>
              <p className="text-ui text-muted text-pretty">
                {t.alreadyPlannedHint}
              </p>
              <ul className="space-y-3">
                {preview.alreadyPlanned.map((entry) => (
                  <AlreadyPlannedRow key={entry.taskId} entry={entry} />
                ))}
              </ul>
            </section>
          ) : null}

          <IssueGroup
            title={t.needsEstimate}
            intro={t.needsEstimateHint}
            empty={t.allEstimated}
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
            {t.acceptPlan}
          </Button>
          <Button size="lg" variant="secondary" onClick={onRegenerate} disabled={isSaving}>
            {t.regenerate}
          </Button>
          <Button size="lg" variant="ghost" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
        {preview.canAccept ? null : (
          <p className="text-micro text-muted text-pretty">
            {t.acceptDisabledHint}
          </p>
        )}
      </footer>
    </Card>
  );
}

function PlanPreviewSkeleton() {
  const m = useMessages();

  return (
    <Card>
      <div role="status" aria-label={m.planner.buildingPlan}>
        <span className="sr-only">{m.planner.buildingPlan}</span>
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
  const m = useMessages();

  return (
    <Card>
      <div role="alert" className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-ui font-medium text-content">{m.planner.buildPlanError}</p>
          <p className="text-ui text-muted text-pretty">
            {m.planner.buildPlanHint}
          </p>
          {onRetry ? (
            <Button variant="secondary" size="lg" className="mt-1" onClick={onRetry}>
              {m.planner.tryAgain}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
