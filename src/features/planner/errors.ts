/**
 * Planner errors. Thin wrapper over the shared `@/lib/dbErrors` mapping —
 * same contract as goals/errors.ts and tasks/errors.ts (UI matches on
 * `code`, never on text).
 */
import {
  DbServiceError,
  DB_ERROR_MESSAGES,
  toDbError,
  type DbErrorCode,
} from "@/lib/dbErrors";

export type BlockErrorCode = DbErrorCode;

export class BlockServiceError extends DbServiceError {
  constructor(code: BlockErrorCode, message: string, status?: number, details?: string) {
    super(code, message, status, details);
    this.name = "BlockServiceError";
  }
}

/** English fallback copy; the single source for future localization. */
export const BLOCK_ERROR_MESSAGES: Record<BlockErrorCode, string> = DB_ERROR_MESSAGES;

/**
 * Converts any Supabase/PostgREST failure into a `BlockServiceError`.
 * `instanceof BlockServiceError` passes through untouched. The raw
 * Postgres text never reaches the UI — it lands in `details` for logs.
 */
export function toBlockError(error: unknown): BlockServiceError {
  if (error instanceof BlockServiceError) {
    return error;
  }

  const mapped = toDbError(error);
  return new BlockServiceError(mapped.code, mapped.message, mapped.status, mapped.details);
}
