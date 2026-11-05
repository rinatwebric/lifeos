/**
 * Shared Supabase/PostgREST failure mapping for service-layer errors.
 *
 * Feature modules (goals, tasks, ...) keep thin wrappers with their own
 * error class names (`GoalServiceError`, `TaskServiceError`) so UI layers
 * keep matching on `code`, never on message substrings — but the mapping
 * itself lives here, in one place.
 */

export type DbErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "network"
  | "unknown";

export class DbServiceError extends Error {
  readonly code: DbErrorCode;
  readonly status?: number;
  readonly details?: string;

  constructor(code: DbErrorCode, message: string, status?: number, details?: string) {
    super(message);
    this.name = "DbServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** English fallback copy; the single source for future localization. */
export const DB_ERROR_MESSAGES: Record<DbErrorCode, string> = {
  validation: "Some values are invalid. Please check the form and try again.",
  not_found: "Not found. It may have been deleted.",
  forbidden: "You do not have access. Please sign in again.",
  conflict: "This conflicts with existing data. Please reload and try again.",
  network: "Network error. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

/** Maps a stable DB code to the current locale's text (open errors react). */
export function translateDbError(
  code: DbErrorCode,
  messages: {
    dbErrors: {
      invalid: string;
      notFound: string;
      noAccess: string;
      conflict: string;
      network: string;
      unknown: string;
    };
  },
): string {
  switch (code) {
    case "validation":
      return messages.dbErrors.invalid;
    case "not_found":
      return messages.dbErrors.notFound;
    case "forbidden":
      return messages.dbErrors.noAccess;
    case "conflict":
      return messages.dbErrors.conflict;
    case "network":
      return messages.dbErrors.network;
    case "unknown":
      return messages.dbErrors.unknown;
  }
}

interface DbErrorLike {
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

function readDbErrorLike(error: unknown): DbErrorLike | null {
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
 * Converts any Supabase/PostgREST failure into a `DbServiceError`.
 * Matches on structured `code`/`status` first, message text only as fallback.
 * The user-facing `message` is always the localized copy; the raw Postgres
 * text goes to `details` for logs only and never reaches the UI.
 *
 * Covered codes:
 * - `23514` CHECK violation -> validation
 * - `23503` FK violation -> conflict
 * - `42501` RLS/permission -> forbidden
 * - `PGRST116` zero rows from `.single()` -> not_found
 * - `22007`/`22008` datetime errors + `invalid input syntax for type date` -> validation
 * - `TypeError` / fetch failures -> network
 */
export function toDbError(error: unknown): DbServiceError {
  if (error instanceof DbServiceError) {
    return error;
  }

  if (error instanceof TypeError) {
    const raw = error.message || "";
    return new DbServiceError(
      "network",
      DB_ERROR_MESSAGES.network,
      undefined,
      raw || undefined,
    );
  }

  const like = readDbErrorLike(error);
  const message = typeof like?.message === "string" ? like.message : "";
  const status = typeof like?.status === "number" ? like.status : undefined;
  const code = typeof like?.code === "string" ? like.code : "";
  const text = `${code} ${message}`.toLowerCase();

  let mapped: DbErrorCode = "unknown";
  if (
    code === "23514" ||
    text.includes("violates check constraint") ||
    text.includes("check constraint")
  ) {
    mapped = "validation";
  } else if (
    code === "22007" ||
    code === "22008" ||
    text.includes("invalid input syntax for type date") ||
    text.includes("invalid input")
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
  } else if (status === 400) {
    mapped = "validation";
  }

  const details = message || undefined;
  return new DbServiceError(mapped, DB_ERROR_MESSAGES[mapped], status, details);
}
