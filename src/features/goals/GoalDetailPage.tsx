import { Pencil, Trash2 } from "lucide-react";
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
import type { Goal, GoalStatus } from "@/types/domain";

const STATUS_TONE: Record<GoalStatus, "accent" | "neutral" | "outline"> = {
  active: "accent",
  completed: "neutral",
  not_started: "outline",
  paused: "outline",
  archived: "outline",
};

function formatDateRange(goal: Goal, started: string): string {
  if (goal.targetDate) {
    return `${goal.startDate} – ${goal.targetDate}`;
  }
  return started;
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
        <Link to="/goals" className="text-ui text-muted hover:underline">
          ← {t.allGoals}
        </Link>
        <div role="status" aria-label={t.loadingGoal}>
          <span className="sr-only">{t.loadingGoal}</span>
          <Card>
            <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
              <div className="h-6 w-1/2 rounded bg-surface-muted" />
              <div className="h-5 w-1/3 rounded bg-surface-muted" />
              <div className="h-2 w-full rounded-full bg-surface-muted" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const goal = goalQuery.data ?? null;
  if (goalQuery.isError || !goal) {
    // A missing/deleted goal is a calm empty state; any other failure is a
    // retryable error. Mocks without an `error` object fall back to not_found
    // so the unknown-id case keeps rendering the back link.
    const code =
      goalQuery.error instanceof GoalServiceError ? goalQuery.error.code : "not_found";
    if (code !== "not_found") {
      return (
        <div className="space-y-6">
          <Link to="/goals" className="text-ui text-muted hover:underline">
            ← {t.allGoals}
          </Link>
          <div role="alert" className="rounded-card border border-line bg-surface p-4">
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
        <Link to="/goals" className="text-ui text-muted hover:underline">
          ← {t.allGoals}
        </Link>
        <Card>
          <h1 className="text-heading font-semibold tracking-tight text-content">{t.goalNotFound}</h1>
          <p className="mt-1 text-ui text-muted">
            {t.goalNotFoundHint}
          </p>
          <div className="mt-4">
            <Link
              to="/goals"
              className="inline-flex h-8 items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-ui font-medium text-content transition-[background-color] duration-fast ease-standard hover:bg-surface-muted"
            >
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
      <Link to="/goals" className="text-ui text-muted hover:underline">
        ← {t.allGoals}
      </Link>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-heading font-semibold tracking-tight text-balance text-content break-words sm:text-title">
              {goal.title}
            </h1>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[goal.status]}>{m.enums.status[goal.status]}</Badge>
              <Badge>{m.enums.category[goal.category]}</Badge>
              <Badge tone="outline">{m.enums.priority[goal.priority]}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditingGoal(true)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              {t.edit}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeletingGoal(true)}
              aria-label={tmpl(t.deleteAria, { title: goal.title })}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {t.delete}
            </Button>
          </div>
        </div>

        {goal.description ? <p className="text-ui text-muted break-words">{goal.description}</p> : null}

        <div className="space-y-1">
          <ProgressBar value={progress} label={tmpl(t.progressLabel, { title: goal.title })} />
          <p className="text-micro text-muted tabular-nums">
            {tmpl(t.percentComplete, { percent: progress })}
            {goal.progressMode === "milestones" ? ` · ${t.fromMilestones}` : ` · ${t.manual}`}
          </p>
        </div>

        <p className="text-micro text-muted tabular-nums">
          {formatDateRange(goal, tmpl(t.started, { date: goal.startDate }))}
        </p>

        {goal.progressMode === "manual" ? (
          <p className="text-micro text-muted">
            <button
              type="button"
              className="cursor-pointer underline"
              onClick={() => setEditingGoal(true)}
            >
              {t.switchToMilestones}
            </button>
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-heading font-semibold tracking-tight text-content">{t.milestones}</h2>
        {milestonesQuery.isLoading ? (
          <div role="status" aria-label={t.loadingMilestones}>
            <span className="sr-only">{t.loadingMilestones}</span>
            <Card>
              <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
                <div className="h-5 w-2/3 rounded bg-surface-muted" />
                <div className="h-5 w-1/2 rounded bg-surface-muted" />
              </div>
            </Card>
          </div>
        ) : milestonesQuery.isError ? (
          <div role="alert" className="rounded-card border border-line bg-surface p-4">
            <p className="text-ui text-content">{t.loadMilestonesError}</p>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => void milestonesQuery.refetch()}>
                {m.common.retry}
              </Button>
            </div>
          </div>
        ) : (
          <MilestoneList goalId={goal.id} milestones={milestones} />
        )}
      </section>

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
