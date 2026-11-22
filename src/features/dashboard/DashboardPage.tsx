import { ArrowRight, CalendarDays, ListChecks, Target } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CheckCircle } from "@/components/ui/CheckCircle";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { useDashboardSchedule } from "@/features/dashboard/useDashboardSchedule";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { formatDurationMinutes } from "@/features/planner/usePlannerDay";
import { cn } from "@/lib/cn";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useIntlLocale, useLocale, useMessages } from "@/lib/i18n/I18nContext";
import type { Task } from "@/types/domain";

const PRIMARY_LINK_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-pill bg-content px-4 text-ui font-medium text-canvas transition-[opacity,scale] duration-fast ease-standard hover:opacity-90 motion-safe:active:scale-[0.97]";

const QUIET_LINK_CLASS =
  "inline-flex items-center gap-1 rounded-full text-micro font-medium text-muted transition-colors duration-fast ease-standard hover:text-content";

function formatDateLabel(now: Date, timeZone: string, intl: string): string {
  return new Intl.DateTimeFormat(intl, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

function formatShortDate(value: string, timeZone: string, intl: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intl, { timeZone, day: "numeric", month: "short" }).format(date);
}

function formatTimeOfDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

function minutesFromLabel(label: string): number {
  const [hours, minutes] = label.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToLabel(minutes: number): string {
  const rounded = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`; // taste-skill-ignore numbering — clock labels
}

function taskSortTime(task: Task): number {
  if (task.scheduledStart) {
    const parsed = Date.parse(task.scheduledStart);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

function taskTimeLabel(task: Task, timeZone: string, intl: string, todayLabel: string): string {
  if (!task.scheduledStart) return todayLabel;
  const date = new Date(task.scheduledStart);
  if (Number.isNaN(date.getTime())) return todayLabel;
  return new Intl.DateTimeFormat(intl, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Figure({ value, label, detail }: { value: string; label: string; detail: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-content">
          {value}
        </span>
        <span className="text-[15px] font-medium text-muted">%</span>
      </div>
      <div className="sm:text-right">
        <p className="text-micro font-medium text-content tabular-nums">{label}</p>
        <p className="mt-1 text-caption leading-snug text-muted">{detail}</p>
      </div>
    </div>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("h-3 rounded-full bg-surface-muted", className)} />;
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const m = useMessages();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-caption text-muted">
      <span>{message}</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {m.common.retry}
      </Button>
    </div>
  );
}

function CardEmpty({
  icon,
  title,
  description,
  href,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-1 items-center px-6 py-6">
      <div className="motion-rise w-full rounded-card bg-surface-muted/60 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-ui font-medium text-content">{title}</p>
            <p className="mt-1 max-w-sm text-caption leading-relaxed text-muted text-pretty">
              {description}
            </p>
          </div>
        </div>
        <Link
          to={href}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-control bg-surface px-4 text-ui font-medium text-content transition-[background-color,scale] duration-fast ease-standard hover:bg-surface-raised motion-safe:active:scale-[0.97]"
        >
          {action}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const now = new Date();
  const m = useMessages();
  const t = m.dashboard;
  const locale = useLocale();
  const intl = useIntlLocale();
  const {
    timeZone,
    todayTasks,
    completedToday,
    totalToday,
    dailyProgress,
    overdueTasks,
    activeGoals,
    todayQuery,
    goalsQuery,
    milestonesQuery,
    goalTitleById,
    profileQuery,
  } = useDashboardData(now);
  const {
    schedule,
    isLoading: scheduleLoading,
    isError: scheduleError,
    retry: retrySchedule,
  } = useDashboardSchedule({ now });
  const { mutate: setTaskStatus, isError: taskStatusError } = useSetTaskStatus();

  const profileReady = profileQuery.isSuccess;
  const nowMs = now.getTime();
  const nowMinutes = minutesFromLabel(formatTimeOfDay(now, timeZone));
  const todayDate = formatDateLabel(now, timeZone, intl);

  const overdueCount = overdueTasks.length;
  const overdueCategory = pluralCategory(locale, overdueCount);
  const overdueText =
    overdueCount > 0
      ? tmpl(
          overdueCategory === "one"
            ? t.overdueOne
            : overdueCategory === "few"
              ? t.overdueFew
              : t.overdueMany,
          { count: overdueCount },
        )
      : null;

  const nextBlock = schedule.dayBlocks.find((block) => Date.parse(block.start) > nowMs);
  const blocksDone = schedule.dayBlocks.filter((block) => Date.parse(block.end) <= nowMs).length;
  const scheduleCaption = nextBlock
    ? tmpl(t.nextAt, { title: nextBlock.title, time: nextBlock.startLabel })
    : schedule.dayBlocks.length === 0
      ? t.nothingScheduled
      : t.blocksDone;

  const pendingTasks = todayTasks
    .filter((task) => task.status === "todo" || task.status === "in_progress")
    .sort((a, b) => taskSortTime(a) - taskSortTime(b));
  const nextActions = pendingTasks.slice(0, 3);

  const goalsLoading = goalsQuery.isLoading || milestonesQuery.isLoading;
  const goalsError = goalsQuery.isError || milestonesQuery.isError;
  const goals = activeGoals.slice(0, 3);

  const allStarts = schedule.dayBlocks.map((block) => minutesFromLabel(block.startLabel));
  const allEnds = schedule.dayBlocks.map((block) => minutesFromLabel(block.endLabel));
  const dayStart = Math.min(8 * 60, ...allStarts);
  const dayEnd = Math.max(18 * 60, ...allEnds);
  const daySpan = Math.max(60, dayEnd - dayStart);
  const railTicks = [dayStart, dayStart + 4 * 60, dayStart + 8 * 60, dayEnd].filter(
    (tick, index, all) => tick >= dayStart && tick <= dayEnd && all.indexOf(tick) === index,
  );
  const nowPercent = Math.min(100, Math.max(0, ((nowMinutes - dayStart) / daySpan) * 100));

  const completeTask = (task: Task): void => {
    setTaskStatus({ id: task.id, status: "completed" });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em] text-content text-balance sm:text-[28px]">
            {t.today}
          </h1>
          <p className="max-w-2xl text-caption leading-relaxed text-muted text-pretty">
            {profileQuery.isError
              ? m.dbErrors.network
              : profileReady
                ? todayDate
                : m.common.loading}
            {profileReady && overdueText ? (
              <>
                <span aria-hidden="true"> · </span>
                <span className="font-medium text-danger">{overdueText}</span>
              </>
            ) : null}
            {profileReady && overdueCount > 0 ? (
              <>
                <span aria-hidden="true"> · </span>
                <Link
                  to="/tasks"
                  className={cn(
                    QUIET_LINK_CLASS,
                    "inline text-content underline decoration-line underline-offset-2",
                  )}
                >
                  {t.reschedule}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <Link to="/planner" className={PRIMARY_LINK_CLASS}>
          {t.planToday}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="flex flex-col p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[15px] font-medium text-content">{t.overviewProgress}</h2>
          </div>

          {profileQuery.isError ? (
            <InlineError message={t.profileLoadError} onRetry={() => void profileQuery.refetch()} />
          ) : !profileReady || scheduleLoading ? (
            <div className="mt-6 space-y-3">
              <SkeletonLine className="h-8 w-24" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
            </div>
          ) : todayQuery.isLoading ? (
            <div className="mt-6 space-y-3">
              <SkeletonLine className="h-8 w-24" />
              <SkeletonLine className="w-2/3" />
            </div>
          ) : todayQuery.isError ? (
            <InlineError message={t.loadTodayError} onRetry={() => void todayQuery.refetch()} />
          ) : dailyProgress === null ? (
            <div className="motion-rise mt-6 flex flex-1 flex-col justify-center rounded-card bg-surface-muted/60 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-content tabular-nums">
                  0<span className="ml-1 text-[15px] font-medium text-muted">%</span>
                </p>
                <p className="max-w-[18rem] text-right text-caption leading-relaxed text-muted text-pretty">
                  {t.emptyToday}
                </p>
              </div>
              <div className="mt-5 h-1 overflow-hidden rounded-full bg-surface">
                <div className="h-full w-0 rounded-full bg-accent" />
              </div>
              <Link
                to="/tasks"
                className="mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill border border-control bg-surface px-4 text-ui font-medium text-content transition-[background-color,scale] duration-fast ease-standard hover:bg-surface-raised motion-safe:active:scale-[0.97]"
              >
                {t.openTasks}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <Figure
                  value={String(dailyProgress)}
                  label={tmpl(t.tasksDoneOf, { completed: completedToday, total: totalToday })}
                  detail={scheduleCaption}
                />
              </div>

              <div
                role="progressbar"
                aria-valuenow={dailyProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.todayProgress}
                className="mt-5 h-1 overflow-hidden rounded-full bg-surface-muted"
              >
                <div
                  className="motion-progress h-full rounded-full bg-accent transition-[width] duration-slow ease-standard motion-reduce:transition-none"
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>

              <div className="mt-4 flex items-center gap-4 text-micro text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-muted/30" aria-hidden="true" />
                  {t.legendDone}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-accent" aria-hidden="true" />
                  {m.common.now}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-4 rounded-full border border-control bg-surface"
                    aria-hidden="true"
                  />
                  {t.legendNext}
                </span>
              </div>

              <div className="mt-auto pt-4">
                <div className="flex items-center justify-between text-micro text-muted tabular-nums">
                  <span>{minutesToLabel(dayStart)}</span>
                  <span>{minutesToLabel(dayEnd)}</span>
                </div>
                <div
                  className="relative mt-2 h-12"
                  role="img"
                  aria-label={`${t.todayBlocks}: ${schedule.dayBlocks.map((block) => `${block.startLabel} ${block.title}`).join(", ") || t.nothingScheduled}`}
                >
                  <div className="absolute inset-x-0 top-4 h-0.5 rounded-full bg-surface-muted" />
                  {schedule.dayBlocks.map((block) => {
                    const start = minutesFromLabel(block.startLabel);
                    const end = minutesFromLabel(block.endLabel);
                    const left = ((start - dayStart) / daySpan) * 100;
                    const width = Math.max(1.5, ((end - start) / daySpan) * 100);
                    const isCurrent = start <= nowMinutes && nowMinutes < end;
                    const isPast = end <= nowMinutes;

                    return (
                      <div
                        key={block.id}
                        title={`${block.startLabel}–${block.endLabel} ${block.title}`}
                        className={cn(
                          "absolute top-2 h-5 rounded-[4px] border transition-colors duration-fast",
                          isCurrent
                            ? "border-accent bg-accent"
                            : isPast
                              ? "border-transparent bg-muted/30"
                              : "border-control bg-surface",
                        )}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    );
                  })}
                  {nowMinutes >= dayStart && nowMinutes <= dayEnd ? (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-accent"
                      style={{ left: `${nowPercent}%` }}
                      aria-hidden="true"
                    >
                      <span
                        className={cn(
                          "absolute -top-5 text-micro font-medium whitespace-nowrap text-accent tabular-nums",
                          nowPercent > 78 ? "right-1.5 text-right" : "left-1.5",
                        )}
                      >
                        {m.common.now} {formatTimeOfDay(now, timeZone)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 flex justify-between text-micro text-muted tabular-nums">
                  {railTicks.map((tick, index) => (
                    <span
                      key={tick}
                      className={
                        index === 0
                          ? "text-left"
                          : index === railTicks.length - 1
                            ? "text-right"
                            : "text-center"
                      }
                    >
                      {minutesToLabel(tick)}
                    </span>
                  ))}
                </div>
                {scheduleError ? (
                  <InlineError message={t.loadScheduleError} onRetry={retrySchedule} />
                ) : (
                  <p className="mt-4 text-caption text-muted tabular-nums">
                    {schedule.dayBlocks.length === 0
                      ? t.nothingScheduled
                      : `${tmpl(t.blocksDoneOf, { done: blocksDone, total: schedule.dayBlocks.length })} · ${tmpl(t.blocksCount, { count: schedule.dayBlocks.length })}`}
                  </p>
                )}
              </div>
            </>
          )}
        </Card>

        <Card className="flex flex-col p-0">
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <div>
              <h2 className="text-[15px] font-medium text-content">{t.nextActions}</h2>
              <p className="mt-0.5 text-micro text-muted tabular-nums">
                {tmpl(t.tasksLeft, { count: pendingTasks.length })}
              </p>
            </div>
          </div>

          {profileQuery.isError ? (
            <div className="px-6">
              <InlineError
                message={t.profileLoadError}
                onRetry={() => void profileQuery.refetch()}
              />
            </div>
          ) : !profileReady || todayQuery.isLoading ? (
            <div className="space-y-3 px-6 py-6">
              <SkeletonLine className="w-4/5" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-3/5" />
            </div>
          ) : todayQuery.isError ? (
            <div className="px-6">
              <InlineError message={t.loadTodayError} onRetry={() => void todayQuery.refetch()} />
            </div>
          ) : nextActions.length === 0 ? (
            <CardEmpty
              icon={<ListChecks className="size-4" aria-hidden="true" />}
              title={totalToday === 0 ? t.noTasksToday : t.noTasksLeft}
              description={totalToday === 0 ? t.noTasksTodayHint : t.noTasksLeftHint}
              href="/tasks"
              action={t.addTask}
            />
          ) : (
            <ul className="mt-4 flex flex-1 flex-col">
              {nextActions.map((task, index) => {
                const goalTitle = task.goalId ? goalTitleById.get(task.goalId) : undefined;
                const priority =
                  task.priority === "critical" || task.priority === "high"
                    ? tmpl(t.priorityBadge, { priority: m.enums.priority[task.priority] })
                    : null;

                return (
                  <li
                    key={task.id}
                    className={cn(
                      "flex flex-1 items-center gap-3.5 px-6 py-3",
                      index !== nextActions.length - 1 && "border-b border-line",
                    )}
                  >
                    <CheckCircle
                      checked={false}
                      onChange={() => completeTask(task)}
                      ariaLabel={tmpl(t.markComplete, { title: task.title })}
                      className="mt-0.5 size-[18px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-ui leading-snug",
                          index === 0 ? "font-medium text-content" : "text-content/90",
                        )}
                      >
                        {task.title}
                      </p>
                      {goalTitle || priority ? (
                        <p className="mt-0.5 truncate text-micro text-muted">
                          {goalTitle}
                          {goalTitle && priority ? " · " : null}
                          {priority}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-micro tabular-nums",
                        index === 0 ? "text-content" : "text-muted",
                      )}
                    >
                      {task.status === "in_progress"
                        ? m.common.now
                        : taskTimeLabel(task, timeZone, intl, m.common.today)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {taskStatusError ? (
            <p role="alert" className="px-6 pb-2 text-micro text-danger">
              {t.updateStatusError}
            </p>
          ) : null}

          {nextActions.length > 0 ? (
            <div className="mt-auto flex items-center justify-between border-t border-line px-6 py-3">
              <Link to="/tasks" className={cn(QUIET_LINK_CLASS, "text-content")}>
                {t.openAllTasks}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              <Link to="/tasks" className={QUIET_LINK_CLASS}>
                {t.addTask}
              </Link>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="flex min-h-[240px] flex-col p-0">
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <h2 className="text-[15px] font-medium text-content">{t.todayBlocks}</h2>
            <span className="text-micro text-muted tabular-nums">
              {tmpl(t.blocksCount, { count: schedule.dayBlocks.length })}
            </span>
          </div>

          {profileQuery.isError ? (
            <div className="px-6">
              <InlineError
                message={t.profileLoadError}
                onRetry={() => void profileQuery.refetch()}
              />
            </div>
          ) : scheduleLoading ? (
            <div className="space-y-3 px-6 py-6">
              <SkeletonLine className="w-3/4" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
            </div>
          ) : scheduleError ? (
            <div className="px-6">
              <InlineError message={t.loadScheduleError} onRetry={retrySchedule} />
            </div>
          ) : schedule.dayBlocks.length === 0 ? (
            <CardEmpty
              icon={<CalendarDays className="size-4" aria-hidden="true" />}
              title={t.nothingScheduled}
              description={t.nothingScheduledHint}
              href="/planner"
              action={t.openPlanner}
            />
          ) : (
            <ol className="mt-2 divide-y divide-line">
              {schedule.dayBlocks.map((block) => {
                const isPast = Date.parse(block.end) <= nowMs;
                const isCurrent = Date.parse(block.start) <= nowMs && nowMs < Date.parse(block.end);

                return (
                  <li
                    key={block.id}
                    className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-2.5 px-6 py-3.5"
                  >
                    <span className="text-micro text-muted tabular-nums">{block.startLabel}</span>
                    <span
                      title={block.title}
                      className={cn(
                        "min-w-0 truncate text-ui leading-snug",
                        isPast ? "text-muted" : "text-content",
                        isCurrent && "font-medium",
                      )}
                    >
                      {isCurrent ? (
                        <span
                          className="mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle"
                          aria-hidden="true"
                        />
                      ) : null}
                      {block.title}
                    </span>
                    <span className="text-micro text-muted tabular-nums">
                      {formatDurationMinutes(block.durationMinutes, locale)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {schedule.dayBlocks.length > 0 ? (
            <div className="mt-auto border-t border-line px-6 py-3">
              <Link to="/planner" className={QUIET_LINK_CLASS}>
                {t.openPlanner}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </Card>

        <Card className="flex min-h-[240px] flex-col p-0">
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <h2 className="text-[15px] font-medium text-content">{t.activeGoals}</h2>
            <Link to="/goals" className={QUIET_LINK_CLASS}>
              {t.viewAll}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          {goalsLoading ? (
            <div className="space-y-3 px-6 py-6">
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
              <SkeletonLine className="w-3/5" />
            </div>
          ) : goalsError ? (
            <div className="px-6">
              <InlineError
                message={t.loadGoalsError}
                onRetry={() => {
                  if (goalsQuery.isError) void goalsQuery.refetch();
                  if (milestonesQuery.isError) void milestonesQuery.refetch();
                }}
              />
            </div>
          ) : goals.length === 0 ? (
            <CardEmpty
              icon={<Target className="size-4" aria-hidden="true" />}
              title={t.noActiveGoals}
              description={t.noActiveGoalsHint}
              href="/goals"
              action={t.goToGoals}
            />
          ) : (
            <ul className="mt-4 flex flex-1 flex-col">
              {goals.map((item) => (
                <li key={item.goal.id} className="flex flex-1 flex-col justify-center px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      to={`/goals/${item.goal.id}`}
                      className="min-w-0 truncate text-ui font-medium text-content transition-colors duration-fast hover:text-accent"
                    >
                      {item.goal.title}
                    </Link>
                    <span className="shrink-0 text-micro font-medium text-content tabular-nums">
                      {item.progress}%
                    </span>
                  </div>
                  <div className="mt-2.5">
                    <ProgressBar
                      value={item.progress}
                      label={tmpl(t.goalProgressLabel, { title: item.goal.title })}
                      tone="neutral"
                    />
                  </div>
                  <p className="mt-1.5 text-micro text-muted">
                    {item.totalMilestones === 0
                      ? t.noMilestones
                      : tmpl(
                          item.remainingMilestones > 0
                            ? pluralCategory(locale, item.remainingMilestones) === "one"
                              ? t.milestonesRemainingOne
                              : pluralCategory(locale, item.remainingMilestones) === "few"
                                ? t.milestonesRemainingFew
                                : t.milestonesRemainingMany
                            : t.milestonesAllComplete,
                          { remaining: item.remainingMilestones, total: item.totalMilestones },
                        )}
                    {item.goal.targetDate ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        {tmpl(t.due, {
                          date: formatShortDate(item.goal.targetDate, timeZone, intl),
                        })}
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {goals.length > 0 ? (
            <div className="mt-auto border-t border-line px-6 py-3">
              <Link to="/goals" className={QUIET_LINK_CLASS}>
                {t.goToGoals}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
