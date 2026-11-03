/**
 * Goals/milestones errors. The PostgREST mapping lives in `@/lib/dbErrors`;
 * this module only re-exports it under the historic goals names so existing
 * imports (`GoalServiceError`, `GOAL_ERROR_MESSAGES`, `toGoalError`) and the
 * 46 goals tests keep working untouched.
 */
import {
  DbServiceError,
  DB_ERROR_MESSAGES,
  toDbError,
  type DbErrorCode,
} from "@/lib/dbErrors";

export type GoalErrorCode = DbErrorCode;

export class GoalServiceError extends DbServiceError {
  constructor(code: GoalErrorCode, message: string, status?: number, details?: string) {
    super(code, message, status, details);
    this.name = "GoalServiceError";
  }
}

/** English fallback copy; the single source for future localization. */
export const GOAL_ERROR_MESSAGES: Record<GoalErrorCode, string> = DB_ERROR_MESSAGES;

/**
 * Converts any Supabase/PostgREST failure into a `GoalServiceError`.
 * Same contract as before the extraction: `instanceof GoalServiceError`
 * passes through untouched, everything else is mapped once in `toDbError`
 * and rewrapped to preserve the goals class name.
 */
export function toGoalError(error: unknown): GoalServiceError {
  if (error instanceof GoalServiceError) {
    return error;
  }

  const mapped = toDbError(error);
  return new GoalServiceError(mapped.code, mapped.message, mapped.status, mapped.details);
}
