import { useQuery } from "@tanstack/react-query";
import { Plus, Repeat2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { Habit } from "@/types/domain";

/**
 * Lifetime stats need the whole log history, not a sliding window —
 * otherwise old misses would vanish from the rate. The lower bound is a
 * fixed early date; the paginated range reads never silently truncate.
 */
const HISTORY_SINCE = "2020-01-01";

function HabitRowSkeleton() {
  return (
    <li className="px-5 py-4" aria-hidden="true">
      <div className="space-y-3">
        <div className="h-4 w-2/3 max-w-56 rounded bg-surface-muted" />
        <div className="h-3 w-40 rounded bg-surface-muted" />
        <div className="flex gap-5 pt-1">
          <div className="h-3 w-28 rounded bg-surface-muted" />
          <div className="h-3 w-24 rounded bg-surface-muted" />
        </div>
      </div>
    </li>
  );
}

export function HabitsPage() {
  const locale = useLocale();
  const m = useMessages();
  const t = m.habits;
  const [searchParams, setSearchParams] = useSearchParams();
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

  const countCat = pluralCategory(locale, rows.length);
  const countLabel = tmpl(
    countCat === "one" ? t.countOne : countCat === "few" ? t.countFew : t.countMany,
    { count: rows.length },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button size="lg" className="min-h-11" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t.newHabit}
          </Button>
        }
      />

      <p className="text-caption text-muted tabular-nums" aria-live="polite">
        {loading ? t.loadingText : countLabel}
      </p>

      {loading ? (
        <div role="status" aria-label={t.loadingLabel}>
          <span className="sr-only">{t.loadingText}</span>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              <HabitRowSkeleton />
              <HabitRowSkeleton />
              <HabitRowSkeleton />
            </ul>
          </Card>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-card border border-line bg-surface p-5">
          <p className="text-ui text-content">{t.errorText}</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" className="min-h-11" onClick={refetchAll}>
              {m.common.retry}
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title={t.emptyTitle}
          description={t.emptyDescription}
          action={
            <Button
              variant="secondary"
              size="lg"
              className="min-h-11"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t.createFirst}
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
        <p role="alert" className="text-caption text-danger">
          {t.statusError}
        </p>
      ) : null}

      <HabitFormDialog open={isCreating} onClose={closeCreate} habit={null} />
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
