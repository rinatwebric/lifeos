import { Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";

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
import type { Goal, MilestoneStatus } from "@/types/domain";

function hasActiveFilters(filters: GoalFilterQuery): boolean {
  return Boolean(filters.status ?? filters.category ?? filters.priority ?? filters.search);
}

function GoalCardSkeleton() {
  return (
    <Card>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-5 w-2/3 rounded bg-surface-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-surface-muted" />
          <div className="h-5 w-24 rounded-full bg-surface-muted" />
        </div>
        <div className="h-2 w-full rounded-full bg-surface-muted" />
        <div className="h-4 w-1/3 rounded bg-surface-muted" />
      </div>
    </Card>
  );
}

export function GoalsPage() {
  const [filters, setFilters] = useState<GoalFilterQuery>({});
  const [creating, setCreating] = useState(false);
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
        title="Goals"
        description="Long-term outcomes, broken into milestones you can actually execute."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New goal
          </Button>
        }
      />

      <GoalsFilters filters={filters} onChange={setFilters} />

      {goalsQuery.isLoading ? (
        <div role="status" aria-label="Loading goals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">Loading goals…</span>
          <GoalCardSkeleton />
          <GoalCardSkeleton />
          <GoalCardSkeleton />
        </div>
      ) : goalsQuery.isError ? (
        <div role="alert" className="rounded-card border border-line bg-surface p-4">
          <p className="text-ui text-content">Could not load goals. Please try again.</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => void goalsQuery.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : goals.length === 0 && !filtering ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Create your first goal to turn a long-term outcome into actionable milestones and tasks."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Create your first goal
            </Button>
          }
        />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals match these filters"
          description="Try adjusting the filters, or clear them to see all goals."
          action={
            <Button variant="secondary" onClick={() => setFilters({})}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      <GoalFormDialog open={creating} onClose={() => setCreating(false)} goal={null} />
      <GoalFormDialog open={editing !== null} onClose={() => setEditing(null)} goal={editing} />
      <DeleteGoalDialog open={deleting !== null} onClose={() => setDeleting(null)} goal={deleting} />
    </div>
  );
}
