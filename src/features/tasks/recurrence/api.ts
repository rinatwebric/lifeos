import { getSupabaseClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/dates";
import { expandRecurrenceDates, RECURRENCE_HORIZON_DAYS } from "@/lib/recurrence";
import {
  mapRecurrenceRuleRowToRecurrenceRule,
  type RecurrenceRulesRow,
  type TasksRow,
} from "@/types/database";
import type {
  Priority,
  RecurrenceFrequency,
  RecurrenceRule,
  TaskStatus,
} from "@/types/domain";

import { assertMilestoneBelongsToGoal } from "../api";
import { RECURRENCE_ERROR_MESSAGES, RecurrenceServiceError, toRecurrenceError } from "./errors";
import { recurrenceRuleSchema, type UpdateRecurrenceRuleInput } from "./schema";

/** Source of truth for the horizon: 30 days ahead on save + top-up on login. */
export const RECURRENCE_TOP_UP_DEFAULT_DAYS = RECURRENCE_HORIZON_DAYS;

export type { CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput } from "./schema";

export interface RecurringTaskTemplate {
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  estimatedDurationMinutes: number | null;
  goalId: string | null;
  milestoneId: string | null;
}

export interface CreateRecurringTaskInput {
  task: RecurringTaskTemplate;
  recurrence: {
    frequency: RecurrenceFrequency;
    weekdays?: number[];
    intervalValue?: number;
    endDate?: string | null;
  };
}

export interface CreateRecurringTaskOptions {
  timeZone?: string;
  now?: Date;
}

export interface TopUpRecurrenceOptions {
  horizonDays?: number;
  timeZone?: string;
  now?: Date;
}

export interface TopUpAllOptions {
  horizonDays?: number;
  timeZone?: string;
  now?: Date;
}

export interface UpdateRecurrenceRuleOptions {
  horizonDays?: number;
  timeZone?: string;
  now?: Date;
}

export interface CreateRecurringTaskResult {
  rule: RecurrenceRule;
  created: number;
}

/**
 * Identity comes from the local session (`auth.getSession()`), never from
 * a caller-provided `user_id`. RLS (`user_id = auth.uid()`) is the second
 * layer. No function here accepts a `user_id` argument.
 */
async function requireUserId(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw toRecurrenceError(error);
  }

  if (!data.session?.user) {
    throw new RecurrenceServiceError("forbidden", RECURRENCE_ERROR_MESSAGES.forbidden);
  }

  return data.session.user.id;
}

const DAY_MS = 86_400_000;

function resolveTopUp(
  arg?: number | TopUpRecurrenceOptions,
): { horizonDays: number; timeZone: string; now: Date } {
  if (typeof arg === "number") {
    return { horizonDays: arg, timeZone: "UTC", now: new Date() };
  }
  return {
    horizonDays: arg?.horizonDays ?? RECURRENCE_TOP_UP_DEFAULT_DAYS,
    timeZone: arg?.timeZone ?? "UTC",
    now: arg?.now ?? new Date(),
  };
}

function resolveTopUpAll(
  arg?: number | TopUpAllOptions,
): { horizonDays: number; timeZone: string; now: Date } {
  return resolveTopUp(arg);
}

function resolveCreateOptions(arg?: CreateRecurringTaskOptions): {
  timeZone: string;
  now: Date;
} {
  return {
    timeZone: arg?.timeZone ?? "UTC",
    now: arg?.now ?? new Date(),
  };
}

function todayInZone(now: Date, timeZone: string): string {
  try {
    return toDateKey(now, timeZone);
  } catch {
    return toDateKey(now, "UTC");
  }
}

/** Whole-day distance between two YYYY-MM-DD keys (UTC midnight based). */
function diffDateKeys(fromKey: string, toKey: string): number {
  const fromMs = Date.parse(`${fromKey}T00:00:00Z`);
  const toMs = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return 0;
  }
  return Math.round((toMs - fromMs) / DAY_MS);
}

/**
 * Shifts a stored UTC ISO timestamp by whole days, preserving the duration
 * when applied equally to start and end. Fixed 86_400_000 ms per day:
 * DST transitions are intentionally not compensated (wall time may shift by
 * 1h across a DST boundary — documented in docs/plan.md), absolute duration
 * is always preserved.
 */
