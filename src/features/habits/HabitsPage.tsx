import { useQuery } from "@tanstack/react-query";
import { Plus, Repeat2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeleteHabitDialog } from "@/features/habits/components/DeleteHabitDialog";
import { HabitFormDialog } from "@/features/habits/components/HabitFormDialog";
import { HabitRow } from "@/features/habits/components/HabitRow";
import { LogHabitDialog } from "@/features/habits/components/LogHabitDialog";
import { useHabitsWithStats, useSetHabitStatus } from "@/features/habits/hooks";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { toDateKey } from "@/lib/dates";
import type { Habit } from "@/types/domain";

const HABITS_COPY = {
  title: "Habits",
  description: "Small recurring actions, tracked without punishment for missed days.",
  newHabit: "New habit",
  createFirst: "Create your first habit",
  emptyTitle: "No habits yet",
  emptyDescription: "Small actions, repeated often, beat occasional big efforts. Create your first habit to start your streak.",
  loadingLabel: "Loading habits",
  loadingText: "Loading habits…",
  errorText: "Could not load habits. Please try again.",
  retry: "Retry",
} as const;

/**
 * Lifetime stats need the whole log history, not a sliding window —
 * otherwise old misses would vanish from the rate. The lower bound is a
 * fixed early date; the paginated range reads never silently truncate.
 */
const HISTORY_SINCE = "2020-01-01";

function HabitRowSkeleton() {
  return (
    <li className="px-4 py-3" aria-hidden="true">
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-2/3 rounded bg-surface-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-24 rounded-full bg-surface-muted" />
          <div className="h-4 w-20 rounded bg-surface-muted" />
        </div>
      </div>
    </li>
  );
}

export function HabitsPage() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [logging, setLogging] = useState<Habit | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);

  const setStatus = useSetHabitStatus();

  // The profile key is reused as-is: "today" is derived in the profile's
  // time zone, never the browser's.
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const todayKey = toDateKey(new Date(), timeZone);

  const range = useMemo(() => ({ from: HISTORY_SINCE, to: todayKey }), [todayKey]);
  const { habitsQuery, logsQuery, versionsQuery, rows } = useHabitsWithStats(range);

  const loading = habitsQuery.isLoading || logsQuery.isLoading || versionsQuery.isLoading;
  const loadError = habitsQuery.isError || logsQuery.isError || versionsQuery.isError;

  const loggedDaysByHabit = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of logsQuery.data ?? []) {
      map.set(entry.habitId, (map.get(entry.habitId) ?? 0) + 1);
    }
    return map;
  }, [logsQuery.data]);

  const refetchAll = (): void => {
    void habitsQuery.refetch();
    void logsQuery.refetch();
    void versionsQuery.refetch();
  };

  const handleTogglePause = (habit: Habit): void => {
    if (setStatus.isPending) {
      return;
    }
    const next = habit.status === "active" ? "paused" : "active";
    setStatus.mutate({ id: habit.id, status: next });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={HABITS_COPY.title}
        description={HABITS_COPY.description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {HABITS_COPY.newHabit}
          </Button>
        }
      />

      <p className="text-ui text-muted tabular-nums" aria-live="polite">
        {loading
          ? HABITS_COPY.loadingText
          : `${rows.length} ${rows.length === 1 ? "habit" : "habits"}`}
      </p>

      {loading ? (
        <div role="status" aria-label={HABITS_COPY.loadingLabel}>
          <span className="sr-only">{HABITS_COPY.loadingText}</span>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              <HabitRowSkeleton />
              <HabitRowSkeleton />
              <HabitRowSkeleton />
            </ul>
          </Card>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-card border border-line bg-surface p-4">
          <p className="text-ui text-content">{HABITS_COPY.errorText}</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={refetchAll}>
              {HABITS_COPY.retry}
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title={HABITS_COPY.emptyTitle}
          description={HABITS_COPY.emptyDescription}
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {HABITS_COPY.createFirst}
            </Button>
          }
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {rows.map(({ habit, stats }) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                stats={stats}
                onLog={setLogging}
                onEdit={setEditing}
                onTogglePause={handleTogglePause}
                onDelete={setDeleting}
              />
            ))}
          </ul>
        </Card>
      )}

      {setStatus.isError ? (
        <p role="alert" className="text-micro text-danger">
          Could not change the habit status. Please try again.
        </p>
      ) : null}

      <HabitFormDialog open={creating} onClose={() => setCreating(false)} habit={null} />
      <HabitFormDialog open={editing !== null} onClose={() => setEditing(null)} habit={editing} />
      <LogHabitDialog
        open={logging !== null}
        onClose={() => setLogging(null)}
        habit={logging}
        todayKey={todayKey}
      />
      <DeleteHabitDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        habit={deleting}
        loggedDays={deleting ? (loggedDaysByHabit.get(deleting.id) ?? 0) : 0}
      />
    </div>
  );
}
