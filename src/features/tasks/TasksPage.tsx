import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useGoals, useAllMilestones } from "@/features/goals/hooks";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { DeleteTaskDialog } from "@/features/tasks/components/DeleteTaskDialog";
import { RescheduleTaskDialog } from "@/features/tasks/components/RescheduleTaskDialog";
import { TaskFormDialog } from "@/features/tasks/components/TaskFormDialog";
import { TaskRow } from "@/features/tasks/components/TaskRow";
import { TasksFilters } from "@/features/tasks/components/TasksFilters";
import { TASK_LIST_LIMIT } from "@/features/tasks/api";
import { useTasks } from "@/features/tasks/hooks";
import type { TaskFilters } from "@/features/tasks/api";
import type { Task } from "@/types/domain";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";

function hasActiveFilters(filters: TaskFilters): boolean {
  return Boolean(filters.status ?? filters.priority ?? filters.goalId ?? filters.search);
}

function TaskRowSkeleton() {
  return (
    <li className="px-4 py-3" aria-hidden="true">
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-2/3 rounded bg-surface-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-surface-muted" />
          <div className="h-4 w-24 rounded bg-surface-muted" />
        </div>
      </div>
    </li>
  );
}

export function TasksPage() {
  const m = useMessages();
  const t = m.tasks;
  const locale = useLocale();
  const [filters, setFilters] = useState<TaskFilters>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [rescheduling, setRescheduling] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const tasksQuery = useTasks(filters);
  const goalsQuery = useGoals();
  // One milestones fetch for every row (grouped by id on the client):
  // task rows never fire per-goal `useMilestones` (no N+1).
  const allMilestonesQuery = useAllMilestones();
  // The profile key is reused as-is (no third key): overdue is derived from
  // the due date in the profile's time zone, never stored.
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";

  const goalTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const goal of goalsQuery.data ?? []) {
      map.set(goal.id, goal.title);
    }
    return map;
  }, [goalsQuery.data]);

  const milestoneTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const milestone of allMilestonesQuery.data ?? []) {
      map.set(milestone.id, milestone.title);
    }
    return map;
  }, [allMilestonesQuery.data]);

  const tasks = tasksQuery.data ?? [];
  const filtering = hasActiveFilters(filters);
  const atLimit = tasks.length === TASK_LIST_LIMIT;

  const taskCountLabel = (count: number): string => {
    const cat = pluralCategory(locale, count);
    const tpl = cat === "one" ? t.tasksCountOne : cat === "few" ? t.tasksCountFew : t.tasksCountMany;
    return tmpl(tpl, { count });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t.newTask}
          </Button>
        }
      />

      <TasksFilters filters={filters} goals={goalsQuery.data ?? []} onChange={setFilters} />

      <p className="text-ui text-muted tabular-nums" aria-live="polite">
        {tasksQuery.isLoading
          ? t.loading
          : `${taskCountLabel(tasks.length)}${atLimit ? ` · ${tmpl(t.showingFirst, { limit: TASK_LIST_LIMIT })}` : ""}`}
      </p>

      {tasksQuery.isLoading ? (
        <div role="status" aria-label={t.loading}>
          <span className="sr-only">{t.loading}</span>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              <TaskRowSkeleton />
              <TaskRowSkeleton />
              <TaskRowSkeleton />
            </ul>
          </Card>
        </div>
      ) : tasksQuery.isError ? (
        <div role="alert" className="rounded-card border border-line bg-surface p-4">
          <p className="text-ui text-content">{t.loadError}</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => void tasksQuery.refetch()}>
              {m.common.retry}
            </Button>
          </div>
        </div>
      ) : tasks.length === 0 && !filtering ? (
        <EmptyState
          icon={ListChecks}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {t.createFirst}
            </Button>
          }
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t.noMatchTitle}
          description={t.noMatchDescription}
          action={
            <Button variant="secondary" onClick={() => setFilters({})}>
              {t.clearFilters}
            </Button>
          }
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                timeZone={timeZone}
                goalTitle={task.goalId ? (goalTitleById.get(task.goalId) ?? null) : null}
                milestoneTitle={
                  task.milestoneId ? (milestoneTitleById.get(task.milestoneId) ?? null) : null
                }
                onEdit={setEditing}
                onReschedule={setRescheduling}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        </Card>
      )}

      <TaskFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        task={null}
        timeZone={timeZone}
      />
      <TaskFormDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        task={editing}
        timeZone={timeZone}
      />
      <RescheduleTaskDialog
        open={rescheduling !== null}
        onClose={() => setRescheduling(null)}
        task={rescheduling}
      />
      <DeleteTaskDialog open={deleting !== null} onClose={() => setDeleting(null)} task={deleting} />
    </div>
  );
}
