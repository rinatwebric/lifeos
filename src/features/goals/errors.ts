/**
 * Single place where raw Supabase/PostgREST failures for goals and
 * milestones become typed, localizable error codes. UI layers match on
 * `code`, never on message substrings (same contract as auth/errors.ts).
 */

export type GoalErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "network"
  | "unknown";

export class GoalServiceError extends Error {
  readonly code: GoalErrorCode;
  readonly status?: number;

  constructor(code: GoalErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GoalServiceError";
    this.code = code;
    this.status = status;
  }
}

/** English fallback copy; the single source for future localization. */
export const GOAL_ERROR_MESSAGES: Record<GoalErrorCode, string> = {
  validation: "Some values are invalid. Please check the form and try again.",
  not_found: "Not found. It may have been deleted.",
  forbidden: "You do not have access. Please sign in again.",
  conflict: "This conflicts with existing data. Please reload and try again.",
  network: "Network error. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

interface GoalErrorLike {
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

function readGoalErrorLike(error: unknown): GoalErrorLike | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const candidate = error as Record<string, unknown>;
  if (typeof candidate["message"] !== "string" && candidate["message"] !== undefined) {
    return null;
  }

  return {
    message: candidate["message"],
    status: candidate["status"],
    code: candidate["code"],
  };
}

/**
 * Converts any Supabase/PostgREST failure into a `GoalServiceError`.
 * Matches on structured `code`/`status` first, message text only as fallback.
 *
 * Covered codes:
 * - `23514` CHECK violation -> validation
 * - `23503` FK violation -> conflict
 * - `42501` RLS/permission -> forbidden
 * - `PGRST116` zero rows from `.single()` -> not_found
 * - `TypeError` / fetch failures -> network
 */
export function toGoalError(error: unknown): GoalServiceError {
  if (error instanceof GoalServiceError) {
    return error;
  }

  if (error instanceof TypeError) {
    return new GoalServiceError("network", GOAL_ERROR_MESSAGES.network);
  }

  const like = readGoalErrorLike(error);
  const message = typeof like?.message === "string" ? like.message : "";
  const status = typeof like?.status === "number" ? like.status : undefined;
  const code = typeof like?.code === "string" ? like.code : "";
  const text = `${code} ${message}`.toLowerCase();

  let mapped: GoalErrorCode = "unknown";
  if (
    code === "23514" ||
    text.includes("violates check constraint") ||
    text.includes("check constraint")
  ) {
    mapped = "validation";
  } else if (
    code === "23503" ||
    text.includes("violates foreign key constraint") ||
    text.includes("foreign key constraint")
  ) {
    mapped = "conflict";
  } else if (
    code === "42501" ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    status === 401 ||
    status === 403
  ) {
    mapped = "forbidden";
  } else if (
    code === "PGRST116" ||
    text.includes("pgrst116") ||
    text.includes("0 rows") ||
    text.includes("no rows") ||
    text.includes("not found") ||
    status === 404
  ) {
    mapped = "not_found";
  } else if (
    error instanceof Error &&
    (text.includes("failed to fetch") || text.includes("network"))
  ) {
    mapped = "network";
  } else if (status === 409 || text.includes("duplicate")) {
    mapped = "conflict";
  } else if (status === 400 || text.includes("invalid input")) {
    mapped = "validation";
  }

  const fallback = message || GOAL_ERROR_MESSAGES[mapped];
  return new GoalServiceError(mapped, fallback, status);
}
