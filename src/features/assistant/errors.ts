/**
 * Assistant service errors (iteration 5, steps 6–8).
 *
 * Codes are the contract with the UI (match on `code`, never on text):
 * - `forbidden` — no session or 401 from the function (auth boundary);
 * - `rate_limited` — 429, the 50-messages/24h budget (plan Р10) is spent;
 * - `too_large` — 413, the turn exceeds the function size limit;
 * - `invalid_input` — client-side validation failed (empty/overlong message,
 *   non-UUID conversation id, bad `selectedIndexes`); never reaches the
 *   network, plus server 400 for the same shape;
 * - `ai_unavailable` — the provider is down, misconfigured, the function is
 *   not deployed (404 on `functions.invoke`), or a 5xx without a better code;
 * - `invalid_response` — the function answered 2xx but the payload missed
 *   ids or the proposal failed `assistantProposalSchema` (never render junk);
 * - `already_decided` — 409, the proposal was already approved/rejected
 *   (parallel approve loser or double click);
 * - `expired` — 410, the proposal expired (terminal for the UI: no Retry,
 *   start a new conversation);
 * - `validation_failed` — 422, selected actions no longer pass
 *   `validateActions` (stale task, conflict, past date);
 * - `apply_failed` — 500 during apply (partial writes stay, proposal rolled
 *   back to `pending`; retry may duplicate — backlog RPC);
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
  | "already_decided"
  | "expired"
  | "validation_failed"
  | "apply_failed"
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
  already_decided: "This proposal has already been decided. Reload to see the current status.",
  expired: "This proposal has expired. Start a new conversation for a fresh suggestion.",
  validation_failed: "Some actions are no longer valid. Reload and ask for a new proposal.",
  apply_failed: "Could not apply the proposal. Nothing was lost — please try again.",
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

function readServerCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  const direct = record["code"];
  if (typeof direct === "string" && direct) {
    return direct;
  }
  for (const key of ["context", "response", "data"] as const) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null) {
      const nestedRecord = nested as Record<string, unknown>;
      const nestedCode = nestedRecord["code"];
      if (typeof nestedCode === "string" && nestedCode) {
        return nestedCode;
      }
      const nestedData = nestedRecord["data"];
      if (typeof nestedData === "object" && nestedData !== null) {
        const nestedDataCode = (nestedData as Record<string, unknown>)["code"];
        if (typeof nestedDataCode === "string" && nestedDataCode) {
          return nestedDataCode;
        }
      }
    }
  }
  return undefined;
}

/**
 * Converts any Supabase/functions/PostgREST failure into an
 * `AssistantServiceError`. `instanceof AssistantServiceError` passes through
 * untouched. Matches on structured `status`/`name` first, message text only
 * as fallback for network failures. The raw text goes to `details` for logs
 * and never reaches the UI.
 *
 * HTTP mapping (plan-phase-4, steps 6–8):
 * 400 → invalid_input (bad `selectedIndexes`, bad UUID),
 * 401 → forbidden, 413 → too_large, 429 → rate_limited,
 * 404 (function not deployed) + 500/502/503/504 → ai_unavailable,
 * 409 → already_decided, 410 → expired (terminal), 422 → validation_failed,
 * 500 with an `apply_failed` server code → apply_failed,
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
  const serverCode = readServerCode(error);
  const rawMessage =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)["message"]
      : undefined;
  const details = typeof rawMessage === "string" && rawMessage ? rawMessage : undefined;

  if (serverCode === "already_decided" || serverCode === "expired" || serverCode === "validation_failed" || serverCode === "apply_failed") {
    const code = serverCode as AssistantErrorCode;
    return new AssistantServiceError(code, ASSISTANT_ERROR_MESSAGES[code], status, details);
  }

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
  if (status === 400) {
    return new AssistantServiceError(
      "invalid_input",
      ASSISTANT_ERROR_MESSAGES.invalid_input,
      status,
      details,
    );
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
  if (status === 409) {
    return new AssistantServiceError(
      "already_decided",
      ASSISTANT_ERROR_MESSAGES.already_decided,
      status,
      details,
    );
  }
  if (status === 410) {
    return new AssistantServiceError("expired", ASSISTANT_ERROR_MESSAGES.expired, status, details);
  }
  if (status === 422) {
    return new AssistantServiceError(
      "validation_failed",
      ASSISTANT_ERROR_MESSAGES.validation_failed,
      status,
      details,
    );
  }
  if (status === 500 && text.includes("apply_failed")) {
    return new AssistantServiceError(
      "apply_failed",
      ASSISTANT_ERROR_MESSAGES.apply_failed,
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
