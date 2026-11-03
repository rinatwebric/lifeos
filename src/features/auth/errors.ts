/**
 * Single place where raw Supabase auth failures become typed, localizable
 * error codes. UI layers match on `code`, never on message substrings.
 */

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "weak_password"
  | "invalid_email"
  | "rate_limited"
  | "session_missing"
  | "network"
  | "unknown";

export class AuthServiceError extends Error {
  readonly code: AuthErrorCode;
  readonly status?: number;

  constructor(code: AuthErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AuthServiceError";
    this.code = code;
    this.status = status;
  }
}

/** English fallback copy; the single source for future localization. */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: "Invalid email or password.",
  email_not_confirmed: "Please confirm your email before signing in.",
  user_already_exists: "If this email is registered, a confirmation message was sent.",
  weak_password: "Password does not meet the requirements.",
  invalid_email: "Please enter a valid email address.",
  rate_limited: "Too many attempts. Please wait and try again.",
  session_missing: "Your session has expired. Please sign in again.",
  network: "Network error. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

interface AuthErrorLike {
  message?: unknown;
  status?: unknown;
  code?: unknown;
}

function readAuthErrorLike(error: unknown): AuthErrorLike | null {
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
 * Converts any Supabase/auth failure into an `AuthServiceError`.
 * Matches on structured `code`/`status` first, message text only as fallback.
 */
export function toAuthError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) {
    return error;
  }

  if (error instanceof TypeError) {
    return new AuthServiceError("network", AUTH_ERROR_MESSAGES.network);
  }

  const like = readAuthErrorLike(error);
  const message = typeof like?.message === "string" ? like.message : "";
  const status = typeof like?.status === "number" ? like.status : undefined;
  const code = typeof like?.code === "string" ? like.code.toLowerCase() : "";
  const text = `${code} ${message}`.toLowerCase();

  let mapped: AuthErrorCode = "unknown";
  if (text.includes("email not confirmed") || code === "email_not_confirmed") {
    mapped = "email_not_confirmed";
  } else if (
    text.includes("auth session missing") ||
    text.includes("session missing") ||
    text.includes("session_not_found") ||
    text.includes("bad_jwt") ||
    text.includes("invalid jwt")
  ) {
    // Expired/revoked sessions also arrive as HTTP 401 — check them BEFORE
    // the 401 fallback below, or the user sees "invalid email or password"
    // instead of "session expired".
    mapped = "session_missing";
  } else if (
    text.includes("invalid login credentials") ||
    text.includes("invalid_credentials") ||
    status === 401
  ) {
    mapped = "invalid_credentials";
  } else if (
    text.includes("user already registered") ||
    text.includes("user already exists") ||
    text.includes("user_already_exists") ||
    text.includes("user_already_registered")
  ) {
    // Generic copy on purpose: never leak whether the email exists.
    mapped = "user_already_exists";
  } else if (
    code === "weak_password" ||
    text.includes("weak_password") ||
    text.includes("password should be") ||
    text.includes("password is too short")
  ) {
    // Narrow on purpose: a bare "password" would swallow unrelated messages.
    mapped = "weak_password";
  } else if (
    text.includes("invalid email") ||
    text.includes("invalid_email") ||
    text.includes("email address")
  ) {
    mapped = "invalid_email";
  } else if (
    text.includes("rate limit") ||
    text.includes("over_request_rate_limit") ||
    text.includes("too many") ||
    status === 429
  ) {
    mapped = "rate_limited";
  } else if (
    error instanceof Error &&
    (text.includes("failed to fetch") || text.includes("network"))
  ) {
    mapped = "network";
  }

  const fallback = message || AUTH_ERROR_MESSAGES[mapped];
  return new AuthServiceError(mapped, fallback, status);
}
