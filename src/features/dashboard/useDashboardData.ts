import { useQuery } from "@tanstack/react-query";

import { listAllMilestones, listGoals, type MilestoneProgressSlice } from "@/features/goals/api";
import { goals } from "@/features/goals/queryKeys";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { tasks } from "@/features/tasks/queryKeys";
import { isTaskClosed } from "@/types/domain";
import type { Goal, MilestoneStatus, Task } from "@/types/domain";
import { isTaskDueToday, isTaskOverdue, toDateKey } from "@/lib/dates";
import { calculateCompletionRate, calculateGoalProgress } from "@/lib/progress";

export interface DashboardGoalItem {
  goal: Goal;
  progress: number;
  totalMilestones: number;
  completedMilestones: number;
  remainingMilestones: number;
}

export interface MilestoneStats {
  total: number;
  completed: number;
  statuses: MilestoneStatus[];
}

/**
 * Groups milestone `{ goalId, status }` slices by goal. One pass over the
 * single `listAllMilestones` payload — never one query per goal.
 * `statuses` preserves the per-goal status list so `buildActiveGoalItems`
 * reuses the map instead of re-filtering the raw slices.
 */
export function summarizeMilestones(
  slices: Pick<MilestoneProgressSlice, "goalId" | "status">[],
): Map<string, MilestoneStats> {
  const grouped = new Map<string, MilestoneStats>();

  for (const slice of slices) {
    const stats = grouped.get(slice.goalId) ?? {
      total: 0,
      completed: 0,
      statuses: [] as MilestoneStatus[],
    };
    stats.total += 1;
    stats.statuses.push(slice.status);
    if (slice.status === "completed") {
      stats.completed += 1;
    }
    grouped.set(slice.goalId, stats);
  }

  return grouped;
}

/**
 * Pairs each active goal with its derived progress and remaining milestones.
 * `calculateGoalProgress` always returns a number (manual fallback when there
 * are no milestones), so no `?? goal.progress` is needed. Statuses come from
 * the `summarizeMilestones` map — no per-goal `.filter` over the raw slices.
 */
export function buildActiveGoalItems(
  activeGoals: Goal[],
  slices: Pick<MilestoneProgressSlice, "goalId" | "status">[],
): DashboardGoalItem[] {
  const statsByGoal = summarizeMilestones(slices);

  return activeGoals.map((goal) => {
    const stats = statsByGoal.get(goal.id) ?? {
      total: 0,
      completed: 0,
      statuses: [] as MilestoneStatus[],
    };
    const progress = calculateGoalProgress({
      progressMode: goal.progressMode,
      progress: goal.progress,
      milestones: stats.statuses.map((status) => ({ status })),
    });

    return {
      goal,
      progress,
      totalMilestones: stats.total,
      completedMilestones: stats.completed,
      remainingMilestones: stats.total - stats.completed,
    };
  });
}

export interface InsightCounts {
  overdueCount: number | null;
  goalsWithoutMilestones: number | null;
  completedToday: number | null;
  totalToday: number | null;
}

/**
 * Deterministic rules over real numbers — not AI, not invented metrics.
 * Returns 0–3 lines; an empty result means the block stays hidden
 * (never a "No insights" placeholder).
 */
export function buildInsights(counts: InsightCounts): string[] {
  const lines: string[] = [];

  if (counts.overdueCount !== null && counts.overdueCount > 0) {
    lines.push(
      counts.overdueCount === 1 ? "1 task is overdue" : `${counts.overdueCount} tasks are overdue`,
    );
  }

  if (counts.goalsWithoutMilestones !== null && counts.goalsWithoutMilestones > 0) {
    lines.push(
      counts.goalsWithoutMilestones === 1
        ? "1 goal has no milestones yet"
        : `${counts.goalsWithoutMilestones} goals have no milestones yet`,
    );
  }

  if (counts.totalToday !== null && counts.totalToday > 0 && counts.completedToday !== null) {
    lines.push(`Completed ${counts.completedToday} of ${counts.totalToday} tasks today`);
  }

  return lines.slice(0, 3);
}

/**
 * Tasks due on `todayKey`. `isTaskDueToday` covers open tasks; closed tasks
 * due today are kept explicitly so the daily progress counts completed work
 * (`isTaskDueToday` returns false for closed statuses by design).
 * `cancelled` never participates — neither in the day list nor in the
 * progress denominator.
 */
