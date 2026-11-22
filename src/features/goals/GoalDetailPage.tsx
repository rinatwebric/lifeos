import { ArrowLeft, CalendarDays, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DeleteGoalDialog } from "@/features/goals/components/DeleteGoalDialog";
import { GoalFormDialog } from "@/features/goals/components/GoalFormDialog";
import { MilestoneList } from "@/features/goals/components/MilestoneList";
import { GoalServiceError } from "@/features/goals/errors";
import { useGoal, useMilestones } from "@/features/goals/hooks";
import { calculateGoalProgress } from "@/lib/progress";
import { tmpl } from "@/lib/i18n/format";
import { useMessages, useIntlLocale } from "@/lib/i18n/I18nContext";
import type { Goal } from "@/types/domain";

const BACK_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 text-ui font-medium text-muted transition-colors duration-fast ease-standard hover:text-content";

const SECONDARY_LINK_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-pill border border-control px-4 text-ui font-medium text-content transition-[background-color,color] duration-fast ease-standard hover:bg-surface-raised";

function formatDateRange(goal: Goal, started: string): string {
  if (goal.targetDate) {
    return `${goal.startDate} – ${goal.targetDate}`;
  }
  return started;
}

function BackLink({ label }: { label: string }) {
  return (
    <Link to="/goals" aria-label={`← ${label}`} className={BACK_LINK_CLASS}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function GoalDetailPage() {
  const m = useMessages();
  const t = m.goals;
  void useIntlLocale();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goalQuery = useGoal(id);
  const milestonesQuery = useMilestones(id);

  const [editingGoal, setEditingGoal] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState(false);

  if (goalQuery.isLoading) {
    return (
      <div className="space-y-6">
        <BackLink label={t.allGoals} />
        <div role="status" aria-label={t.loadingGoal}>
          <span className="sr-only">{t.loadingGoal}</span>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <Card className="space-y-4 p-5">
              <div className="h-8 w-1/2 rounded bg-surface-muted" aria-hidden="true" />
              <div className="h-5 w-2/5 rounded-full bg-surface-muted" aria-hidden="true" />
              <div className="h-4 w-full rounded bg-surface-muted" aria-hidden="true" />
              <div className="h-4 w-3/5 rounded bg-surface-muted" aria-hidden="true" />
            </Card>
            <Card className="space-y-4 p-5">
              <div className="h-4 w-1/3 rounded bg-surface-muted" aria-hidden="true" />
              <div className="h-8 w-1/2 rounded bg-surface-muted" aria-hidden="true" />
              <div className="h-1 w-full rounded-full bg-surface-muted" aria-hidden="true" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const goal = goalQuery.data ?? null;
  if (goalQuery.isError || !goal) {
    // A missing/deleted goal is a calm empty state; any other failure is a
    // retryable error. Mocks without an `error` object fall back to not_found
    // so the unknown-id case keeps rendering the back link.
    const code = goalQuery.error instanceof GoalServiceError ? goalQuery.error.code : "not_found";
    if (code !== "not_found") {
      return (
        <div className="space-y-6">
          <BackLink label={t.allGoals} />
          <div role="alert" className="rounded-card border border-line bg-surface p-5">
            <p className="text-ui text-content">{t.loadGoalError}</p>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => void goalQuery.refetch()}>
                {m.common.retry}
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <BackLink label={t.allGoals} />
        <Card className="space-y-4">
          <h1 className="text-title font-semibold tracking-[-0.02em] text-content">
            {t.goalNotFound}
          </h1>
          <p className="text-ui text-muted">{t.goalNotFoundHint}</p>
          <div>
            <Link to="/goals" className={SECONDARY_LINK_CLASS}>
              {t.backToGoals}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const milestones = milestonesQuery.data ?? [];
  // `calculateGoalProgress` never returns null for goals: with zero milestones
  // it falls back to the clamped manual value, so no `?? goal.progress` here.
  const progress = calculateGoalProgress({
    progressMode: goal.progressMode,
    progress: goal.progress,
    milestones: milestones.map((milestone) => ({ status: milestone.status })),
  });

  return (
    <div className="space-y-6">
      <BackLink label={t.allGoals} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="goal-title" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <h1
                id="goal-title"
                className="text-[26px] leading-tight font-semibold tracking-[-0.03em] text-content text-balance break-words sm:text-[28px]"
              >
                {goal.title}
              </h1>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="neutral">{m.enums.status[goal.status]}</Badge>
                <Badge tone="outline">{m.enums.category[goal.category]}</Badge>
                <Badge tone="outline">{m.enums.priority[goal.priority]}</Badge>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                className="relative after:absolute after:-inset-1 after:content-['']"
                onClick={() => setEditingGoal(true)}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                {t.edit}
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="relative after:absolute after:-inset-1 after:content-['']"
                onClick={() => setDeletingGoal(true)}
                aria-label={tmpl(t.deleteAria, { title: goal.title })}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t.delete}
              </Button>
            </div>
          </div>

          {goal.description ? (
            <p className="max-w-prose text-ui leading-relaxed text-muted break-words">
              {goal.description}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">
                {formatDateRange(goal, tmpl(t.started, { date: goal.startDate }))}
              </span>
            </span>
          </div>
        </section>

        <aside
          aria-labelledby="goal-progress-heading"
          className="min-w-0 lg:col-start-2 lg:row-start-1"
        >
          <Card className="p-5">
            <h2 id="goal-progress-heading" className="text-ui font-medium text-content">
              {m.common.progress}
            </h2>
            <p className="mt-4 text-[32px] leading-none font-semibold tracking-[-0.03em] text-content tabular-nums">
              {tmpl(t.percentComplete, { percent: progress })}
            </p>
            <div className="mt-4">
              <ProgressBar value={progress} label={tmpl(t.progressLabel, { title: goal.title })} />
            </div>
            <p className="mt-2 text-caption text-muted">
              {goal.progressMode === "milestones" ? t.fromMilestones : t.manual}
            </p>

            {goal.progressMode === "manual" ? (
              <button
                type="button"
                className="mt-4 block min-h-11 w-full cursor-pointer text-left text-caption text-muted underline decoration-line underline-offset-4 transition-colors duration-fast ease-standard hover:text-content"
                onClick={() => setEditingGoal(true)}
              >
                {t.switchToMilestones}
              </button>
            ) : null}
          </Card>
        </aside>

        <section
          aria-labelledby="goal-milestones-heading"
          className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2"
        >
          <h2
            id="goal-milestones-heading"
            className="text-heading font-semibold tracking-[-0.01em] text-content"
          >
            {t.milestones}
          </h2>
          {milestonesQuery.isLoading ? (
            <div role="status" aria-label={t.loadingMilestones}>
              <span className="sr-only">{t.loadingMilestones}</span>
              <div
                className="space-y-4 rounded-card border border-line bg-surface p-5"
                aria-hidden="true"
              >
                <div className="h-5 w-2/3 rounded bg-surface-muted" />
                <div className="h-5 w-1/2 rounded bg-surface-muted" />
                <div className="h-5 w-3/5 rounded bg-surface-muted" />
              </div>
            </div>
          ) : milestonesQuery.isError ? (
            <div role="alert" className="rounded-card border border-line bg-surface p-5">
              <p className="text-ui text-content">{t.loadMilestonesError}</p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void milestonesQuery.refetch()}
                >
                  {m.common.retry}
                </Button>
              </div>
            </div>
          ) : (
            <MilestoneList goalId={goal.id} milestones={milestones} />
          )}
        </section>
      </div>

      <GoalFormDialog open={editingGoal} onClose={() => setEditingGoal(false)} goal={goal} />
      <DeleteGoalDialog
        open={deletingGoal}
        onClose={() => setDeletingGoal(false)}
        goal={goal}
        onDeleted={() => navigate("/goals")}
      />
    </div>
  );
}
