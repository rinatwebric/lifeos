import { toDateKey, isTaskOverdue } from "@/lib/dates";
import type { HabitStats } from "@/lib/habits";
import type { Goal, Habit, Task } from "@/types/domain";

/**
 * Deterministic analytics aggregation (Phase 5 step 4). Every number names
 * its source and denominator in the UI; empty periods are empty states,
 * never 0% failures. No invented history: task completions count only
 * when `completed_at` exists, and habit math reuses `src/lib/habits.ts`
 * instead of a second copy of the formulas.
 */

export type AnalyticsPeriod = "day" | "week" | "month" | "year";

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function keyToMs(key: string): number {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d, 12);
}

function msToKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(key: string, n: number): string {
  return msToKey(keyToMs(key) + n * 86_400_000);
}

function weekdayOf(key: string): number {
  return new Date(keyToMs(key)).getUTCDay();
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar bounds of the period containing `todayKey`. Weeks are ISO Monday–Sunday. */
export function getPeriodRange(period: AnalyticsPeriod, todayKey: string): { from: string; to: string } {
  if (period === "day") {
    return { from: todayKey, to: todayKey };
  }

  if (period === "week") {
    const monday = addDays(todayKey, -((weekdayOf(todayKey) + 6) % 7));
    return { from: monday, to: addDays(monday, 6) };
  }

  const { y, m } = parseKey(todayKey);

  if (period === "month") {
    const last = daysInMonth(y, m);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  }

  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  from: string;
  to: string;
}

/** Daily buckets for day/week/month ranges, monthly buckets for a year. */
export function bucketize(range: { from: string; to: string }, granularity: "day" | "month"): AnalyticsBucket[] {
  const buckets: AnalyticsBucket[] = [];

  if (granularity === "month") {
    const { y } = parseKey(range.from);
    const pad = (n: number): string => String(n).padStart(2, "0");

    for (let m = 1; m <= 12; m += 1) {
      const last = daysInMonth(y, m);
      buckets.push({
        key: `${y}-${pad(m)}`,
        label: `${y}-${pad(m)}`,
        from: `${y}-${pad(m)}-01`,
        to: `${y}-${pad(m)}-${pad(last)}`,
      });
    }

    return buckets;
  }

  let cursor = range.from;
  while (cursor <= range.to) {
    buckets.push({ key: cursor, label: cursor.slice(5), from: cursor, to: cursor });
    cursor = addDays(cursor, 1);
  }

  return buckets;
}

export interface BucketCompletion {
  key: string;
  label: string;
  completed: number;
}

/**
 * Completed tasks per bucket, dated by `completed_at` in the profile
 * timezone. Tasks without `completed_at` are skipped, not assigned —
 * the chart never invents a completion date.
 */
export function countCompletionsPerBucket(
  tasks: Task[],
  buckets: AnalyticsBucket[],
  timeZone: string,
): BucketCompletion[] {
  const byKey = new Map<string, number>();

  for (const t of tasks) {
    if (t.status !== "completed" || !t.completedAt) {
      continue;
    }

    const day = toDateKey(new Date(t.completedAt), timeZone);
    byKey.set(day, (byKey.get(day) ?? 0) + 1);
  }

  return buckets.map((b) => {
    if (b.from === b.to) {
      return { key: b.key, label: b.label, completed: byKey.get(b.key) ?? 0 };
    }

    let total = 0;
    let cursor = b.from;
    while (cursor <= b.to) {
      total += byKey.get(cursor) ?? 0;
      cursor = addDays(cursor, 1);
    }

    return { key: b.key, label: b.label, completed: total };
  });
}

export interface CategoryCount {
  category: string;
  count: number;
}

/** Tasks grouped by their goal's category; goal-less tasks stay visible as `no-goal`. */
export function groupTasksByGoalCategory(tasks: Task[], goals: Goal[]): CategoryCount[] {
  const categoryByGoal = new Map(goals.map((g) => [g.id, g.category]));
  const counts = new Map<string, number>();

  for (const t of tasks) {
    const category = (t.goalId && categoryByGoal.get(t.goalId)) || "no-goal";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1));
}

export interface HabitRowStats {
  habit: Habit;
  stats: HabitStats;
}

export interface WeeklyReviewInput {
  tasks: Task[];
  goals: Goal[];
  habitRows: HabitRowStats[];
  weekFrom: string;
  todayKey: string;
  timeZone: string;
}

/** Deterministic weekly review lines (no model, no "AI" in the name). */
export function buildWeeklyReview(input: WeeklyReviewInput): string[] {
  const { tasks, goals, habitRows, weekFrom, timeZone } = input;
  const lines: string[] = [];

  const weekTo = addDays(weekFrom, 6);
  const dueThisWeek = tasks.filter(
    (t) => t.dueDate !== null && t.dueDate >= weekFrom && t.dueDate <= weekTo && t.status !== "cancelled",
  );
  const doneThisWeek = dueThisWeek.filter((t) => t.status === "completed");

  if (dueThisWeek.length === 0) {
    lines.push("No tasks due this week yet — add due dates to see weekly progress.");
  } else {
    lines.push(
      `${doneThisWeek.length} of ${dueThisWeek.length} tasks due this week done` +
        (doneThisWeek.length === dueThisWeek.length ? ". Clear week." : "."),
    );
  }

  const now = new Date();
  const overdue = tasks.filter((t) => isTaskOverdue(t, now, timeZone));
  if (overdue.length > 0) {
    lines.push(
      `${overdue.length} ${overdue.length === 1 ? "overdue task needs" : "overdue tasks need"} a new date — reschedule or reprioritize.`,
    );
  }

  const plannedHabits = habitRows.filter((r) => r.stats.planned > 0);
  if (plannedHabits.length === 0) {
    lines.push("No habit obligations this week yet.");
  } else {
    const planned = plannedHabits.reduce((sum, r) => sum + r.stats.planned, 0);
    const completed = plannedHabits.reduce((sum, r) => sum + r.stats.completed, 0);
    lines.push(`habits: ${completed} of ${planned} planned days done.`);
  }

  const activeGoals = goals.filter((g) => g.status === "active");
  if (activeGoals.length > 0) {
    const avg = Math.round(activeGoals.reduce((sum, g) => sum + g.progress, 0) / activeGoals.length);
    lines.push(`${activeGoals.length} ${activeGoals.length === 1 ? "active goal" : "active goals"} at ${avg}% average progress.`);
  }

  return lines;
}
