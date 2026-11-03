import { useQuery } from "@tanstack/react-query";

import { listAllMilestones, listGoals, type MilestoneProgressSlice } from "@/features/goals/api";
import { goals } from "@/features/goals/queryKeys";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { tasks } from "@/features/tasks/queryKeys";
import { isTaskClosed } from "@/types/domain";
import type { Goal, Task } from "@/types/domain";
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
}

/**
 * Groups milestone `{ goalId, status }` slices by goal. One pass over the
 * single `listAllMilestones` payload — never one query per goal.
 */
export function summarizeMilestones(
  slices: Pick<MilestoneProgressSlice, "goalId" | "status">[],
): Map<string, MilestoneStats> {
  const grouped = new Map<string, MilestoneStats>();

  for (const slice of slices) {
    const stats = grouped.get(slice.goalId) ?? { total: 0, completed: 0 };
    stats.total += 1;
    if (slice.status === "completed") {
      stats.completed += 1;
    }
    grouped.set(slice.goalId, stats);
  }

  return grouped;
}

/**
 * Pairs each active goal with its derived progress and remaining milestones.
 * `calculateGoalProgress` falls back to the stored manual value for goals
 * without milestones, so progress is always a number here.
 */
export function buildActiveGoalItems(
  activeGoals: Goal[],
  slices: Pick<MilestoneProgressSlice, "goalId" | "status">[],
): DashboardGoalItem[] {
  const statsByGoal = summarizeMilestones(slices);

  return activeGoals.map((goal) => {
    const stats = statsByGoal.get(goal.id) ?? { total: 0, completed: 0 };
    const statuses = slices
      .filter((slice) => slice.goalId === goal.id)
      .map((slice) => ({ status: slice.status }));
    const progress =
      calculateGoalProgress({
        progressMode: goal.progressMode,
        progress: goal.progress,
        milestones: statuses,
      }) ?? goal.progress;

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
 */
export function selectTodayTasks(allTasks: Task[], now: Date, timeZone: string): Task[] {
  const todayKey = toDateKey(now, timeZone);

  return allTasks.filter(
    (task) =>
      isTaskDueToday(task, now, timeZone) ||
      (task.dueDate === todayKey && task.dueDate !== null && isTaskClosed(task.status)),
  );
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
 * - `listTasks({ status: "todo" })` + `isTaskOverdue` → overdue count
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
    queryKey: tasks.list({ status: "todo" }),
    queryFn: () => listTasks({ status: "todo" }),
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
  const completedToday = todayTasks.filter((task) => task.status === "completed").length;
  const totalToday = todayTasks.length;
  const dailyProgress = calculateCompletionRate(completedToday, totalToday);

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
