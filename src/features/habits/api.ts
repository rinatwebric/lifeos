import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mapHabitLogRowToHabitLog,
  mapHabitRowToHabit,
  mapHabitScheduleVersionRowToHabitScheduleVersion,
  type HabitLogsRow,
  type HabitsRow,
  type HabitScheduleVersionsRow,
} from "@/types/database";
import type { Habit, HabitLog, HabitScheduleVersion, HabitStatus } from "@/types/domain";

import { HabitServiceError, toHabitError } from "./errors";
import {
  createHabitLogSchema,
  createHabitSchema,
  updateHabitLogSchema,
  updateHabitSchema,
  type CreateHabitInput,
  type CreateHabitLogInput,
  type UpdateHabitInput,
  type UpdateHabitLogInput,
} from "./schemas";

/**
 * Identity comes from the local session (`auth.getSession()`), never from
 * a caller-provided `user_id`. RLS (`user_id = auth.uid()`, plus the
 * `EXISTS` ownership guard on log/version writes) is the second layer.
 * History snapshots are written by the `trg_habits_schedule_versioning`
 * trigger in the same transaction — the service never writes versions
 * itself (creation + snapshot and schedule/status change + snapshot are
 * atomic in the DB, migration 0008).
 */
async function requireUserId(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw toHabitError(error);
  }

  if (!data.session?.user) {
    throw new HabitServiceError("forbidden", "Sign in to manage habits.");
  }

  return data.session.user.id;
}

/**
 * Page size for range reads. Lists are fetched page by page until a short
 * page arrives — never silently truncated by a server-side limit.
 */
export const HABIT_PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<PageResult<T>>): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await fetchPage(offset, offset + HABIT_PAGE_SIZE - 1);

    if (error) {
      throw toHabitError(error);
    }

    const rows = data ?? [];
    out.push(...rows);

    if (rows.length < HABIT_PAGE_SIZE) {
      return out;
    }

    offset += HABIT_PAGE_SIZE;
  }
}

function parseOrThrow<T>(parsed: { success: boolean; data?: T; error?: { issues: { message: string }[] } }): T {
  if (!parsed.success || parsed.data === undefined) {
    const message = parsed.error?.issues[0]?.message ?? "Invalid input.";
    throw new HabitServiceError("validation", message);
  }

  return parsed.data;
}

function sortedWeekdays(weekdays: number[] | undefined): number[] | undefined {
  if (weekdays === undefined) {
    return undefined;
  }

  return [...weekdays].sort((a, b) => a - b);
}

export async function listHabits(): Promise<Habit[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const rows = await fetchAllPages<HabitsRow>((from, to) =>
      client
        .from("habits")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as Promise<PageResult<HabitsRow>>,
    );

    return rows.map(mapHabitRowToHabit);
  } catch (error) {
    throw toHabitError(error);
  }
}