export function selectTodayTasks(allTasks: Task[], now: Date, timeZone: string): Task[] {
  const todayKey = toDateKey(now, timeZone);

  return allTasks.filter((task) => {
    if (task.status === "cancelled") {
      return false;
    }
    return (
      isTaskDueToday(task, now, timeZone) ||
      (task.dueDate === todayKey && task.dueDate !== null && isTaskClosed(task.status))
    );
  });
}

export interface DailyProgress {
  completed: number;
  total: number;
  rate: number | null;
}

/**
 * Pure daily-progress aggregation over the raw task list. `total` counts
 * today's tasks without `cancelled`, `completed` counts `completed` among
 * them, `rate` is `calculateCompletionRate(completed, total)` (`null` when
 * nothing planned, e.g. only `cancelled` tasks due today).
 */
export function selectDailyProgress(
  allTasks: Task[],
  now: Date,
  timeZone: string,
): DailyProgress {
  const today = selectTodayTasks(allTasks, now, timeZone);
  const completed = today.filter((task) => task.status === "completed").length;
  const total = today.length;
  return { completed, total, rate: calculateCompletionRate(completed, total) };
}

export function selectOverdueTasks(allTasks: Task[], now: Date, timeZone: string): Task[] {
  return allTasks.filter((task) => isTaskOverdue(task, now, timeZone));
}

/**
 * Dashboard aggregation layer. The page renders from this hook and holds no
 * business logic: one query per data source, no requests in a loop.
 *
 * - profile → time zone + welcome name
 * - `listTasks({ dueAfter, dueBefore })` → today's tasks + daily progress
 * - `listGoals({ status: "active" })` + `listAllMilestones` → active goals
 * - `listTasks({ statuses: ["todo", "in_progress"] })` + `isTaskOverdue` → overdue count
 */
export function useDashboardData(now: Date = new Date()) {
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const todayKey = toDateKey(now, timeZone);

  // Shared keys with the lists (`tasks.list(...)`) so task mutations refresh
  // the dashboard through the normal invalidation paths.
  const todayQuery = useQuery({
    queryKey: tasks.list({ dueAfter: todayKey, dueBefore: todayKey }),
    queryFn: () => listTasks({ dueAfter: todayKey, dueBefore: todayKey }),
  });
  const overdueQuery = useQuery({
    queryKey: tasks.list({ statuses: ["todo", "in_progress"] }),
    queryFn: () => listTasks({ statuses: ["todo", "in_progress"] }),
  });
  const goalsQuery = useQuery({
    queryKey: goals.list({ status: "active" }),
    queryFn: () => listGoals({ status: "active" }),
  });
  const milestonesQuery = useQuery({
    queryKey: goals.allMilestones,
    queryFn: listAllMilestones,
  });

  const todayTasks = selectTodayTasks(todayQuery.data ?? [], now, timeZone);
  const daily = selectDailyProgress(todayQuery.data ?? [], now, timeZone);
  const completedToday = daily.completed;
  const totalToday = daily.total;
  const dailyProgress = daily.rate;

  const overdueTasks = selectOverdueTasks(overdueQuery.data ?? [], now, timeZone);

  const activeGoals = buildActiveGoalItems(goalsQuery.data ?? [], milestonesQuery.data ?? []);
  const goalsWithoutMilestones = activeGoals.filter((item) => item.totalMilestones === 0).length;

  const insights = buildInsights({
    overdueCount: overdueQuery.data ? overdueTasks.length : null,
    goalsWithoutMilestones:
      goalsQuery.data && milestonesQuery.data ? goalsWithoutMilestones : null,
    completedToday: todayQuery.data ? completedToday : null,
    totalToday: todayQuery.data ? totalToday : null,
  });

  const goalTitleById = new Map<string, string>();
  for (const item of activeGoals) {
    goalTitleById.set(item.goal.id, item.goal.title);
  }

  return {
    now,
    timeZone,
    todayKey,
    displayName: profileQuery.data?.fullName ?? null,
    profileQuery,
    todayQuery,
    overdueQuery,
    goalsQuery,
    milestonesQuery,
    todayTasks,
    completedToday,
    totalToday,
    dailyProgress,
    overdueTasks,
    activeGoals,
    insights,
    goalTitleById,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
