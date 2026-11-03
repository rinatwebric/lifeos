import type { Profile, UserPreferences } from "./domain";

/**
 * Snake_case mirror of the Supabase schema (migrations 0001_profiles,
 * 0002_user_preferences). Application code uses camelCase `domain.ts` types;
 * mapping happens at the service boundary via the functions below.
 * Later this file will be replaced by `supabase gen types`.
 */

export interface ProfilesRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  language: "en" | "ru" | "ky";
  theme: "light" | "dark";
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRow {
  id: string;
  user_id: string;
  wake_up_time: string;
  sleep_time: string;
  working_hours: Record<string, unknown>;
  study_hours: Record<string, unknown>;
  preferred_work_periods: Record<string, unknown>;
  notification_preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function mapProfileRowToProfile(row: ProfilesRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    language: row.language,
    theme: row.theme,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUserPreferencesRowToUserPreferences(
  row: UserPreferencesRow,
): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    wakeUpTime: row.wake_up_time,
    sleepTime: row.sleep_time,
    workingHours: row.working_hours,
    studyHours: row.study_hours,
    preferredWorkPeriods: row.preferred_work_periods,
    notificationPreferences: row.notification_preferences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