function shiftIsoByDays(iso: string | null, deltaDays: number): string | null {
  if (iso === null) {
    return null;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return iso;
  }
  if (deltaDays === 0) {
    return iso;
  }
  return new Date(ms + deltaDays * DAY_MS).toISOString();
}

function uniqueWeekdays(weekdays: number[]): number[] {
  const seen = new Set<number>();
  for (const day of weekdays) {
    if (Number.isInteger(day) && day >= 0 && day <= 6) {
      seen.add(day);
    }
  }
  return [...seen].sort((a, b) => a - b);
}

type TaskInsertPayload = Omit<TasksRow, "id" | "created_at" | "updated_at">;

/**
 * Batch insert with unique-violation tolerance.
 *
 * Why plain `insert` and not `upsert(..., { onConflict })`: the idempotency
 * index `uq_tasks_recurrence_instance` is partial
 * (`WHERE recurrence_rule_id IS NOT NULL`), and Postgres rejects
 * `ON CONFLICT (recurrence_rule_id, due_date)` without the matching
 * `WHERE` predicate (42P10, verified live). PostgREST cannot express the
 * predicate, so the observable contract — one row per (rule, date), second
 * call inserts 0 — is enforced by read-then-insert (callers pre-filter
 * existing dates and skip the write entirely when nothing is missing) plus
 * this fallback: a concurrent device winning the race surfaces as 23505,
 * and only then do we retry row-by-row ignoring conflicts.
 */
async function insertTasksIgnoreConflicts(payloads: TaskInsertPayload[]): Promise<number> {
  if (payloads.length === 0) {
    return 0;
  }

  const client = getSupabaseClient();
  const { data, error } = await client.from("tasks").insert(payloads).select();

  if (!error) {
    return (data as TasksRow[] | null)?.length ?? 0;
  }

  const mapped = toRecurrenceError(error);
  if (mapped.code !== "conflict") {
    throw mapped;
  }

  let created = 0;
  for (const row of payloads) {
    const { data: single, error: singleError } = await client
      .from("tasks")
      .insert(row)
      .select();

    if (!singleError) {
      created += (single as TasksRow[] | null)?.length ?? 0;
      continue;
    }

    const singleMapped = toRecurrenceError(singleError);
    if (singleMapped.code === "conflict") {
      continue;
    }
    throw singleMapped;
  }

  return created;
}

