/**
 * Tasks errors. Thin wrapper over the shared `@/lib/dbErrors` mapping —
 * same contract as goals/errors.ts (UI matches on `code`, never on text).
 */
import {
  DbServiceError,
  DB_ERROR_MESSAGES,
  toDbError,
  type DbErrorCode,
} from "@/lib/dbErrors";

export type TaskErrorCode = DbErrorCode;

export class TaskServiceError extends DbServiceError {
  constructor(code: TaskErrorCode, message: string, status?: number, details?: string) {
    super(code, message, status, details);
    this.name = "TaskServiceError";
  }
}

/** English fallback copy; the single source for future localization. */
export const TASK_ERROR_MESSAGES: Record<TaskErrorCode, string> = DB_ERROR_MESSAGES;

/**
 * Converts any Supabase/PostgREST failure into a `TaskServiceError`.
 * `instanceof TaskServiceError` passes through untouched.
 */
export function toTaskError(error: unknown): TaskServiceError {
  if (error instanceof TaskServiceError) {
    return error;
  }

  const mapped = toDbError(error);
  return new TaskServiceError(mapped.code, mapped.message, mapped.status, mapped.details);
}
