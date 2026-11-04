/**
 * Chat-request parsing with a hard size limit (iteration 5, step 3).
 *
 * Pure module (no Deno/edge imports) so the limits are unit-tested under
 * Vitest: oversized bodies are rejected BEFORE parsing, malformed JSON and
 * shape violations map to distinct codes. Mirrors the frontend contract of
 * step 6 (`content` 1–4000 chars, `conversationId` uuid) so both sides agree.
 */

/** 64 KiB — a chat turn is text; anything larger is rejected, not truncated. */
export const MAX_BODY_BYTES = 64 * 1024;
/** Same bound as the frontend `content` schema (step 6): 1–4000 chars. */
export const MAX_MESSAGE_CHARS = 4000;

/**
 * Header pre-check: reject bodies over MAX_BODY_BYTES BEFORE req.text()
 * so an oversized Content-Length never forces the runtime to buffer the
 * body. Missing or malformed headers return false - the post-read byte
 * check in parseChatRequestBody stays the enforcement point for chunked
 * bodies without a length (fix b, review 2026-11-04).
 */
export function isContentLengthExceeded(contentLengthHeader: string | null): boolean {
  if (contentLengthHeader === null) {
    return false;
  }
  const parsed = Number.parseInt(contentLengthHeader.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return parsed > MAX_BODY_BYTES;
}

export interface ChatRequest {
  message: string;
  conversationId: string | null;
}

export type ChatRequestErrorCode = "too_large" | "invalid_json" | "invalid_schema";

export interface ChatRequestError {
  code: ChatRequestErrorCode;
  message: string;
}

export type ChatRequestParseResult =
  | { ok: true; request: ChatRequest }
  | { ok: false; error: ChatRequestError };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function fail(code: ChatRequestErrorCode, message: string): ChatRequestParseResult {
  return { ok: false, error: { code, message } };
}

/** Validate one already-read request body (the caller enforces transport limits). */
export function parseChatRequestBody(bodyText: string): ChatRequestParseResult {
  if (utf8ByteLength(bodyText) > MAX_BODY_BYTES) {
    return fail("too_large", `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(bodyText) as unknown;
  } catch {
    return fail("invalid_json", "Request body is not valid JSON.");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail("invalid_schema", "Request body must be a JSON object.");
  }

  const record = data as Record<string, unknown>;
  const message = record.message;
  const conversationId = record.conversationId ?? null;

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_CHARS
  ) {
    return fail("invalid_schema", "message must be a non-empty string of at most 4000 characters.");
  }

  if (
    conversationId !== null &&
    (typeof conversationId !== "string" || !UUID_RE.test(conversationId))
  ) {
    return fail("invalid_schema", "conversationId must be a UUID string or null.");
  }

  return { ok: true, request: { message, conversationId } };
}