export async function listRecurrenceRules(): Promise<RecurrenceRule[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("recurrence_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw toRecurrenceError(error);
    }

    return (data as RecurrenceRulesRow[]).map(mapRecurrenceRuleRowToRecurrenceRule);
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

export async function createRecurrenceRule(input: {
  frequency: RecurrenceFrequency;
  weekdays?: number[];
  intervalValue?: number;
  startDate: string;
  endDate?: string | null;
  isActive?: boolean;
}): Promise<RecurrenceRule> {
  try {
    const parsed = recurrenceRuleSchema.safeParse({
      frequency: input.frequency,
      weekdays: input.weekdays ?? [],
      intervalValue: input.intervalValue ?? 1,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      isActive: input.isActive ?? true,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new RecurrenceServiceError(
        "validation",
        first?.message ?? RECURRENCE_ERROR_MESSAGES.validation,
      );
    }

    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("recurrence_rules")
      .insert({
        user_id: userId,
        frequency: parsed.data.frequency,
        weekdays: uniqueWeekdays(parsed.data.weekdays),
        interval_value: parsed.data.intervalValue,
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate ?? null,
        is_active: parsed.data.isActive,
      })
      .select()
      .single();

    if (error) {
      throw toRecurrenceError(error);
    }

    return mapRecurrenceRuleRowToRecurrenceRule(data as RecurrenceRulesRow);
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

/**
 * Creates a rule plus its eager instances in one call (TaskFormDialog
 * "Repeat" path). The template comes from the task form; generated
 * instances copy title/description/priority/links and reset status to
 * `todo`. Only future dates inside `[startDate, endDate]` are inserted,
 * in one batch; a concurrent second device is absorbed row-by-row, so a
 * retry or a second device never duplicates. Scheduled times are shifted
 * by whole days relative to the anchor due date so every instance keeps
 * the template's wall times (09:00–10:00 on D → 09:00–10:00 on D+7,
 * DST transitions excepted — see `shiftIsoByDays`).
 */
export async function createRecurringTask(
  input: CreateRecurringTaskInput,
  options?: CreateRecurringTaskOptions,
): Promise<CreateRecurringTaskResult> {
  try {
    const { timeZone, now } = resolveCreateOptions(options);
    const userId = await requireUserId();
    const title = input.task.title.trim();

    if (title.length === 0) {
      throw new RecurrenceServiceError("validation", "Title is required.");
    }
    if (title.length > 200) {
      throw new RecurrenceServiceError(
        "validation",
        "Title must be 200 characters or fewer.",
      );
    }

    if (input.task.goalId === null && input.task.milestoneId !== null) {
      throw new RecurrenceServiceError(
        "validation",
        "Select a goal before choosing a milestone, or clear the milestone.",
      );
    }
    await assertMilestoneBelongsToGoal(
      input.task.goalId ?? null,
      input.task.milestoneId ?? null,
      userId,
    );

    const today = todayInZone(now, timeZone);
    const startDate = input.task.dueDate ?? today;
    const parsed = recurrenceRuleSchema.safeParse({
      frequency: input.recurrence.frequency,
      weekdays: input.recurrence.weekdays ?? [],
      intervalValue: input.recurrence.intervalValue ?? 1,
      startDate,
      endDate: input.recurrence.endDate ?? null,
      isActive: true,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new RecurrenceServiceError(
        "validation",
        first?.message ?? RECURRENCE_ERROR_MESSAGES.validation,
      );
    }

    const client = getSupabaseClient();
    const { data: ruleRow, error: ruleError } = await client
      .from("recurrence_rules")
      .insert({
        user_id: userId,
        frequency: parsed.data.frequency,
        weekdays: uniqueWeekdays(parsed.data.weekdays),
        interval_value: parsed.data.intervalValue,
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (ruleError) {
      throw toRecurrenceError(ruleError);
    }

    const rule = mapRecurrenceRuleRowToRecurrenceRule(ruleRow as RecurrenceRulesRow);
    const dates = expandRecurrenceDates(rule, today, RECURRENCE_HORIZON_DAYS);

    if (dates.length === 0) {
      return { rule, created: 0 };
    }

    const anchor = startDate;
    const payloads: TaskInsertPayload[] = dates.map((dueDate) => {
      const delta = diffDateKeys(anchor, dueDate);
      return {
        user_id: userId,
        title,
        description: input.task.description ?? null,
        priority: input.task.priority,
        status: "todo",
        due_date: dueDate,
        scheduled_start: shiftIsoByDays(input.task.scheduledStart ?? null, delta),
        scheduled_end: shiftIsoByDays(input.task.scheduledEnd ?? null, delta),
        estimated_duration_minutes: input.task.estimatedDurationMinutes ?? null,
        goal_id: input.task.goalId ?? null,
        milestone_id: input.task.milestoneId ?? null,
        completed_at: null,
        recurrence_rule_id: rule.id,
      };
    });

    const created = await insertTasksIgnoreConflicts(payloads);

    return { rule, created };
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

export async function updateRecurrenceRule(
  id: string,
  patch: UpdateRecurrenceRuleInput,
  options?: number | TopUpRecurrenceOptions,
): Promise<RecurrenceRule> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const payload: Partial<{
      frequency: RecurrenceFrequency;
      weekdays: number[];
      interval_value: number;
      start_date: string;
      end_date: string | null;
      is_active: boolean;
    }> = {};

    if (patch.frequency !== undefined) {
      payload.frequency = patch.frequency;
    }
    if (patch.weekdays !== undefined) {
      payload.weekdays = uniqueWeekdays(patch.weekdays);
    }
    if (patch.intervalValue !== undefined) {
      payload.interval_value = patch.intervalValue;
    }
    if (patch.startDate !== undefined) {
      payload.start_date = patch.startDate;
    }
    if (patch.endDate !== undefined) {
      payload.end_date = patch.endDate;
    }
    if (patch.isActive !== undefined) {
      payload.is_active = patch.isActive;
    }

    if (Object.keys(payload).length === 0) {
      const { data, error } = await client
        .from("recurrence_rules")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) {
        throw toRecurrenceError(error);
      }
      return mapRecurrenceRuleRowToRecurrenceRule(data as RecurrenceRulesRow);
    }

    const { data, error } = await client
      .from("recurrence_rules")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toRecurrenceError(error);
    }

    const rule = mapRecurrenceRuleRowToRecurrenceRule(data as RecurrenceRulesRow);

    // A rule edit only affects future dates not yet materialised: created
    // instances are never regenerated or deleted, the top-up below inserts
    // only missing future dates.
    await topUpRecurrenceInstances(rule.id, options);

    return rule;
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

export async function deactivateRecurrenceRule(id: string): Promise<RecurrenceRule> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("recurrence_rules")
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toRecurrenceError(error);
    }

    return mapRecurrenceRuleRowToRecurrenceRule(data as RecurrenceRulesRow);
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

/**
 * Deletes the rule. Existing instances stay (history) with
 * `recurrence_rule_id = NULL` via the FK `ON DELETE SET NULL` in 0004.
 */
export async function deleteRecurrenceRule(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { error } = await client
      .from("recurrence_rules")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw toRecurrenceError(error);
    }
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

function buildInstancePayload(
  userId: string,
  ruleId: string,
  dueDate: string,
  template: TasksRow,
  anchorDueDate: string | null,
): TaskInsertPayload {
  const delta = anchorDueDate ? diffDateKeys(anchorDueDate, dueDate) : 0;
  return {
    user_id: userId,
    title: template.title,
    description: template.description,
    priority: template.priority,
    status: "todo",
    due_date: dueDate,
    scheduled_start: shiftIsoByDays(template.scheduled_start, delta),
    scheduled_end: shiftIsoByDays(template.scheduled_end, delta),
    estimated_duration_minutes: template.estimated_duration_minutes,
    goal_id: template.goal_id,
    milestone_id: template.milestone_id,
    completed_at: null,
    recurrence_rule_id: ruleId,
  };
}

/**
 * Eager top-up for one rule: generates dates for
 * `[today, today + horizonDays)` intersected with the rule window and
 * inserts only future dates not already present, in one batch. `today`
 * is the calendar date in `timeZone` (via `toDateKey`), never UTC.
 *
 * Idempotency comes from the read-then-insert pre-filter (a second call
 * finds nothing missing and writes nothing) plus unique-violation
 * tolerance for a concurrent second device — same observable guarantee as
 * `ON CONFLICT DO NOTHING` on `(recurrence_rule_id, due_date)`, which
 * PostgREST cannot express against the partial index (42P10, see
 * `insertTasksIgnoreConflicts`).
 *
 * The template is the most recently created attached instance
 * (`created_at` desc): instance edits detach (`recurrence_rule_id = NULL`),
 * so every attached row carries identical series fields and any survivor
 * can anchor the series — deleting the earliest date never blocks the
 * top-up. Scheduled times shift by whole days from the template's due
 * date so duration is preserved.
 * Returns the number of rows actually inserted (0 when already up to date —
 * the idempotency proof: a second call creates 0 rows).
 */
export async function topUpRecurrenceInstances(
  ruleId: string,
  arg?: number | TopUpRecurrenceOptions,
): Promise<number> {
  try {
    const { horizonDays, timeZone, now } = resolveTopUp(arg);
    if (horizonDays <= 0) {
      return 0;
    }

    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data: ruleRow, error: ruleError } = await client
      .from("recurrence_rules")
      .select("*")
      .eq("id", ruleId)
      .eq("user_id", userId)
      .single();

    if (ruleError) {
      throw toRecurrenceError(ruleError);
    }

    const rule = mapRecurrenceRuleRowToRecurrenceRule(ruleRow as RecurrenceRulesRow);

    if (!rule.isActive) {
      return 0;
    }

    const today = todayInZone(now, timeZone);
    const dates = expandRecurrenceDates(rule, today, Math.floor(horizonDays));

    if (dates.length === 0) {
      return 0;
    }

    const { data: existingRows, error: existingError } = await client
      .from("tasks")
      .select("due_date")
      .eq("recurrence_rule_id", ruleId)
      .eq("user_id", userId);

    if (existingError) {
      throw toRecurrenceError(existingError);
    }

    const existing = new Set(
      ((existingRows as Array<{ due_date: string | null }> | null) ?? []).map(
        (row) => row.due_date,
      ),
    );
    const missing = dates.filter((date) => !existing.has(date));

    if (missing.length === 0) {
      return 0;
    }

    const { data: templateRows, error: templateError } = await client
      .from("tasks")
      .select("*")
      .eq("recurrence_rule_id", ruleId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (templateError) {
      throw toRecurrenceError(templateError);
    }

    const template = ((templateRows as TasksRow[] | null) ?? [])[0];

    if (!template) {
      return 0;
    }

    const payloads: TaskInsertPayload[] = missing.map((dueDate) =>
      buildInstancePayload(userId, ruleId, dueDate, template, template.due_date),
    );

    return insertTasksIgnoreConflicts(payloads);
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

/**
 * Login-time top-up: refreshes every active rule of the current user.
 * Best-effort per rule (one broken rule never blocks the others); returns
 * the total number of rows inserted across all rules.
 *
 * Batched: existing dates for all active rules come from one `.in(...)`
 * query, templates from a second `.in(...)` query (grouped in memory by
 * `recurrence_rule_id`, latest `created_at` wins), then a single batch
 * insert for every missing date. Cost is constant in the rule count —
 * never N+1. `today` is computed once via `toDateKey(now, timeZone)` for
 * the whole pass so a midnight crossing cannot split the series.
 */
export async function topUpAllActiveRecurrenceInstances(
  arg?: number | TopUpAllOptions,
): Promise<number> {
  const { horizonDays, timeZone, now } = resolveTopUpAll(arg);
  if (horizonDays <= 0) {
    return 0;
  }

  const rules = await listRecurrenceRules();
  const active = rules.filter((rule) => rule.isActive);
  if (active.length === 0) {
    return 0;
  }

  const today = todayInZone(now, timeZone);
  const horizon = Math.floor(horizonDays);

  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();
    const ruleIds = active.map((rule) => rule.id);

    const { data: existingRows, error: existingError } = await client
      .from("tasks")
      .select("due_date, recurrence_rule_id")
      .eq("user_id", userId)
      .in("recurrence_rule_id", ruleIds);

    if (existingError) {
      throw toRecurrenceError(existingError);
    }

    const existingByRule = new Map<string, Set<string | null>>();
    for (const row of ((existingRows as Array<{
      due_date: string | null;
      recurrence_rule_id: string | null;
    }> | null) ?? [])) {
      if (!row.recurrence_rule_id) {
        continue;
      }
      let set = existingByRule.get(row.recurrence_rule_id);
      if (!set) {
        set = new Set();
        existingByRule.set(row.recurrence_rule_id, set);
      }
      set.add(row.due_date);
    }

    const { data: templateRows, error: templateError } = await client
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .in("recurrence_rule_id", ruleIds)
      .order("created_at", { ascending: false });

    if (templateError) {
      throw toRecurrenceError(templateError);
    }

    const templateByRule = new Map<string, TasksRow>();
    for (const row of ((templateRows as TasksRow[] | null) ?? [])) {
      const key = row.recurrence_rule_id;
      if (!key || templateByRule.has(key)) {
        continue;
      }
      templateByRule.set(key, row);
    }

    const payloads: TaskInsertPayload[] = [];
    for (const rule of active) {
      try {
        const dates = expandRecurrenceDates(rule, today, horizon);
        if (dates.length === 0) {
          continue;
        }
        const existing = existingByRule.get(rule.id);
        const missing = existing ? dates.filter((date) => !existing.has(date)) : dates;
        if (missing.length === 0) {
          continue;
        }
        const template = templateByRule.get(rule.id);
        if (!template) {
          continue;
        }
        for (const dueDate of missing) {
          payloads.push(
            buildInstancePayload(userId, rule.id, dueDate, template, template.due_date),
          );
        }
      } catch {
        continue;
      }
    }

    return insertTasksIgnoreConflicts(payloads);
  } catch (error) {
    throw toRecurrenceError(error);
  }
}
