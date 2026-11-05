import { ListChecks, Target } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { ScheduleBody } from "@/features/dashboard/ScheduleCard";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { formatLongDate } from "@/lib/dates";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useIntlLocale, useLocale, useMessages } from "@/lib/i18n/I18nContext";
import { en } from "@/lib/i18n/dictionaries/en";
import { cn } from "@/lib/cn";
import type { Task } from "@/types/domain";

const PRIMARY_ACTION_CLASS =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-accent px-5 text-ui font-medium text-accent-content transition-opacity duration-fast ease-standard hover:opacity-90";

const SECTION_LINK_CLASS =
  "inline-flex min-h-11 items-center text-ui font-medium text-content underline-offset-4 hover:underline";

const PANEL_LIST_CLASS = "divide-y divide-line overflow-hidden rounded-card border border-line bg-surface";

export const DASHBOARD_COPY = {
  emptyInsights: en.dashboard.emptyInsights,
} as const;

function BlockSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-5 w-2/3 rounded bg-surface-muted" />
        <div className="h-2 w-full rounded-full bg-surface-muted" />
        <div className="h-4 w-1/3 rounded bg-surface-muted" />
      </div>
    </div>
  );
}

function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const m = useMessages();

  return (
    <div role="alert" className="rounded-control border border-line bg-surface p-4">
      <p className="text-ui text-content">{message}</p>
      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {m.common.retry}
        </Button>
      </div>
    </div>
  );
}

function formatTaskTime(task: Task, timeZone: string, intl: string): string | null {
  if (task.scheduledStart) {
    const date = new Date(task.scheduledStart);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(intl, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }
  }
  return task.dueDate;
}

