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
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import { useLocale, useMessages, type Messages } from "@/lib/i18n/I18nContext";
import type { Locale } from "@/lib/i18n/types";

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

export function buildActiveGoalItems(
  activeGoals: Goal[],
  slices: Pick<MilestoneProgressSlice, "goalId" | "status">[],
): DashboardGoalItem[] {
  const statsByGoal = summarizeMilestones(slices);
  return activeGoals.map((goal) => {
    const stats = statsByGoal.get(goal.id) ?? { total: 0, completed: 0, statuses: [] as MilestoneStatus[] };
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
 * (never a "No insights" placeholder). Locale-aware plurals via
 * `Intl.PluralRules` (ru 1/2/5/11/21).
 */
export function buildInsights(
  counts: InsightCounts,
  locale: Locale = "en",
  d?: Messages["dashboard"],
): string[] {
  const lines: string[] = [];
  const overdueOne = d?.overdueOne ?? "{count} task is overdue";
  const overdueFew = d?.overdueFew ?? "{count} tasks are overdue";
  const overdueMany = d?.overdueMany ?? "{count} tasks are overdue";
  const noMsOne = d?.goalsWithoutMilestonesOne ?? "{count} goal has no milestones yet";
  const noMsFew = d?.goalsWithoutMilestonesFew ?? "{count} goals have no milestones yet";
  const noMsMany = d?.goalsWithoutMilestonesMany ?? "{count} goals have no milestones yet";
  const completedTpl = d?.completedOf ?? "Completed {completed} of {total} tasks today";

  if (counts.overdueCount !== null && counts.overdueCount > 0) {
    const n = counts.overdueCount;
    const cat = pluralCategory(locale, n);
    const tpl = cat === "one" ? overdueOne : cat === "few" ? overdueFew : overdueMany;
    lines.push(tmpl(tpl, { count: n }));
  }

  if (counts.goalsWithoutMilestones !== null && counts.goalsWithoutMilestones > 0) {
    const n = counts.goalsWithoutMilestones;
    const cat = pluralCategory(locale, n);
    const tpl = cat === "one" ? noMsOne : cat === "few" ? noMsFew : noMsMany;
    lines.push(tmpl(tpl, { count: n }));
  }

  if (counts.totalToday !== null && counts.totalToday > 0 && counts.completedToday !== null) {
    lines.push(tmpl(completedTpl, { completed: counts.completedToday, total: counts.totalToday }));
  }

  return lines.slice(0, 3);
}

export function selectTodayTasks(allTasks: Task[], now: Date, timeZone: string): Task[] {
  const todayKey = toDateKey(now, timeZone);
  return allTasks.filter((task) => {
    if (task.status === "cancelled") return false;
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

export function selectDailyProgress(allTasks: Task[], now: Date, timeZone: string): DailyProgress {
  const today = selectTodayTasks(allTasks, now, timeZone);
  const completed = today.filter((task) => task.status === "completed").length;
  const total = today.length;
  return { completed, total, rate: calculateCompletionRate(completed, total) };
}

export function selectOverdueTasks(allTasks: Task[], now: Date, timeZone: string): Task[] {
  return allTasks.filter((task) => isTaskOverdue(task, now, timeZone));
}

export function useDashboardData(now: Date = new Date()) {
  const locale = useLocale();
  const m = useMessages();
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const todayKey = toDateKey(now, timeZone);

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

  const insights = buildInsights(
    {
      overdueCount: overdueQuery.data ? overdueTasks.length : null,
      goalsWithoutMilestones: goalsQuery.data && milestonesQuery.data ? goalsWithoutMilestones : null,
      completedToday: todayQuery.data ? completedToday : null,
      totalToday: todayQuery.data ? totalToday : null,
    },
    locale,
    m.dashboard,
  );

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
