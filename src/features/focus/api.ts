import { getSupabaseClient } from "@/lib/supabase/client";
import { mapFocusSessionRowToFocusSession, type FocusSessionsRow } from "@/types/database";
import type { FocusSession } from "@/types/domain";

import { FocusServiceError, FOCUS_ERROR_MESSAGES, toFocusError } from "./errors";

const FOCUS_SELECT = "*, task:tasks(id,title)";

async function requireUserId(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw toFocusError(error);
  }
  if (!data.user) {
    throw new FocusServiceError("forbidden", FOCUS_ERROR_MESSAGES.forbidden);
  }
  return data.user.id;
}

function mapRow(row: unknown): FocusSession {
  return mapFocusSessionRowToFocusSession(row as FocusSessionsRow);
}

export async function getActiveFocusSession(): Promise<FocusSession | null> {
  try {
    const client = getSupabaseClient();
    const userId = await requireUserId();
    const { data, error } = await client
      .from("focus_sessions")
      .select(FOCUS_SELECT)
      .eq("user_id", userId)
      .is("ended_at", null)
      .maybeSingle();

    if (error) throw toFocusError(error);
    return data ? mapRow(data) : null;
  } catch (error) {
    throw toFocusError(error);
  }
}

export interface StartFocusInput {
  taskId: string;
  plannedMinutes: number;
}

export async function startFocusSession(input: StartFocusInput): Promise<FocusSession> {
  try {
    const client = getSupabaseClient();
    const userId = await requireUserId();
    const { data, error } = await client
      .from("focus_sessions")
      .insert({
        user_id: userId,
        task_id: input.taskId,
        planned_minutes: input.plannedMinutes,
      })
      .select(FOCUS_SELECT)
      .single();

    if (error) throw toFocusError(error);
    return mapRow(data);
  } catch (error) {
    throw toFocusError(error);
  }
}

async function getFocusSession(id: string, userId: string): Promise<FocusSession> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("focus_sessions")
    .select(FOCUS_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw toFocusError(error);
  if (!data) {
    throw new FocusServiceError("not_found", FOCUS_ERROR_MESSAGES.not_found);
  }
  return mapRow(data);
}

export async function pauseFocusSession(id: string): Promise<FocusSession> {
  try {
    const client = getSupabaseClient();
    const userId = await requireUserId();
    const { data, error } = await client
      .from("focus_sessions")
      .update({ paused_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .is("ended_at", null)
      .is("paused_at", null)
      .select(FOCUS_SELECT)
      .maybeSingle();

    if (error) throw toFocusError(error);
    if (data) return mapRow(data);

    // Already paused or completed in another tab: return the canonical row.
    const active = await getActiveFocusSession();
    if (active) return active;
    return getFocusSession(id, userId);
  } catch (error) {
    throw toFocusError(error);
  }
}

export async function resumeFocusSession(id: string): Promise<FocusSession> {
  try {
    const client = getSupabaseClient();
    const userId = await requireUserId();
    const current = await getFocusSession(id, userId);
    if (current.endedAt || !current.pausedAt) return current;

    const now = Date.now();
    const pausedAtMs = Date.parse(current.pausedAt);
    const pausedSeconds =
      current.pausedSeconds +
      (Number.isFinite(pausedAtMs) ? Math.max(0, Math.floor((now - pausedAtMs) / 1000)) : 0);

    const { data, error } = await client
      .from("focus_sessions")
      .update({ paused_at: null, paused_seconds: pausedSeconds })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("paused_at", current.pausedAt)
      .select(FOCUS_SELECT)
      .maybeSingle();

    if (error) throw toFocusError(error);
    if (data) return mapRow(data);

    const active = await getActiveFocusSession();
    if (active) return active;
    return getFocusSession(id, userId);
  } catch (error) {
    throw toFocusError(error);
  }
}

export async function completeFocusSession(id: string): Promise<FocusSession> {
  try {
    const client = getSupabaseClient();
    const userId = await requireUserId();
    const current = await getFocusSession(id, userId);
    if (current.endedAt) return current;

    const endedAt = new Date().toISOString();
    const pausedAtMs = current.pausedAt ? Date.parse(current.pausedAt) : null;
    const extraPausedSeconds =
      pausedAtMs !== null && Number.isFinite(pausedAtMs)
        ? Math.max(0, Math.floor((Date.parse(endedAt) - pausedAtMs) / 1000))
        : 0;

    const { data, error } = await client
      .from("focus_sessions")
      .update({
        ended_at: endedAt,
        paused_at: null,
        paused_seconds: current.pausedSeconds + extraPausedSeconds,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .is("ended_at", null)
      .select(FOCUS_SELECT)
      .maybeSingle();

    if (error) throw toFocusError(error);
    if (data) return mapRow(data);

    const active = await getActiveFocusSession();
    if (active) return active;
    return getFocusSession(id, userId);
  } catch (error) {
    throw toFocusError(error);
  }
}

/** Sessions that started inside the window; used by analytics/today totals. */
export async function listFocusSessionsBetween(
  fromIso: string,
  toIso: string,
): Promise<FocusSession[]> {
  try {
    const client = getSupabaseClient();
    const userId = await requireUserId();
    const { data, error } = await client
      .from("focus_sessions")
      .select(FOCUS_SELECT)
      .eq("user_id", userId)
      .gte("started_at", fromIso)
      .lt("started_at", toIso)
      .order("started_at", { ascending: false });

    if (error) throw toFocusError(error);
    return (data ?? []).map(mapRow);
  } catch (error) {
    throw toFocusError(error);
  }
}
