/**
 * Tool-layer reads (iteration 5, steps 4–5; PRD section 6.4).
 *
 * The nine fixed tools are the ONLY way the assistant touches user data:
 * four read the caller's own rows, five `suggest_*`/`analyze_*` return
 * proposals — never writes. All reads go through the user-scoped client
 * (the caller's JWT, RLS `user_id = auth.uid()` stays the enforcement
 * point): no `user_id` argument is accepted from anywhere, so a forged id
 * cannot leak another user's rows by construction. There are no mocked rows
 * anywhere — empty tables yield empty arrays / null, never invented numbers
 * (PRD section 22 p. 4).
 *
 * Six queries, no N+1: goals (1), tasks (1), preferences (1), profile
 * timezone (1), weekly total (1) and weekly completed (1), the last two in
 * parallel. Truncation is disclosed via `truncated` and mirrored into the
 * persisted message `metadata` by `index.ts`.
 *
 * Domain rules live in exactly one place (single source of truth):
 * `toDateKey`/`isTaskOverdue` come from `src/lib/dates.ts` and
 * `calculateCompletionRate` from `src/lib/progress.ts` — the same functions
 * the Dashboard uses. The Deno runtime resolves these `@/lib/*` specifiers
 * through `deno.json`; Vitest resolves them through the Vite `@` alias.
 */

import { isTaskOverdue, toDateKey } from "@/lib/dates";
import { calculateCompletionRate } from "@/lib/progress";
import type { TaskStatus } from "@/types/domain";

import type { ToolDefinition } from "./provider.ts";

export const READ_TOOL_NAMES = [
  "get_user_goals",
  "get_user_tasks",
  "get_weekly_progress",
  "get_user_preferences",
] as const;

export const SUGGEST_TOOL_NAMES = [
  "suggest_goal_breakdown",
  "suggest_task_creation",
  "suggest_schedule",
  "suggest_schedule_changes",
  "analyze_productivity",
] as const;

/** All nine tools from PRD section 6.4 — a closed set, no ad-hoc tool names. */
export const TOOL_NAMES = [...READ_TOOL_NAMES, ...SUGGEST_TOOL_NAMES] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

function define(name: ToolName, description: string): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  };
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  define(
    "get_user_goals",
    "Read the caller's active goals (titles, status, progress). Never returns another user's data.",
  ),
  define(
    "get_user_tasks",
    "Read the caller's recent tasks (titles, status, due dates). Never returns another user's data.",
  ),
  define(
    "get_weekly_progress",
    "Summarize completed vs total tasks for the current week in the caller's timezone.",
  ),
  define(
    "get_user_preferences",
    "Read the caller's planning preferences (working hours, timezone). Never returns another user's data.",
  ),
  define(
    "suggest_goal_breakdown",
    "Propose milestones breaking a goal down. Returns a proposal, never writes milestones.",
  ),
  define(
    "suggest_task_creation",
    "Propose tasks derived from milestones. Returns a proposal, never writes tasks.",
  ),
  define(
    "suggest_schedule",
    "Propose schedule blocks for tasks. Returns a proposal, never writes time blocks.",
  ),
  define(
    "suggest_schedule_changes",
    "Propose rescheduling of existing tasks. Returns a proposal, never moves tasks.",
  ),
  define(
    "analyze_productivity",
    "Analyze progress and explain it. Returns insights as a proposal, never changes settings.",
  ),
];

/** Context row for one active goal: minimal fields the provider needs. */
export interface ToolContextGoal {
  id: string;
  title: string;
  status: string;
  progress: number | null;
  targetDate: string | null;
}

/** Context row for one task: minimal fields the provider needs. */
export interface ToolContextTask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  priority: string | null;
}

/** Planning preferences merged from `user_preferences` + `profiles.timezone`. */
export interface ToolContextPreferences {
  wakeUpTime: string | null;
  sleepTime: string | null;
  workingHours: unknown;
  timezone: string | null;
}

/** Weekly aggregation over the 7-day window (same formulas as Dashboard). */
export interface ToolContextWeeklyProgress {
  total: number;
  completed: number;
  completionRate: number | null;
  overdueCount: number;
  windowDays: number;
  timezone: string;
}

/** Data handed to the provider as context. Never mocked, never inflated. */
export interface ToolContext {
  goals: ToolContextGoal[];
  tasks: ToolContextTask[];
  preferences: ToolContextPreferences | null;
  weeklyProgress: ToolContextWeeklyProgress;
  /** True when the context was cut to fit; the cut is disclosed in metadata. */
  truncated: boolean;
}

