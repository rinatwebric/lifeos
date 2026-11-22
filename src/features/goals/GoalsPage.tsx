import { Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeleteGoalDialog } from "@/features/goals/components/DeleteGoalDialog";
import { GoalCard } from "@/features/goals/components/GoalCard";
import { GoalFormDialog } from "@/features/goals/components/GoalFormDialog";
import { GoalsFilters } from "@/features/goals/components/GoalsFilters";
import type { GoalFilters as GoalFilterQuery } from "@/features/goals/api";
import { useAllMilestones, useGoals } from "@/features/goals/hooks";
import { calculateGoalProgress } from "@/lib/progress";
import { useMessages } from "@/lib/i18n/I18nContext";
import type { Goal, MilestoneStatus } from "@/types/domain";

const GOAL_GRID_CLASS = "grid gap-4 lg:grid-cols-2 xl:grid-cols-3";

function hasActiveFilters(filters: GoalFilterQuery): boolean {
  return Boolean(filters.status ?? filters.category ?? filters.priority ?? filters.search);
}

function GoalCardSkeleton() {
  return (
    <Card className="flex h-full flex-col p-0">
      <div className="flex flex-1 flex-col gap-4 p-5" aria-hidden="true">
        <div className="flex items-start justify-between gap-3">
          <div className="h-5 w-3/5 rounded bg-surface-muted" />
          <div className="h-5 w-16 rounded-full bg-surface-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-surface-muted" />
          <div className="h-3 w-4/5 rounded bg-surface-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-2/5 rounded bg-surface-muted" />
          <div className="h-1 w-full rounded-full bg-surface-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-8 rounded bg-surface-muted" />
          <div className="h-8 rounded bg-surface-muted" />
        </div>
        <div className="mt-auto h-3 w-1/3 rounded bg-surface-muted" />
      </div>
      <div className="border-t border-line px-4 py-3">
        <div className="h-8 w-40 rounded-full bg-surface-muted" aria-hidden="true" />
      </div>
    </Card>
  );
}

export function GoalsPage() {
  const m = useMessages();
  const t = m.goals;
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<GoalFilterQuery>({});
  const [creating, setCreating] = useState(false);
  const isCreating = creating || searchParams.get("new") === "1";

  const closeCreate = (): void => {
    setCreating(false);
    if (searchParams.has("new")) {
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
  };
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  const goalsQuery = useGoals(filters);
  const milestonesQuery = useAllMilestones();

  const slicesByGoal = useMemo(() => {
    const grouped = new Map<string, MilestoneStatus[]>();
    for (const slice of milestonesQuery.data ?? []) {
      const list = grouped.get(slice.goalId) ?? [];
      list.push(slice.status);
      grouped.set(slice.goalId, list);
    }
    return grouped;
  }, [milestonesQuery.data]);

  const progressFor = (goal: Goal): number =>
    calculateGoalProgress({
      progressMode: goal.progressMode,
      progress: goal.progress,
      milestones: (slicesByGoal.get(goal.id) ?? []).map((status) => ({ status })),
    }) ?? goal.progress;

  const goals = goalsQuery.data ?? [];
  const filtering = hasActiveFilters(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button onClick={() => setCreating(true)} className="min-h-11 sm:min-h-0">
            <Plus className="size-4" aria-hidden="true" />
            {t.newGoal}
          </Button>
        }
      />

      <GoalsFilters filters={filters} onChange={setFilters} />

      {goalsQuery.isLoading ? (
        <div role="status" aria-label={t.loading} className={GOAL_GRID_CLASS}>
          <span className="sr-only">{t.loading}</span>
          <GoalCardSkeleton />
          <GoalCardSkeleton />
          <GoalCardSkeleton />
        </div>
      ) : goalsQuery.isError ? (
        <div role="alert" className="rounded-card border border-line bg-surface p-5">
          <p className="text-ui text-content">{t.loadError}</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => void goalsQuery.refetch()}>
              {m.common.retry}
            </Button>
          </div>
        </div>
      ) : goals.length === 0 && !filtering ? (
        <EmptyState
          icon={Target}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Button
              variant="secondary"
              onClick={() => setCreating(true)}
              className="min-h-11 sm:min-h-0"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t.createFirst}
            </Button>
          }
        />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t.noMatchTitle}
          description={t.noMatchDescription}
          action={
            <Button
              variant="secondary"
              onClick={() => setFilters({})}
              className="min-h-11 sm:min-h-0"
            >
              {t.clearFilters}
            </Button>
          }
        />
      ) : (
        <div className={GOAL_GRID_CLASS}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={progressFor(goal)}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <GoalFormDialog open={isCreating} onClose={closeCreate} goal={null} />
      <GoalFormDialog open={editing !== null} onClose={() => setEditing(null)} goal={editing} />
      <DeleteGoalDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        goal={deleting}
      />
    </div>
  );
}
