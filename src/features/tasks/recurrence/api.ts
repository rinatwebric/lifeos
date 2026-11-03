import { getSupabaseClient } from "@/lib/supabase/client";
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

function todayKeyUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
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

/**
 * Service-level belonging rule (same as tasks Unit 5): when both `goalId`
 * and `milestoneId` are set, the milestone must belong to that goal. There
 * is intentionally no such constraint in the database — the service reads
 * the milestone and compares `goal_id` before writing.
 */
async function assertMilestoneBelongsToGoal(
  goalId: string | null,
  milestoneId: string | null,
  userId: string,
): Promise<void> {
  if (goalId === null || milestoneId === null) {
    return;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("milestones")
    .select("goal_id")
    .eq("id", milestoneId)
    .eq("user_id", userId)
    .single();

  if (error) {
    const mapped = toRecurrenceError(error);
    if (mapped.code === "network") {
      throw mapped;
    }
    throw new RecurrenceServiceError(
      "validation",
      "The selected milestone was not found. Please reload and choose another one.",
    );
  }

  const row = data as unknown as { goal_id: string };
  if (row.goal_id !== goalId) {
    throw new RecurrenceServiceError(
      "validation",
      "The selected milestone does not belong to the selected goal. Choose a milestone from this goal or clear it.",
    );
  }
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
 * retry or a second device never duplicates.
 */
export async function createRecurringTask(input: CreateRecurringTaskInput): Promise<CreateRecurringTaskResult> {
  try {
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

    const today = todayKeyUTC();
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

    const payloads: TaskInsertPayload[] = dates.map((dueDate) => ({
      user_id: userId,
      title,
      description: input.task.description ?? null,
      priority: input.task.priority,
      status: "todo",
      due_date: dueDate,
      scheduled_start: null,
      scheduled_end: null,
      estimated_duration_minutes: input.task.estimatedDurationMinutes ?? null,
      goal_id: input.task.goalId ?? null,
      milestone_id: input.task.milestoneId ?? null,
      completed_at: null,
      recurrence_rule_id: rule.id,
    }));

    const created = await insertTasksIgnoreConflicts(payloads);

    return { rule, created };
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

export async function updateRecurrenceRule(
  id: string,
  patch: UpdateRecurrenceRuleInput,
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
    await topUpRecurrenceInstances(rule.id);

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

/**
 * Eager top-up for one rule: generates dates for
 * `[today, today + horizonDays)` intersected with the rule window and
 * inserts only future dates not already present, in one batch.
 *
 * Idempotency comes from the read-then-insert pre-filter (a second call
 * finds nothing missing and writes nothing) plus unique-violation
 * tolerance for a concurrent second device — same observable guarantee as
 * `ON CONFLICT DO NOTHING` on `(recurrence_rule_id, due_date)`, which
 * PostgREST cannot express against the partial index (42P10, see
 * `insertTasksIgnoreConflicts`).
 *
 * The template (title/description/priority/links) is copied from the
 * earliest attached instance, so the login-time top-up needs no UI input.
 * Returns the number of rows actually inserted (0 when already up to date —
 * the idempotency proof: a second call creates 0 rows).
 */
export async function topUpRecurrenceInstances(
  ruleId: string,
  horizonDays: number = RECURRENCE_TOP_UP_DEFAULT_DAYS,
): Promise<number> {
  try {
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

    const today = todayKeyUTC();
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
      .order("due_date", { ascending: true })
      .limit(1);

    if (templateError) {
      throw toRecurrenceError(templateError);
    }

    const template = ((templateRows as TasksRow[] | null) ?? [])[0];

    if (!template) {
      return 0;
    }

    const payloads: TaskInsertPayload[] = missing.map((dueDate) => ({
      user_id: userId,
      title: template.title,
      description: template.description,
      priority: template.priority,
      status: "todo",
      due_date: dueDate,
      scheduled_start: null,
      scheduled_end: null,
      estimated_duration_minutes: template.estimated_duration_minutes,
      goal_id: template.goal_id,
      milestone_id: template.milestone_id,
      completed_at: null,
      recurrence_rule_id: ruleId,
    }));

    return insertTasksIgnoreConflicts(payloads);
  } catch (error) {
    throw toRecurrenceError(error);
  }
}

/**
 * Login-time top-up: refreshes every active rule of the current user.
 * Best-effort per rule (one broken rule never blocks the others); returns
 * the total number of rows inserted across all rules.
 */
export async function topUpAllActiveRecurrenceInstances(
  horizonDays: number = RECURRENCE_TOP_UP_DEFAULT_DAYS,
): Promise<number> {
  const rules = await listRecurrenceRules();
  let total = 0;

  for (const rule of rules) {
    if (!rule.isActive) {
      continue;
    }
    try {
      total += await topUpRecurrenceInstances(rule.id, horizonDays);
    } catch {
      continue;
    }
  }

  return total;
}
