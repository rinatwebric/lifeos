/**
 * Habits errors. Thin wrapper over the shared `@/lib/dbErrors` mapping —
 * same contract as tasks/errors.ts (UI matches on `code`, never on text).
 */
import {
  DbServiceError,
  DB_ERROR_MESSAGES,
  toDbError,
  type DbErrorCode,
} from "@/lib/dbErrors";

export type HabitErrorCode = DbErrorCode;

export class HabitServiceError extends DbServiceError {
  constructor(code: HabitErrorCode, message: string, status?: number, details?: string) {
    super(code, message, status, details);
    this.name = "HabitServiceError";
  }
}

/** English fallback copy; the single source for future localization. */
export const HABIT_ERROR_MESSAGES: Record<HabitErrorCode, string> = DB_ERROR_MESSAGES;

/**
 * Converts any Supabase/PostgREST failure into a `HabitServiceError`.
 * `instanceof HabitServiceError` passes through untouched.
 */
export function toHabitError(error: unknown): HabitServiceError {
  if (error instanceof HabitServiceError) {
    return error;
  }

  const mapped = toDbError(error);
  return new HabitServiceError(mapped.code, mapped.message, mapped.status, mapped.details);
}