export async function getHabit(id: string): Promise<Habit> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("habits")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      throw toHabitError(error);
    }

    if (!data) {
      throw new HabitServiceError("not_found", "Habit not found.");
    }

    return mapHabitRowToHabit(data as HabitsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

export async function createHabit(input: CreateHabitInput): Promise<Habit> {
  try {
    const parsed = parseOrThrow(createHabitSchema.safeParse(input));
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const payload: Omit<HabitsRow, "id" | "created_at" | "updated_at"> = {
      user_id: userId,
      title: parsed.title.trim(),
      description: parsed.description ?? null,
      frequency: parsed.frequency,
      weekdays: sortedWeekdays(parsed.weekdays) ?? [],
      target_count: parsed.targetCount,
      reminder_time: parsed.reminderTime ?? null,
      start_date: parsed.startDate,
      status: parsed.status,
    };

    const { data, error } = await client.from("habits").insert(payload).select().single();

    if (error) {
      throw toHabitError(error);
    }

    return mapHabitRowToHabit(data as HabitsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

/**
 * Partial update. The patch is validated AFTER merging with the stored row:
 * the Zod update schema alone cannot catch cross-field shapes such as
 * `weekdays: []` against a stored `frequency: weekdays`, so the effective
 * post-patch pair decides here. Tracked schedule fields changed through
 * this path write a history snapshot via the DB trigger; renames do not.
 */
export async function updateHabit(id: string, patch: UpdateHabitInput): Promise<Habit> {
  try {
    const parsed = parseOrThrow(updateHabitSchema.safeParse(patch));
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data: stored, error: readError } = await client
      .from("habits")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (readError) {
      throw toHabitError(readError);
    }

    const current = stored as HabitsRow;
    const effectiveFrequency = parsed.frequency ?? current.frequency;
    const effectiveWeekdays = parsed.weekdays ?? current.weekdays;

    if (effectiveFrequency === "weekdays" && effectiveWeekdays.length === 0) {
      throw new HabitServiceError("validation", "Choose at least one weekday.");
    }

    if (parsed.frequency === "weekdays" && parsed.weekdays === undefined) {
      throw new HabitServiceError("validation", "Choose at least one weekday.");
    }

    const payload: Partial<HabitsRow> = {};

    if (parsed.title !== undefined) {
      payload.title = parsed.title.trim();
    }
    if (parsed.description !== undefined) {
      payload.description = parsed.description;
    }
    if (parsed.frequency !== undefined) {
      payload.frequency = parsed.frequency;
    }
    if (parsed.weekdays !== undefined) {
      payload.weekdays = sortedWeekdays(parsed.weekdays) ?? [];
    }
    if (parsed.targetCount !== undefined) {
      payload.target_count = parsed.targetCount;
    }
    if (parsed.reminderTime !== undefined) {
      payload.reminder_time = parsed.reminderTime;
    }
    if (parsed.startDate !== undefined) {
      payload.start_date = parsed.startDate;
    }
    if (parsed.status !== undefined) {
      payload.status = parsed.status;
    }

    if (Object.keys(payload).length === 0) {
      return mapHabitRowToHabit(current);
    }

    const { data, error } = await client
      .from("habits")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toHabitError(error);
    }

    return mapHabitRowToHabit(data as HabitsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

/**
 * Status switch for pause/resume/archive. Logs are never touched (the
 * schema keeps them); the DB trigger appends a history snapshot.
 */
export async function setHabitStatus(id: string, status: HabitStatus): Promise<Habit> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("habits")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toHabitError(error);
    }

    return mapHabitRowToHabit(data as HabitsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

/** Hard delete: logs and versions cascade (a log/version without its habit is meaningless). */
export async function deleteHabit(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { error } = await client.from("habits").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw toHabitError(error);
    }
  } catch (error) {
    throw toHabitError(error);
  }
}

export async function listHabitLogs(
  habitId: string,
  range?: { from?: string; to?: string },
): Promise<HabitLog[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const rows = await fetchAllPages<HabitLogsRow>((from, to) => {
      let query = client
        .from("habit_logs")
        .select("*")
        .eq("habit_id", habitId)
        .eq("user_id", userId);

      if (range?.from) {
        query = query.gte("log_date", range.from);
      }
      if (range?.to) {
        query = query.lte("log_date", range.to);
      }

      return query.order("log_date", { ascending: true }).range(from, to) as unknown as Promise<
        PageResult<HabitLogsRow>
      >;
    });

    return rows.map(mapHabitLogRowToHabitLog);
  } catch (error) {
    throw toHabitError(error);
  }
}

/** All of the owner's logs in a date range — one paginated query shape, no N+1. */
export async function listHabitLogsRange(range: { from: string; to: string }): Promise<HabitLog[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const rows = await fetchAllPages<HabitLogsRow>((from, to) =>
      client
        .from("habit_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("log_date", range.from)
        .lte("log_date", range.to)
        .order("log_date", { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<HabitLogsRow>>,
    );

    return rows.map(mapHabitLogRowToHabitLog);
  } catch (error) {
    throw toHabitError(error);
  }
}

export async function getHabitLog(id: string): Promise<HabitLog> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("habit_logs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      throw toHabitError(error);
    }

    if (!data) {
      throw new HabitServiceError("not_found", "Habit log not found.");
    }

    return mapHabitLogRowToHabitLog(data as HabitLogsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

/**
 * Idempotent daily log: one row per habit per day (`UNIQUE
 * (habit_id, log_date)`), so a repeat write upserts instead of
 * duplicating. The habit is read first — a foreign id reads as missing
 * under RLS and fails before any write.
 */
export async function logHabit(input: CreateHabitLogInput): Promise<HabitLog> {
  try {
    const parsed = parseOrThrow(createHabitLogSchema.safeParse(input));
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { error: habitError } = await client
      .from("habits")
      .select("id")
      .eq("id", parsed.habitId)
      .eq("user_id", userId)
      .single();

    if (habitError) {
      throw toHabitError(habitError);
    }

    const payload: Omit<HabitLogsRow, "id" | "created_at" | "updated_at"> = {
      user_id: userId,
      habit_id: parsed.habitId,
      log_date: parsed.logDate,
      completed_count: parsed.completedCount,
      note: parsed.note ?? null,
    };

    const { data, error } = await client
      .from("habit_logs")
      .upsert(payload, { onConflict: "habit_id,log_date" })
      .select()
      .single();

    if (error) {
      throw toHabitError(error);
    }

    return mapHabitLogRowToHabitLog(data as HabitLogsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

/** Correct a log's count or comment. Logs never move between habits. */
export async function updateHabitLog(id: string, patch: UpdateHabitLogInput): Promise<HabitLog> {
  try {
    const parsed = parseOrThrow(updateHabitLogSchema.safeParse(patch));
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const payload: Partial<HabitLogsRow> = {};

    if (parsed.completedCount !== undefined) {
      payload.completed_count = parsed.completedCount;
    }
    if (parsed.note !== undefined) {
      payload.note = parsed.note;
    }

    if (Object.keys(payload).length === 0) {
      return getHabitLog(id);
    }

    const { data, error } = await client
      .from("habit_logs")
      .update(payload)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw toHabitError(error);
    }

    return mapHabitLogRowToHabitLog(data as HabitLogsRow);
  } catch (error) {
    throw toHabitError(error);
  }
}

export async function deleteHabitLog(id: string): Promise<void> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { error } = await client.from("habit_logs").delete().eq("id", id).eq("user_id", userId);

    if (error) {
      throw toHabitError(error);
    }
  } catch (error) {
    throw toHabitError(error);
  }
}

/** Snapshots for one habit, oldest first. Read-only: the DB trigger owns writes. */
export async function listHabitVersions(habitId: string): Promise<HabitScheduleVersion[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const rows = await fetchAllPages<HabitScheduleVersionsRow>((from, to) =>
      client
        .from("habit_schedule_versions")
        .select("*")
        .eq("habit_id", habitId)
        .eq("user_id", userId)
        .order("effective_from", { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<HabitScheduleVersionsRow>>,
    );

    return rows.map(mapHabitScheduleVersionRowToHabitScheduleVersion);
  } catch (error) {
    throw toHabitError(error);
  }
}

/** Every snapshot of the owner in one query — stats never read versions in a loop. */
export async function listAllHabitVersions(): Promise<HabitScheduleVersion[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const rows = await fetchAllPages<HabitScheduleVersionsRow>((from, to) =>
      client
        .from("habit_schedule_versions")
        .select("*")
        .eq("user_id", userId)
        .order("effective_from", { ascending: true })
        .range(from, to) as unknown as Promise<PageResult<HabitScheduleVersionsRow>>,
    );

    return rows.map(mapHabitScheduleVersionRowToHabitScheduleVersion);
  } catch (error) {
    throw toHabitError(error);
  }
}
