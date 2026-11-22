import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Minus } from "lucide-react";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  getPreviousPeriodRange,
  groupTasksByGoalCategory,
  type AnalyticsPeriod,
} from "@/features/analytics/summary";
import { useGoals } from "@/features/goals/hooks";
import { useHabitsWithStats } from "@/features/habits/hooks";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { useTasks } from "@/features/tasks/hooks";
import { isTaskOverdue, toDateKey } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages } from "@/lib/i18n/I18nContext";

const PERIODS: AnalyticsPeriod[] = ["day", "week", "month", "year"];
const AXIS_TICK = { fill: "var(--color-muted)", fontSize: 12 };
const GRID_STROKE = "var(--color-line)";
const SERIES_FILL = "var(--color-accent)";
const TOOLTIP_STYLE = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 10,
  color: "var(--color-content)",
  fontSize: 12,
};
const TOOLTIP_LABEL_STYLE = { color: "var(--color-muted)" };
const TOOLTIP_CURSOR = { fill: "var(--color-surface-muted)", opacity: 0.55 };

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-[15px] font-medium text-content">{title}</h2>
      <div className="mt-4 h-64 min-w-0">{children}</div>
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
  const previousRange = useMemo(() => getPreviousPeriodRange(period, range), [period, range]);
  const tasksQuery = useTasks();
  const goalsQuery = useGoals();
  const habitsBundle = useHabitsWithStats(range, todayKey);

  const loading =
    tasksQuery.isLoading || goalsQuery.isLoading || habitsBundle.habitsQuery.isLoading;
  const loadError = tasksQuery.isError || goalsQuery.isError || habitsBundle.habitsQuery.isError;

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
  const previousCompleted = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.status === "completed" &&
          task.completedAt &&
          toDateKey(new Date(task.completedAt), timeZone) >= previousRange.from &&
          toDateKey(new Date(task.completedAt), timeZone) <= previousRange.to,
      ).length,
    [tasks, previousRange, timeZone],
  );
  const previousDue = useMemo(
    () =>
      tasks.filter(
        (task) =>
          task.dueDate !== null &&
          task.dueDate >= previousRange.from &&
          task.dueDate <= previousRange.to &&
          task.status !== "cancelled",
      ).length,
    [tasks, previousRange],
  );
  const currentRate =
    dueInPeriod === 0 ? null : Math.round((completedInPeriod / dueInPeriod) * 100);
  const previousRate =
    previousDue === 0 ? null : Math.round((previousCompleted / previousDue) * 100);
  const rateDelta =
    currentRate !== null && previousRate !== null ? currentRate - previousRate : null;
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
    p === "day"
      ? t.periodDay
      : p === "week"
        ? t.periodWeek
        : p === "month"
          ? t.periodMonth
          : t.periodYear;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <div
        className="inline-flex w-full flex-wrap gap-1 rounded-control bg-surface-muted p-1 sm:w-auto sm:flex-nowrap"
        role="group"
        aria-label={t.periodLabel}
      >
        {PERIODS.map((p) => (
          <Button
            key={p}
            variant="ghost"
            size="sm"
            className={cn(
              "min-h-11 flex-1 whitespace-nowrap rounded-control px-3 sm:min-h-9 sm:flex-none",
              p === period
                ? "bg-surface font-medium text-content hover:bg-surface hover:text-content"
                : "text-muted hover:bg-surface hover:text-content",
            )}
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
            <div className="space-y-4" aria-hidden="true">
              <div className="h-4 w-1/3 rounded bg-surface-muted" />
              <div className="h-40 rounded bg-surface-muted" />
            </div>
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
      ) : (
        <>
          <Card className="p-0">
            <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <h2 className="text-[15px] font-medium text-content">{t.tasksTitle}</h2>
                {tasks.length === 0 ? (
                  <p className="mt-3 text-ui text-muted">{t.emptyTasks}</p>
                ) : (
                  <>
                    <p className="mt-4 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-content tabular-nums">
                      {tmpl(t.completedOfDue, { completed: completedInPeriod, due: dueInPeriod })}
                    </p>
                    <p className="mt-2 text-caption text-muted">{t.completedInPeriod}</p>
                    {rateDelta === null ? (
                      <p className="mt-1 text-caption text-muted">{t.noPrevious}</p>
                    ) : (
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-caption tabular-nums",
                          rateDelta > 0
                            ? "text-success"
                            : rateDelta < 0
                              ? "text-danger"
                              : "text-muted",
                        )}
                      >
                        {rateDelta > 0 ? (
                          <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        ) : rateDelta < 0 ? (
                          <ArrowDownRight className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Minus className="size-3.5" aria-hidden="true" />
                        )}
                        {rateDelta === 0
                          ? t.vsPreviousFlat
                          : tmpl(t.vsPrevious, { delta: Math.abs(rateDelta) })}
                      </p>
                    )}
                    <dl className="mt-5 space-y-2 text-caption tabular-nums">
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted">{t.pendingNow}</dt>
                        <dd className="shrink-0 text-right text-content">{pending}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted">{t.overdueNow}</dt>
                        <dd
                          className={cn(
                            "shrink-0 text-right",
                            overdue > 0 ? "text-danger" : "text-content",
                          )}
                        >
                          {overdue}
                        </dd>
                      </div>
                    </dl>
                    {overdue > 0 ? (
                      <Link
                        to="/tasks"
                        className="mt-3 inline-flex items-center gap-1 text-caption text-content underline-offset-4 hover:underline"
                      >
                        {t.reviewOverdue}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </>
                )}
              </div>

              <div className="p-5">
                <h2 className="text-[15px] font-medium text-content">{t.goalsTitle}</h2>
                {goals.length === 0 ? (
                  <p className="mt-3 text-ui text-muted">{t.emptyGoals}</p>
                ) : (
                  <>
                    <p
                      className={cn(
                        "mt-4 text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums",
                        avgGoalProgress === null ? "text-muted" : "text-accent",
                      )}
                    >
                      {avgGoalProgress === null ? "—" : `${avgGoalProgress}%`}
                    </p>
                    <p className="mt-2 text-caption text-muted">{t.averageProgress}</p>
                    <dl className="mt-5 space-y-2 text-caption tabular-nums">
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted">{t.activeGoals}</dt>
                        <dd className="shrink-0 text-right text-content">{activeGoals.length}</dd>
                      </div>
                    </dl>
                    {avgGoalProgress === null ? (
                      <p className="mt-3 text-caption text-muted">{t.noActiveGoals}</p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="p-5">
                <h2 className="text-[15px] font-medium text-content">{t.habitsTitle}</h2>
                {plannedHabitRows.length === 0 ? (
                  <p className="mt-3 text-ui text-muted">{t.emptyHabits}</p>
                ) : (
                  <>
                    <p className="mt-4 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-content tabular-nums">
                      {tmpl(t.unitsDone, {
                        done: plannedHabitRows.reduce((s, r) => s + r.stats.completed, 0),
                        planned: plannedHabitRows.reduce((s, r) => s + r.stats.planned, 0),
                      })}
                    </p>
                    <p className="mt-2 text-caption text-muted">{t.unitsDoneLabel}</p>
                    <dl className="mt-5 space-y-2 text-caption tabular-nums">
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted">{t.habitsWithObligations}</dt>
                        <dd className="shrink-0 text-right text-content">
                          {plannedHabitRows.length}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
            </div>
          </Card>

          {tasks.length === 0 ? (
            <EmptyState icon={BarChart3} title={t.noDataTitle} description={t.noDataHint} />
          ) : completions.every((c) => c.completed === 0) ? (
            <Card>
              <h2 className="text-[15px] font-medium text-content">{t.completionsTitle}</h2>
              <p className="mt-3 text-ui text-muted">{t.emptyCompletions}</p>
            </Card>
          ) : (
            <ChartShell title={t.completionsTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completions}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "var(--color-content)" }}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    cursor={TOOLTIP_CURSOR}
                  />
                  <Bar
                    dataKey="completed"
                    fill={SERIES_FILL}
                    maxBarSize={24}
                    radius={[4, 4, 0, 0]}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          )}

          {categories.length > 0 ? (
            <ChartShell title={t.categoriesTitle}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={AXIS_TICK}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "var(--color-content)" }}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    cursor={TOOLTIP_CURSOR}
                  />
                  <Bar
                    dataKey="count"
                    fill={SERIES_FILL}
                    maxBarSize={24}
                    radius={[0, 4, 4, 0]}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
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
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
                    width={120}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: "var(--color-content)" }}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    cursor={TOOLTIP_CURSOR}
                  />
                  <Bar
                    dataKey="progress"
                    fill={SERIES_FILL}
                    maxBarSize={24}
                    radius={[0, 4, 4, 0]}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          ) : null}

          {habitRates.length > 0 ? (
            habitRates.every((habit) => habit.rate === 0) ? (
              <Card>
                <h2 className="text-[15px] font-medium text-content">{t.habitsCompletionTitle}</h2>
                <p className="mt-2 text-ui text-muted text-pretty">{t.emptyCompletions}</p>
              </Card>
            ) : (
              <ChartShell title={t.habitsCompletionTitle}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={habitRates} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={AXIS_TICK}
                      width={120}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={{ color: "var(--color-content)" }}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      cursor={TOOLTIP_CURSOR}
                    />
                    <Bar
                      dataKey="rate"
                      fill={SERIES_FILL}
                      maxBarSize={24}
                      radius={[0, 4, 4, 0]}
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartShell>
            )
          ) : null}

          <WeeklyReview lines={reviewLines} />
        </>
      )}
    </div>
  );
}
