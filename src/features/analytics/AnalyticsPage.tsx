import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { WeeklyReview } from "@/features/analytics/WeeklyReview";
import {
  bucketize,
  buildWeeklyReview,
  countCompletionsPerBucket,
  getPeriodRange,
  groupTasksByGoalCategory,
  type AnalyticsPeriod,
} from "@/features/analytics/summary";
import { useGoals } from "@/features/goals/hooks";
import { useHabitsWithStats } from "@/features/habits/hooks";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { useTasks } from "@/features/tasks/hooks";
import { isTaskOverdue, toDateKey } from "@/lib/dates";
import { tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";

const PERIODS: AnalyticsPeriod[] = ["day", "week", "month", "year"];

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-title font-semibold text-content">{title}</h2>
      <div className="mt-3 h-64 text-accent">{children}</div>
    </Card>
  );
}

export function AnalyticsPage() {
  const locale = useLocale();
  const m = useMessages();
  const t = m.analytics;
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const todayKey = toDateKey(new Date(), timeZone);
  const range = useMemo(() => getPeriodRange(period, todayKey), [period, todayKey]);

  const tasksQuery = useTasks();
  const goalsQuery = useGoals();
  const habitsBundle = useHabitsWithStats(range, todayKey);

  const loading =
    tasksQuery.isLoading || goalsQuery.isLoading || habitsBundle.habitsQuery.isLoading;
  const loadError =
    tasksQuery.isError || goalsQuery.isError || habitsBundle.habitsQuery.isError;

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const goals = useMemo(() => goalsQuery.data ?? [], [goalsQuery.data]);

  const buckets = useMemo(
    () => bucketize(range, period === "year" ? "month" : "day"),
    [range, period],
  );
  const completions = useMemo(
    () => countCompletionsPerBucket(tasks, buckets, timeZone),
    [tasks, buckets, timeZone],
  );
  const categories = useMemo(() => {
    const raw = groupTasksByGoalCategory(tasks, goals);
    // DB enums stay untouched; only the display label is localized.
    // Goal-less tasks keep their own visible bucket, never merged.
    return raw.map((entry) => ({
      ...entry,
      category:
        entry.category === "no-goal"
          ? t.noGoal
          : ((m.enums.category as Record<string, string>)[entry.category] ?? entry.category),
    }));
  }, [tasks, goals, m.enums.category, t.noGoal]);

  const completedInPeriod = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === "completed" &&
          task.completedAt &&
          toDateKey(new Date(task.completedAt), timeZone) >= range.from &&
          toDateKey(new Date(task.completedAt), timeZone) <= range.to,
      ).length,
    [tasks, range, timeZone],
  );
  const dueInPeriod = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.dueDate !== null &&
          task.dueDate >= range.from &&
          task.dueDate <= range.to &&
          task.status !== "cancelled",
      ).length,
    [tasks, range],
  );
  const pending = useMemo(
    () => tasks.filter((task) => task.status === "todo" || task.status === "in_progress").length,
    [tasks],
  );
  const now = useMemo(() => new Date(), []);
  const overdue = useMemo(
    () => tasks.filter((task) => isTaskOverdue(task, now, timeZone)).length,
    [tasks, now, timeZone],
  );

  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active"), [goals]);
  const avgGoalProgress = useMemo(
    () =>
      activeGoals.length === 0
        ? null
        : Math.round(activeGoals.reduce((sum, g) => sum + g.progress, 0) / activeGoals.length),
    [activeGoals],
  );

  const habitRates = useMemo(
    () =>
      habitsBundle.rows
        .filter((r) => r.stats.planned > 0)
        .map((r) => ({ name: r.habit.title, rate: r.stats.completionRate ?? 0 })),
    [habitsBundle.rows],
  );
  const plannedHabitRows = useMemo(
    () => habitsBundle.rows.filter((r) => r.stats.planned > 0),
    [habitsBundle.rows],
  );

  const weekFrom = useMemo(() => getPeriodRange("week", todayKey).from, [todayKey]);
  const reviewLines = useMemo(
    () =>
      buildWeeklyReview(
        {
          tasks,
          goals,
          habitRows: habitsBundle.rows,
          weekFrom,
          todayKey,
          timeZone,
        },
        locale,
        m.weeklyReview,
      ),
    [tasks, goals, habitsBundle.rows, weekFrom, todayKey, timeZone, locale, m.weeklyReview],
  );

  const refetchAll = (): void => {
    void tasksQuery.refetch();
    void goalsQuery.refetch();
    void habitsBundle.habitsQuery.refetch();
  };

  const periodLabel = (p: AnalyticsPeriod): string =>
    p === "day" ? t.periodDay : p === "week" ? t.periodWeek : p === "month" ? t.periodMonth : t.periodYear;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <div className="flex flex-wrap gap-2" role="group" aria-label={t.periodLabel}>
        {PERIODS.map((p) => (
          <Button
            key={p}
            variant={p === period ? "primary" : "secondary"}
            size="sm"
            onClick={() => setPeriod(p)}
            aria-pressed={p === period}
          >
            {periodLabel(p)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div role="status" aria-label={t.loadingLabel}>
          <span className="sr-only">{t.loadingLabel}</span>
          <Card>
            <div className="animate-pulse space-y-2" aria-hidden="true">
              <div className="h-4 w-1/3 rounded bg-surface-muted" />
              <div className="h-40 rounded bg-surface-muted" />
            </div>
          </Card>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-card border border-line bg-surface p-4">
          <p className="text-ui text-content">{t.errorText}</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={refetchAll}>
              {m.common.retry}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <h2 className="text-title font-semibold text-content">{t.tasksTitle}</h2>
              {tasks.length === 0 ? (
                <p className="text-ui text-muted mt-2">{t.emptyTasks}</p>
              ) : (
                <dl className="mt-2 space-y-1 text-ui tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.completedInPeriod}</dt>
                    <dd className="text-content">
                      {tmpl(t.completedOfDue, { completed: completedInPeriod, due: dueInPeriod })}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.pendingNow}</dt>
                    <dd className="text-content">{pending}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.overdueNow}</dt>
                    <dd className="text-content">{overdue}</dd>
                  </div>
                </dl>
              )}
            </Card>

            <Card>
              <h2 className="text-title font-semibold text-content">{t.goalsTitle}</h2>
              {goals.length === 0 ? (
                <p className="text-ui text-muted mt-2">{t.emptyGoals}</p>
              ) : (
                <dl className="mt-2 space-y-1 text-ui tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.activeGoals}</dt>
                    <dd className="text-content">{activeGoals.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.averageProgress}</dt>
                    <dd className="text-content">
                      {avgGoalProgress === null ? t.noActiveGoals : `${avgGoalProgress}%`}
                    </dd>
                  </div>
                </dl>
              )}
            </Card>

            <Card>
              <h2 className="text-title font-semibold text-content">{t.habitsTitle}</h2>
              {plannedHabitRows.length === 0 ? (
                <p className="text-ui text-muted mt-2">{t.emptyHabits}</p>
              ) : (
                <dl className="mt-2 space-y-1 text-ui tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.habitsWithObligations}</dt>
                    <dd className="text-content">{plannedHabitRows.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted">{t.unitsDoneLabel}</dt>
                    <dd className="text-content">
                      {tmpl(t.unitsDone, {
                        done: plannedHabitRows.reduce((s, r) => s + r.stats.completed, 0),
                        planned: plannedHabitRows.reduce((s, r) => s + r.stats.planned, 0),
                      })}
                    </dd>
                  </div>
                </dl>
              )}
            </Card>
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={t.noDataTitle}
              description={t.noDataHint}
            />
          ) : completions.every((c) => c.completed === 0) ? (
            <Card>
              <h2 className="text-title font-semibold text-content">{t.completionsTitle}</h2>
              <p className="text-ui text-muted mt-2">{t.emptyCompletions}</p>
            </Card>
          ) : (
            <ChartShell title={t.completionsTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completions}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="completed" fill="currentColor" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          )}

          {categories.length > 0 ? (
            <ChartShell title={t.categoriesTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="currentColor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          ) : null}

          {activeGoals.length > 0 ? (
            <ChartShell title={t.goalsProgressTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeGoals.map((g) => ({ name: g.title, progress: g.progress }))}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="progress" fill="currentColor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          ) : null}

          {habitRates.length > 0 ? (
            <ChartShell title={t.habitsCompletionTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={habitRates} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.2} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="rate" fill="currentColor" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          ) : null}

          <WeeklyReview lines={reviewLines} />
        </>
      )}
    </div>
  );
}
