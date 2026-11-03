/**
 * Recurrence errors. Thin wrapper over the shared `@/lib/dbErrors` mapping —
 * same contract as goals/errors.ts and tasks/errors.ts (UI matches on
 * `code`, never on text).
 */
import {
  DbServiceError,
  DB_ERROR_MESSAGES,
  toDbError,
  type DbErrorCode,
} from "@/lib/dbErrors";

export type RecurrenceErrorCode = DbErrorCode;

export class RecurrenceServiceError extends DbServiceError {
  constructor(code: RecurrenceErrorCode, message: string, status?: number, details?: string) {
    super(code, message, status, details);
    this.name = "RecurrenceServiceError";
  }
}

/** English fallback copy; the single source for future localization. */
export const RECURRENCE_ERROR_MESSAGES: Record<RecurrenceErrorCode, string> =
  DB_ERROR_MESSAGES;

/**
 * Converts any Supabase/PostgREST failure into a `RecurrenceServiceError`.
 * `instanceof RecurrenceServiceError` passes through untouched.
 */
export function toRecurrenceError(error: unknown): RecurrenceServiceError {
  if (error instanceof RecurrenceServiceError) {
    return error;
  }

  const mapped = toDbError(error);
  return new RecurrenceServiceError(mapped.code, mapped.message, mapped.status, mapped.details);
}
