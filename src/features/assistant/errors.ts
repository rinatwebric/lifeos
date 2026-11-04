/**
 * Assistant service errors (iteration 5, step 6).
 *
 * Codes are the contract with the UI (match on `code`, never on text):
 * - `forbidden` — no session or 401 from the function (auth boundary);
 * - `rate_limited` — 429, the 50-messages/24h budget (plan Р10) is spent;
 * - `too_large` — 413, the turn exceeds the function size limit;
 * - `invalid_input` — client-side validation failed (empty/overlong message,
 *   non-UUID conversation id); never reaches the network;
 * - `ai_unavailable` — the provider is down, misconfigured, the function is
 *   not deployed (404 on `functions.invoke`), or a 5xx without a better code;
 * - `invalid_response` — the function answered 2xx but the payload missed
 *   ids or the proposal failed `assistantProposalSchema` (never render junk);
 * - `network` — the request never reached Supabase (fetch failure);
 * - `unknown` — everything else, incl. PostgREST failures on the read paths.
 *
 * User-facing `message` is always the English fallback copy below — never a
 * raw Postgres/HTTP/fetch string. The raw text lands in `details` for logs.
 */

export type AssistantErrorCode =
  | "forbidden"
  | "rate_limited"
  | "too_large"
  | "invalid_input"
  | "ai_unavailable"
  | "invalid_response"
  | "network"
  | "unknown";

export class AssistantServiceError extends Error {
  readonly code: AssistantErrorCode;
  readonly status?: number;
  readonly details?: string;

  constructor(code: AssistantErrorCode, message: string, status?: number, details?: string) {
    super(message);
    this.name = "AssistantServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** English fallback copy; the single source for future localization. */
export const ASSISTANT_ERROR_MESSAGES: Record<AssistantErrorCode, string> = {
  forbidden: "You need to sign in to use the assistant. Please sign in and try again.",
  rate_limited: "You have sent a lot of messages today. Please try again tomorrow.",
  too_large: "Your message is too long. Please shorten it and try again.",
  invalid_input: "Please check your message and try again.",
  ai_unavailable: "The assistant is temporarily unavailable. Please try again.",
  invalid_response: "The assistant returned an unexpected response. Please try again.",
  network: "Network error. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  if (typeof record["status"] === "number") {
    return record["status"];
  }
  for (const key of ["context", "response"] as const) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null) {
      const status = (nested as Record<string, unknown>)["status"];
      if (typeof status === "number") {
        return status;
      }
    }
  }
  return undefined;
}

function errorName(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const name = (error as Record<string, unknown>)["name"];
  return typeof name === "string" ? name : "";
}

function errorText(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const record = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["message", "code"] as const) {
    const value = record[key];
    if (typeof value === "string") {
      parts.push(value);
    }
  }
  return parts.join(" ").toLowerCase();
}

/**
 * Converts any Supabase/functions/PostgREST failure into an
 * `AssistantServiceError`. `instanceof AssistantServiceError` passes through
 * untouched. Matches on structured `status`/`name` first, message text only
 * as fallback for network failures. The raw text goes to `details` for logs
 * and never reaches the UI.
 *
 * HTTP mapping (plan-phase-4, step 6):
 * 401 → forbidden, 413 → too_large, 429 → rate_limited,
 * 404 (function not deployed) + 500/502/503/504 → ai_unavailable,
 * fetch/relay failure → network/ai_unavailable, rest → unknown.
 */
export function toAssistantError(error: unknown): AssistantServiceError {
  if (error instanceof AssistantServiceError) {
    return error;
  }

  if (error instanceof TypeError) {
    const raw = error.message || "";
    return new AssistantServiceError(
      "network",
      ASSISTANT_ERROR_MESSAGES.network,
      undefined,
      raw || undefined,
    );
  }

  const name = errorName(error);
  const text = errorText(error);
  const status = readStatus(error);
  const rawMessage =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)["message"]
      : undefined;
  const details = typeof rawMessage === "string" && rawMessage ? rawMessage : undefined;

  if (
    name.includes("FunctionsFetchError") ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network error") ||
    text.includes("load failed")
  ) {
    return new AssistantServiceError("network", ASSISTANT_ERROR_MESSAGES.network, status, details);
  }

  if (name.includes("FunctionsRelayError")) {
    return new AssistantServiceError(
      "ai_unavailable",
      ASSISTANT_ERROR_MESSAGES.ai_unavailable,
      status,
      details,
    );
  }

  if (status === 401 || status === 403) {
    return new AssistantServiceError("forbidden", ASSISTANT_ERROR_MESSAGES.forbidden, status, details);
  }
  if (status === 413) {
    return new AssistantServiceError("too_large", ASSISTANT_ERROR_MESSAGES.too_large, status, details);
  }
  if (status === 429) {
    return new AssistantServiceError(
      "rate_limited",
      ASSISTANT_ERROR_MESSAGES.rate_limited,
      status,
      details,
    );
  }
  if (status === 404 || status === 500 || status === 502 || status === 503 || status === 504) {
    return new AssistantServiceError(
      "ai_unavailable",
      ASSISTANT_ERROR_MESSAGES.ai_unavailable,
      status,
      details,
    );
  }

  // PostgREST on the read paths: RLS denial is an auth boundary, the rest is
  // opaque to this layer (no validation/not_found/conflict codes here).
  if (
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("42501")
  ) {
    return new AssistantServiceError("forbidden", ASSISTANT_ERROR_MESSAGES.forbidden, status, details);
  }

  return new AssistantServiceError("unknown", ASSISTANT_ERROR_MESSAGES.unknown, status, details);
}
