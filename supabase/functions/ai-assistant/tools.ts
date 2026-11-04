/**
 * Tool-layer reads (iteration 5, step 4; PRD section 6.4).
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
 * One request per entity, no N+1: goals (1), tasks (1), weekly window (1),
 * preferences (1), profile timezone (1), all dispatched in parallel.
 * Truncation is disclosed via `truncated` and mirrored into the persisted
 * message `metadata` by `index.ts`.
 */

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
/** Weekly-window cap: bounds the pre-filter, overflow sets `truncated`. */
export const TOOL_WEEKLY_LIMIT = 200;

export interface ToolQueryBuilder {
  select(columns: string, options?: { count?: string; head?: boolean }): ToolQueryBuilder;
  eq(column: string, value: string): ToolQueryBuilder;
  gte(column: string, value: string): ToolQueryBuilder;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): ToolQueryBuilder;
  limit(count: number): ToolQueryBuilder;
  single(): Promise<{ data: unknown; error: unknown }>;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
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

interface WeeklyRow {
  status: string;
  dueDate: string | null;
}

function mapWeeklyRow(row: unknown): WeeklyRow | null {
  if (!isRecord(row)) {
    return null;
  }
  const status = readStringField(row, "status");
  if (status === null) {
    return null;
  }
  return { status, dueDate: readStringField(row, "due_date") };
}

/** Calendar date (YYYY-MM-DD) in the given IANA zone (same as src/lib/dates). */
function toDateKeyInTimezone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC date key for the weekly pre-filter (timezone refinement happens after). */
function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Completed / total × 100, or null when nothing was planned (src/lib/progress). */
function completionRate(completed: number, total: number): number | null {
  if (total <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
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

/**
 * Open + strictly before today in the caller's zone (derived overdue, never
 * a stored status — same rule as `isTaskOverdue` in src/lib/dates.ts).
 */
function isOverdue(dueDate: string | null, status: string, todayKey: string): boolean {
  if (dueDate === null || status === "completed" || status === "cancelled") {
    return false;
  }
  return dueDate < todayKey;
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

async function fetchWeeklyRows(
  client: UserScopedClient,
  cutoffKey: string,
): Promise<{ rows: WeeklyRow[]; truncated: boolean }> {
  try {
    const result = await client
      .from("tasks")
      .select("id,status,due_date")
      .gte("due_date", cutoffKey)
      .limit(TOOL_WEEKLY_LIMIT + 1);
    if (result.error || !Array.isArray(result.data)) {
      return { rows: [], truncated: false };
    }
    const truncated = result.data.length > TOOL_WEEKLY_LIMIT;
    const rows: WeeklyRow[] = [];
    for (const row of result.data.slice(0, TOOL_WEEKLY_LIMIT)) {
      const mapped = mapWeeklyRow(row);
      if (mapped !== null) {
        rows.push(mapped);
      }
    }
    return { rows, truncated };
  } catch {
    return { rows: [], truncated: false };
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
  const cutoffKey = utcDateKey(new Date(now.getTime() - TOOL_WEEKLY_WINDOW_DAYS * 86_400_000));
  const [goalsResult, tasksResult, weeklyResult, preferencesRow, rawTimezone] = await Promise.all([
    fetchGoals(client),
    fetchTasks(client),
    fetchWeeklyRows(client, cutoffKey),
    fetchPreferencesRow(client),
    fetchProfileTimezone(client),
  ]);

  const timezone = resolveTimezone(rawTimezone, now);
  const todayKey = toDateKeyInTimezone(now, timezone);

  const weeklyTotal = weeklyResult.rows.filter((row) => row.status !== "cancelled").length;
  const weeklyCompleted = weeklyResult.rows.filter((row) => row.status === "completed").length;
  const overdueCount = tasksResult.tasks.filter((task) =>
    isOverdue(task.dueDate, task.status, todayKey),
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
      completionRate: completionRate(weeklyCompleted, weeklyTotal),
      overdueCount,
      windowDays: TOOL_WEEKLY_WINDOW_DAYS,
      timezone,
    },
    truncated: goalsResult.truncated || tasksResult.truncated || weeklyResult.truncated,
  };
}