/** Active-goal cap (R8: active goals; bound keeps the prompt small). */
export const TOOL_GOALS_LIMIT = 50;
/** Task-context cap (plan R8: 50 tasks, nearest by due_date). */
export const TOOL_TASKS_LIMIT = 50;
/** Weekly window length in days. */
export const TOOL_WEEKLY_WINDOW_DAYS = 7;

export interface ToolQueryResult {
  data: unknown;
  error: unknown;
  /** Exact count for `head: true` count queries; absent for row queries. */
  count?: number | null;
}

export interface ToolQueryBuilder {
  select(columns: string, options?: { count?: string; head?: boolean }): ToolQueryBuilder;
  eq(column: string, value: string): ToolQueryBuilder;
  neq(column: string, value: string): ToolQueryBuilder;
  gte(column: string, value: string): ToolQueryBuilder;
  lte(column: string, value: string): ToolQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): ToolQueryBuilder;
  limit(count: number): ToolQueryBuilder;
  single(): Promise<ToolQueryResult>;
  then<TResult1 = ToolQueryResult, TResult2 = never>(
    onfulfilled?: ((value: ToolQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

/**
 * Minimal surface needed from a user-scoped Supabase client. The client
 * always carries the caller's JWT, so RLS holds and no `user_id` argument
 * is ever accepted from the caller (identity comes from the JWT in
 * `index.ts` via `auth.getUser()`).
 */
export interface UserScopedClient {
  from(table: string): ToolQueryBuilder;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function readNumberField(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapGoalRow(row: unknown): ToolContextGoal | null {
  if (!isRecord(row)) {
    return null;
  }
  const id = readStringField(row, "id");
  const title = readStringField(row, "title");
  const status = readStringField(row, "status");
  if (id === null || title === null || status === null) {
    return null;
  }
  return {
    id,
    title,
    status,
    progress: readNumberField(row, "progress"),
    targetDate: readStringField(row, "target_date"),
  };
}

function mapTaskRow(row: unknown): ToolContextTask | null {
  if (!isRecord(row)) {
    return null;
  }
  const id = readStringField(row, "id");
  const title = readStringField(row, "title");
  const status = readStringField(row, "status");
  if (id === null || title === null || status === null) {
    return null;
  }
  return {
    id,
    title,
    status,
    dueDate: readStringField(row, "due_date"),
    priority: readStringField(row, "priority"),
  };
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date-key arithmetic: `dateKey` shifted by whole days. The weekly cutoff is
 * an operation over the local `todayKey`, never over a UTC instant — at
 * UTC+13/+14 the UTC date is already "yesterday" there.
 */
function shiftDateKey(dateKey: string, deltaDays: number): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  const shifted =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) +
    deltaDays * 86_400_000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** Resolve the caller's timezone, falling back to UTC on garbage. */
function resolveTimezone(raw: unknown, now: Date): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    return "UTC";
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw }).format(now);
    return raw;
  } catch {
    return "UTC";
  }
}

async function fetchGoals(
  client: UserScopedClient,
): Promise<{ goals: ToolContextGoal[]; truncated: boolean }> {
  try {
    const result = await client
      .from("goals")
      .select("id,title,status,progress,target_date")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(TOOL_GOALS_LIMIT + 1);
    if (result.error || !Array.isArray(result.data)) {
      return { goals: [], truncated: false };
    }
    const truncated = result.data.length > TOOL_GOALS_LIMIT;
    const goals: ToolContextGoal[] = [];
    for (const row of result.data.slice(0, TOOL_GOALS_LIMIT)) {
      const mapped = mapGoalRow(row);
      if (mapped !== null) {
        goals.push(mapped);
      }
    }
    return { goals, truncated };
  } catch {
    return { goals: [], truncated: false };
  }
}

async function fetchTasks(
  client: UserScopedClient,
): Promise<{ tasks: ToolContextTask[]; truncated: boolean }> {
  try {
    const result = await client
      .from("tasks")
      .select("id,title,status,due_date,priority")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(TOOL_TASKS_LIMIT + 1);
    if (result.error || !Array.isArray(result.data)) {
      return { tasks: [], truncated: false };
    }
    const truncated = result.data.length > TOOL_TASKS_LIMIT;
    const tasks: ToolContextTask[] = [];
    for (const row of result.data.slice(0, TOOL_TASKS_LIMIT)) {
      const mapped = mapTaskRow(row);
      if (mapped !== null) {
        tasks.push(mapped);
      }
    }
    return { tasks, truncated };
  } catch {
    return { tasks: [], truncated: false };
  }
}

/**
 * Exact task count inside the CLOSED weekly window `[cutoffKey, todayKey]`
 * (`due_date` keys compare lexicographically, so both bounds hold in one
 * range). `total` counts every non-cancelled task, `completed` only the
 * completed ones. `head: true` transfers no rows, so there is no slice to
 * truncate and the percentage cannot skew when the window is large.
 */
async function countWeeklyTasks(
  client: UserScopedClient,
  cutoffKey: string,
  todayKey: string,
  which: "total" | "completed",
): Promise<number> {
  try {
    let query = client
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .gte("due_date", cutoffKey)
      .lte("due_date", todayKey);
    query = which === "total" ? query.neq("status", "cancelled") : query.eq("status", "completed");
    const result = await query;
    if (result.error) {
      return 0;
    }
    if (typeof result.count === "number") {
      return result.count;
    }
    return Array.isArray(result.data) ? result.data.length : 0;
  } catch {
    return 0;
  }
}

async function fetchPreferencesRow(client: UserScopedClient): Promise<Record<string, unknown> | null> {
  try {
    const result = await client
      .from("user_preferences")
      .select("wake_up_time,sleep_time,working_hours")
      .single();
    if (result.error || !isRecord(result.data)) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

async function fetchProfileTimezone(
  client: UserScopedClient,
): Promise<unknown> {
  try {
    const result = await client.from("profiles").select("timezone").single();
    if (result.error || !isRecord(result.data)) {
      return null;
    }
    return result.data["timezone"] ?? null;
  } catch {
    return null;
  }
}

/**
 * Real reads for the four read tools. Identity stays in the JWT/RLS layer:
 * this function takes no `user_id` and applies no cross-tenant filter of its
 * own — the user-scoped client only ever sees the caller's rows.
 */
export async function buildToolContext(
  client: UserScopedClient,
  now: Date = new Date(),
): Promise<ToolContext> {
  // Phase 1 (parallel): everything except the weekly counts. The timezone is
  // resolved BEFORE any window key exists: deriving the cutoff from UTC first
  // shifts the window by a day at UTC+13/+14.
  const [goalsResult, tasksResult, preferencesRow, rawTimezone] = await Promise.all([
    fetchGoals(client),
    fetchTasks(client),
    fetchPreferencesRow(client),
    fetchProfileTimezone(client),
  ]);

  const timezone = resolveTimezone(rawTimezone, now);
  const todayKey = toDateKey(now, timezone);
  const cutoffKey = shiftDateKey(todayKey, -TOOL_WEEKLY_WINDOW_DAYS);

  // Phase 2 (parallel): the closed window `[cutoffKey, todayKey]` keeps far-
  // future tasks out of "weekly"; exact counts need no truncation.
  const [weeklyTotal, weeklyCompleted] = await Promise.all([
    countWeeklyTasks(client, cutoffKey, todayKey, "total"),
    countWeeklyTasks(client, cutoffKey, todayKey, "completed"),
  ]);

  const overdueCount = tasksResult.tasks.filter((task) =>
    isTaskOverdue(
      { dueDate: task.dueDate, status: task.status as TaskStatus },
      now,
      timezone,
    ),
  ).length;

  const preferences: ToolContextPreferences | null =
    preferencesRow === null && rawTimezone === null
      ? null
      : {
          wakeUpTime:
            preferencesRow !== null ? readStringField(preferencesRow, "wake_up_time") : null,
          sleepTime:
            preferencesRow !== null ? readStringField(preferencesRow, "sleep_time") : null,
          workingHours:
            preferencesRow !== null && "working_hours" in preferencesRow
              ? preferencesRow["working_hours"]
              : null,
          timezone: typeof rawTimezone === "string" ? rawTimezone : null,
        };

  return {
    goals: goalsResult.goals,
    tasks: tasksResult.tasks,
    preferences,
    weeklyProgress: {
      total: weeklyTotal,
      completed: weeklyCompleted,
      completionRate: calculateCompletionRate(weeklyCompleted, weeklyTotal),
      overdueCount,
      windowDays: TOOL_WEEKLY_WINDOW_DAYS,
      timezone,
    },
    truncated: goalsResult.truncated || tasksResult.truncated,
  };
}
