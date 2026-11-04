import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mapProfileRowToProfile,
  mapUserPreferencesRowToUserPreferences,
  type ProfilesRow,
  type UserPreferencesRow,
} from "@/types/database";
import type {
  AvailabilityWindows,
  Profile,
  ProfileLanguage,
  ProfileTheme,
  UserPreferences,
} from "@/types/domain";

export const profileQueryKey = ["profile"] as const;
export const preferencesQueryKey = ["preferences"] as const;

export interface UpdateProfileInput {
  fullName?: string | null;
  timezone?: string;
  language?: ProfileLanguage;
  theme?: ProfileTheme;
  onboardedAt?: string | null;
}

export interface UpdatePreferencesInput {
  wakeUpTime?: string;
  sleepTime?: string;
  workingHours?: AvailabilityWindows;
  studyHours?: AvailabilityWindows;
  preferredWorkPeriods?: AvailabilityWindows;
}

/**
 * Identity always comes from the verified JWT (`auth.getUser()`), never from
 * a caller-provided `user_id`. RLS (`id = auth.uid()` / `user_id = auth.uid()`)
 * is the second layer; the client never inserts (the `handle_new_user`
 * trigger creates both rows).
 */
async function requireUserId(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Not authenticated.");
  }

  return data.user.id;
}

export async function getProfile(): Promise<Profile> {
  const client = getSupabaseClient();
  const userId = await requireUserId();

  const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfileRowToProfile(data as ProfilesRow);
}

export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  const client = getSupabaseClient();
  const userId = await requireUserId();

  const payload: Partial<ProfilesRow> = {};

  if (input.fullName !== undefined) {
    payload.full_name = input.fullName;
  }
  if (input.timezone !== undefined) {
    payload.timezone = input.timezone;
  }
  if (input.language !== undefined) {
    payload.language = input.language;
  }
  if (input.theme !== undefined) {
    payload.theme = input.theme;
  }
  if (input.onboardedAt !== undefined) {
    payload.onboarded_at = input.onboardedAt;
  }

  const { data, error } = await client
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfileRowToProfile(data as ProfilesRow);
}

export async function getPreferences(): Promise<UserPreferences> {
  const client = getSupabaseClient();
  const userId = await requireUserId();

  const { data, error } = await client
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapUserPreferencesRowToUserPreferences(data as UserPreferencesRow);
}

export async function updatePreferences(input: UpdatePreferencesInput): Promise<UserPreferences> {
  const client = getSupabaseClient();
  const userId = await requireUserId();

  const payload: Partial<UserPreferencesRow> = {};

  if (input.wakeUpTime !== undefined) {
    payload.wake_up_time = input.wakeUpTime;
  }
  if (input.sleepTime !== undefined) {
    payload.sleep_time = input.sleepTime;
  }
  if (input.workingHours !== undefined) {
    payload.working_hours = input.workingHours;
  }
  if (input.studyHours !== undefined) {
    payload.study_hours = input.studyHours;
  }
  if (input.preferredWorkPeriods !== undefined) {
    payload.preferred_work_periods = input.preferredWorkPeriods;
  }

  const { data, error } = await client
    .from("user_preferences")
    .update(payload)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapUserPreferencesRowToUserPreferences(data as UserPreferencesRow);
}

/** Marks onboarding as seen so the hint dialog never returns. */
export async function markOnboarded(): Promise<Profile> {
  return updateProfile({ onboardedAt: new Date().toISOString() });
}
