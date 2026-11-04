/**
 * Chat/decide-request parsing with a hard size limit (iteration 5, steps 3+7).
 *
 * Pure module (no Deno/edge imports) so the limits are unit-tested under
 * Vitest: oversized bodies are rejected BEFORE parsing, malformed JSON and
 * shape violations map to distinct codes. Mirrors the frontend contract of
 * step 6 (`content` 1–4000 chars, `conversationId` uuid) so both sides agree.
 * Step 7 adds the decide branch: `{ action: "approve" | "reject", proposalId }`
 * (absence of `action` stays the chat path for backward compatibility).
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

export type DecideAction = "approve" | "reject";

export interface DecideRequest {
  action: DecideAction;
  proposalId: string;
  selectedIndexes?: number[];
}

export type DecideRequestErrorCode = "too_large" | "invalid_json" | "invalid_schema";

export interface DecideRequestError {
  code: DecideRequestErrorCode;
  message: string;
}

export type DecideRequestParseResult =
  | { ok: true; request: DecideRequest }
  | { ok: false; error: DecideRequestError };

function decideFail(code: DecideRequestErrorCode, message: string): DecideRequestParseResult {
  return { ok: false, error: { code, message } };
}

/**
 * Validate one already-read decide body (`approve`/`reject` with a proposal
 * id). Same size/JSON envelope as chat; `action` is the discriminator and
 * `proposalId` must be a UUID. Chat bodies (no `action`) never reach here —
 * the router in `index.ts` branches on the presence of `action`.
 *
 * `selectedIndexes` (approve only, optional): per-item accept. When present
 * it must be a non-empty array of integers, duplicate-free and sorted
 * ascending (range `0..actions.length-1` is checked in `handleApprove`,
 * which knows the proposal). Absent means "all actions" (backward
 * compatible).
 */
export function parseDecideRequestBody(bodyText: string): DecideRequestParseResult {
  if (utf8ByteLength(bodyText) > MAX_BODY_BYTES) {
    return decideFail("too_large", `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(bodyText) as unknown;
  } catch {
    return decideFail("invalid_json", "Request body is not valid JSON.");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return decideFail("invalid_schema", "Request body must be a JSON object.");
  }

  const record = data as Record<string, unknown>;
  const action = record.action;
  const proposalId = record.proposalId;

  if (action !== "approve" && action !== "reject") {
    return decideFail("invalid_schema", 'action must be "approve" or "reject".');
  }

  if (typeof proposalId !== "string" || !UUID_RE.test(proposalId)) {
    return decideFail("invalid_schema", "proposalId must be a UUID string.");
  }

  const rawSelected = record.selectedIndexes;
  if (rawSelected === undefined) {
    return { ok: true, request: { action, proposalId } };
  }

  if (action !== "approve") {
    return decideFail("invalid_schema", "selectedIndexes is only allowed with action approve.");
  }

  if (!Array.isArray(rawSelected) || rawSelected.length === 0) {
    return decideFail("invalid_schema", "selectedIndexes must be a non-empty array.");
  }

  for (const entry of rawSelected) {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0) {
      return decideFail("invalid_schema", "selectedIndexes must contain only non-negative integers.");
    }
  }

  const indexes = rawSelected as number[];
  const unique = new Set(indexes);
  if (unique.size !== indexes.length) {
    return decideFail("invalid_schema", "selectedIndexes must not contain duplicates.");
  }

  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] <= indexes[i - 1]) {
      return decideFail("invalid_schema", "selectedIndexes must be sorted ascending.");
    }
  }

  return { ok: true, request: { action, proposalId, selectedIndexes: [...indexes] } };
}
