import { ListChecks, Target } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useDashboardData } from "@/features/dashboard/useDashboardData";
import { ScheduleCard } from "@/features/dashboard/ScheduleCard";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { formatLongDate } from "@/lib/dates";
import { humanize } from "@/lib/strings";
import { cn } from "@/lib/cn";
import type { Task } from "@/types/domain";

function BlockSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="h-5 w-2/3 rounded bg-surface-muted" />
        <div className="h-2 w-full rounded-full bg-surface-muted" />
        <div className="h-4 w-1/3 rounded bg-surface-muted" />
      </div>
    </div>
  );
}

function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-control border border-line bg-surface p-4">
      <p className="text-ui text-content">{message}</p>
      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function formatTaskTime(task: Task, timeZone: string): string | null {
  if (task.scheduledStart) {
    const date = new Date(task.scheduledStart);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
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
  const setStatus = useSetTaskStatus();
  const completed = task.status === "completed";
  const showPriorityBadge = task.priority === "high" || task.priority === "critical";

  const handleToggle = (): void => {
    if (setStatus.isPending) {
      return;
    }
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
          aria-label={completed ? `Mark ${task.title} as not completed` : `Mark ${task.title} as completed`}
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
            <Badge tone="outline">{humanize(task.priority)} priority</Badge>
          ) : null}
          {formatTaskTime(task, timeZone) ? (
            <span className="text-micro text-muted tabular-nums">{formatTaskTime(task, timeZone)}</span>
          ) : null}
          <span className="text-micro text-muted">{humanize(task.status)}</span>
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
            Could not update the status. Please try again.
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function DashboardPage() {
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

  const welcome = displayName ? `Welcome back, ${displayName}` : "Welcome back";
  const goalsLoading = goalsQuery.isLoading || milestonesQuery.isLoading;
  const goalsError = goalsQuery.isError || milestonesQuery.isError;
  const insightsLoading =
    todayQuery.isLoading || overdueQuery.isLoading || goalsQuery.isLoading || milestonesQuery.isLoading;

  const retryGoals = (): void => {
    if (goalsQuery.isError) {
      void goalsQuery.refetch();
    }
    if (milestonesQuery.isError) {
      void milestonesQuery.refetch();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={welcome}
        description={`${formatLongDate(now, timeZone)} · times shown in ${timeZone}`}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-3">
          <h2 className="text-ui font-medium text-content">Today&apos;s progress</h2>
          {todayQuery.isLoading ? (
            <BlockSkeleton label="Loading today's progress" />
          ) : todayQuery.isError ? (
            <BlockError
              message="Could not load today's tasks. Please try again."
              onRetry={() => void todayQuery.refetch()}
            />
          ) : dailyProgress === null ? (
            <div className="space-y-3">
              <p className="text-ui text-muted">
                Nothing planned for today — add a task to get started
              </p>
              <Link
                to="/tasks"
                className="inline-flex items-center gap-1.5 text-ui font-medium text-content underline-offset-4 hover:underline"
              >
                Open tasks
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <ProgressBar value={dailyProgress} label="Today's progress" />
              <p className="text-ui text-muted tabular-nums">
                Completed {completedToday} of {totalToday} tasks today
              </p>
              <p className="text-micro text-muted tabular-nums">{dailyProgress}% complete</p>
            </div>
          )}
        </Card>

        <ScheduleCard now={now} />

        {insightsLoading ? (
          <Card className="space-y-3">
            <h2 className="text-ui font-medium text-content">Insights</h2>
            <BlockSkeleton label="Loading insights" />
          </Card>
        ) : insights.length > 0 ? (
          <Card className="space-y-3">
            <h2 className="text-ui font-medium text-content">Insights</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-ui text-muted">
              {insights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-ui font-medium text-content">Active goals</h2>
            <Target className="size-4.5 text-muted" aria-hidden="true" />
          </div>
          {goalsLoading ? (
            <BlockSkeleton label="Loading goals" />
          ) : goalsError ? (
            <BlockError
              message="Could not load goals. Please try again."
              onRetry={retryGoals}
            />
          ) : activeGoals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No active goals yet"
              description="Create a long-term goal and break it into milestones to see progress here."
              action={
                <Link
                  to="/goals"
                  className="inline-flex items-center gap-1.5 text-ui font-medium text-content underline-offset-4 hover:underline"
                >
                  Go to goals
                </Link>
              }
            />
          ) : (
            <ul className="space-y-4">
              {activeGoals.map((item) => (
                <li key={item.goal.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/goals/${item.goal.id}`}
                      className="text-ui font-medium text-content hover:underline"
                    >
                      {item.goal.title}
                    </Link>
                    <Badge>{humanize(item.goal.category)}</Badge>
                  </div>
                  <ProgressBar value={item.progress} label={`Progress for ${item.goal.title}`} />
                  <p className="text-micro text-muted tabular-nums">
                    {item.progress}% complete ·{" "}
                    {item.goal.targetDate ? `Due ${item.goal.targetDate}` : "No deadline"} ·{" "}
                    {item.totalMilestones === 0
                      ? "No milestones yet"
                      : `${item.remainingMilestones} of ${item.totalMilestones} milestones remaining`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-ui font-medium text-content">Today&apos;s tasks</h2>
            <ListChecks className="size-4.5 text-muted" aria-hidden="true" />
          </div>
          {todayQuery.isLoading ? (
            <BlockSkeleton label="Loading today's tasks" />
          ) : todayQuery.isError ? (
            <BlockError
              message="Could not load today's tasks. Please try again."
              onRetry={() => void todayQuery.refetch()}
            />
          ) : todayTasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No tasks due today"
              description="Plan a task for today to see it here with its priority and goal."
              action={
                <Link
                  to="/tasks"
                  className="inline-flex items-center gap-1.5 text-ui font-medium text-content underline-offset-4 hover:underline"
                >
                  Open tasks
                </Link>
              }
            />
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {todayTasks.map((task) => (
                  <DashboardTaskRow
                    key={task.id}
                    task={task}
                    timeZone={timeZone}
                    goalTitle={task.goalId ? (goalTitleById.get(task.goalId) ?? null) : null}
                  />
                ))}
              </ul>
            </Card>
          )}
        </Card>
      </div>
    </div>
  );
}