function DashboardTaskRow({
  task,
  timeZone,
  goalTitle,
}: {
  task: Task;
  timeZone: string;
  goalTitle: string | null;
}) {
  const m = useMessages();
  const t = m.dashboard;
  const intl = useIntlLocale();
  const setStatus = useSetTaskStatus();
  const completed = task.status === "completed";
  const showPriorityBadge = task.priority === "high" || task.priority === "critical";

  const handleToggle = (): void => {
    if (setStatus.isPending) return;
    setStatus.mutate({ id: task.id, status: completed ? "todo" : "completed" });
  };

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", completed && "opacity-70")}>
      <label
        htmlFor={`dashboard-task-${task.id}`}
        className="-m-3.5 inline-flex shrink-0 cursor-pointer p-3.5"
      >
        <input
          id={`dashboard-task-${task.id}`}
          type="checkbox"
          checked={completed}
          onChange={handleToggle}
          aria-label={
            completed
              ? tmpl(t.markIncomplete, { title: task.title })
              : tmpl(t.markComplete, { title: task.title })
          }
          className="mt-0.5 size-4 shrink-0 accent-current"
        />
      </label>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p
          className={
            completed
              ? "truncate text-ui text-muted line-through"
              : "truncate text-ui font-medium text-content"
          }
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {showPriorityBadge ? (
            <Badge tone="outline">
              {tmpl(t.priorityBadge, { priority: m.enums.priority[task.priority] })}
            </Badge>
          ) : null}
          {formatTaskTime(task, timeZone, intl) ? (
            <span className="text-micro text-muted tabular-nums">
              {formatTaskTime(task, timeZone, intl)}
            </span>
          ) : null}
          <span className="text-micro text-muted">{m.enums.status[task.status]}</span>
          {task.goalId && goalTitle ? (
            <Link
              to={`/goals/${task.goalId}`}
              className="text-micro font-medium text-accent hover:underline"
            >
              {goalTitle}
            </Link>
          ) : null}
        </div>
        {setStatus.isError ? (
          <p role="alert" className="text-micro text-danger">
            {t.updateStatusError}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function DashboardPage() {
  const m = useMessages();
  const t = m.dashboard;
  const locale = useLocale();
  const intl = useIntlLocale();
  const data = useDashboardData();
  const {
    now,
    timeZone,
    displayName,
    todayQuery,
    overdueQuery,
    goalsQuery,
    milestonesQuery,
    todayTasks,
    completedToday,
    totalToday,
    dailyProgress,
    activeGoals,
    insights,
    goalTitleById,
  } = data;

  const welcome = displayName ? tmpl(t.welcomeWithName, { name: displayName }) : t.welcomeBack;
  const goalsLoading = goalsQuery.isLoading || milestonesQuery.isLoading;
  const goalsError = goalsQuery.isError || milestonesQuery.isError;
  const insightsLoading =
    todayQuery.isLoading || overdueQuery.isLoading || goalsQuery.isLoading || milestonesQuery.isLoading;

  const retryGoals = (): void => {
    if (goalsQuery.isError) void goalsQuery.refetch();
    if (milestonesQuery.isError) void milestonesQuery.refetch();
  };

  const milestonesText = (remaining: number, total: number): string => {
    const cat = pluralCategory(locale, remaining);
    const tpl =
      cat === "one"
        ? t.milestonesRemainingOne
        : cat === "few"
          ? t.milestonesRemainingFew
          : t.milestonesRemainingMany;
    return tmpl(tpl, { remaining, total });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatLongDate(now, timeZone, intl)}
        title={welcome}
        titleClassName="font-display text-3xl font-medium sm:text-4xl"
        description={tmpl(t.timesShownIn, { timeZone })}
        actions={
          <Link to="/planner" className={PRIMARY_ACTION_CLASS}>
            {t.planToday}
          </Link>
        }
      />

      <section
        aria-label={t.todayGlance}
        className="grid gap-6 rounded-card border border-line bg-surface p-5 sm:p-6 md:grid-cols-3 md:divide-x md:divide-line md:[&>*:not(:first-child)]:pl-6"
      >
        <div className="space-y-3">
          <h2 className="text-ui font-medium text-content">{t.overviewProgress}</h2>
          {todayQuery.isLoading ? (
            <BlockSkeleton label={t.loadingTodayProgress} />
          ) : todayQuery.isError ? (
            <BlockError message={t.loadTodayError} onRetry={() => void todayQuery.refetch()} />
          ) : dailyProgress === null ? (
            <div className="space-y-3">
              <p className="text-ui text-muted">{t.emptyToday}</p>
              <Link to="/tasks" className={SECTION_LINK_CLASS}>
                {t.openTasks}
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-display text-4xl text-content tabular-nums">
                {dailyProgress}
                <span className="text-xl text-muted">%</span>
              </p>
              <ProgressBar value={dailyProgress} label={t.todayProgress} />
              <p className="text-ui text-muted tabular-nums">
                {tmpl(t.completedOf, { completed: completedToday, total: totalToday })}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-line pt-6 md:border-t-0 md:pt-0">
          <h2 className="text-ui font-medium text-content">{t.schedule}</h2>
          <ScheduleBody now={now} />
        </div>

        <div className="space-y-3 border-t border-line pt-6 md:border-t-0 md:pt-0">
          <h2 className="text-ui font-medium text-content">{t.insights}</h2>
          {insightsLoading ? (
            <BlockSkeleton label={t.loadingInsights} />
          ) : insights.length > 0 ? (
            <ul className="list-disc space-y-1.5 pl-5 text-ui text-muted">
              {insights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-ui text-muted">{t.emptyInsights}</p>
          )}
        </div>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <section aria-labelledby="dashboard-goals-heading" className="min-w-0 space-y-3">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 id="dashboard-goals-heading" className="text-ui font-medium text-content">
              {t.activeGoals}
            </h2>
            <Link
              to="/goals"
              className="inline-flex min-h-11 items-center text-ui font-medium text-content underline-offset-4 hover:underline"
            >
              {t.viewAll}
            </Link>
          </div>
          {goalsLoading ? (
            <BlockSkeleton label={t.loadingGoals} />
          ) : goalsError ? (
            <BlockError message={t.loadGoalsError} onRetry={retryGoals} />
          ) : activeGoals.length === 0 ? (
            <EmptyState
              icon={Target}
              title={t.noActiveGoals}
              description={t.noActiveGoalsHint}
              action={
                <Link to="/goals" className={SECTION_LINK_CLASS}>
                  {t.goToGoals}
                </Link>
              }
            />
          ) : (
            <ul className={PANEL_LIST_CLASS}>
              {activeGoals.map((item) => (
                <li key={item.goal.id} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/goals/${item.goal.id}`}
                      className="min-w-0 truncate text-ui font-medium text-content hover:underline"
                    >
                      {item.goal.title}
                    </Link>
                    <Badge>{m.enums.category[item.goal.category]}</Badge>
                  </div>
                  <ProgressBar
                    value={item.progress}
                    label={tmpl(t.goalProgressLabel, { title: item.goal.title })}
                  />
                  <p className="text-micro text-muted tabular-nums">
                    {tmpl(t.percentComplete, { percent: item.progress })} ·{" "}
                    {item.goal.targetDate ? tmpl(t.due, { date: item.goal.targetDate }) : t.noDeadline} ·{" "}
                    {item.totalMilestones === 0
                      ? t.noMilestones
                      : milestonesText(item.remainingMilestones, item.totalMilestones)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="dashboard-tasks-heading" className="min-w-0 space-y-3">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <h2 id="dashboard-tasks-heading" className="text-ui font-medium text-content">
              {t.todayTasks}
            </h2>
            <Link
              to="/tasks"
              className="inline-flex min-h-11 items-center text-ui font-medium text-content underline-offset-4 hover:underline"
            >
              {t.viewAll}
            </Link>
          </div>
          {todayQuery.isLoading ? (
            <BlockSkeleton label={t.loadingTodayTasks} />
          ) : todayQuery.isError ? (
            <BlockError message={t.loadTodayError} onRetry={() => void todayQuery.refetch()} />
          ) : todayTasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title={t.noTasksToday}
              description={t.noTasksTodayHint}
              action={
                <Link to="/tasks" className={SECTION_LINK_CLASS}>
                  {t.openTasks}
                </Link>
              }
            />
          ) : (
            <ul className={PANEL_LIST_CLASS}>
              {todayTasks.map((task) => (
                <DashboardTaskRow
                  key={task.id}
                  task={task}
                  timeZone={timeZone}
                  goalTitle={task.goalId ? (goalTitleById.get(task.goalId) ?? null) : null}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
