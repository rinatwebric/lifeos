export const FOCUS_ERROR_MESSAGES = {
  active_exists: "A focus session is already running.",
  forbidden: "You do not have access to this focus session.",
  not_found: "This focus session no longer exists.",
  network: "Network error. Check your connection and try again.",
  unknown: "Could not update the focus session. Please try again.",
} as const;

export type FocusErrorCode = keyof typeof FOCUS_ERROR_MESSAGES;

export class FocusServiceError extends Error {
  readonly code: FocusErrorCode;
  readonly status?: number;

  constructor(code: FocusErrorCode, message: string, status?: number) {
    super(message);
    this.name = "FocusServiceError";
    this.code = code;
    this.status = status;
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  status?: number;
}

export function toFocusError(error: unknown): FocusServiceError {
  if (error instanceof FocusServiceError) return error;

  const candidate = error as PostgrestLikeError | null;
  const message = candidate?.message ?? "";
  const status = candidate?.status;

  if (candidate?.code === "23505") {
    return new FocusServiceError("active_exists", FOCUS_ERROR_MESSAGES.active_exists, status);
  }
  if (candidate?.code === "PGRST116") {
    return new FocusServiceError("not_found", FOCUS_ERROR_MESSAGES.not_found, status);
  }
  if (candidate?.code === "42501" || status === 401 || status === 403) {
    return new FocusServiceError("forbidden", FOCUS_ERROR_MESSAGES.forbidden, status);
  }
  if (error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message)) {
    return new FocusServiceError("network", FOCUS_ERROR_MESSAGES.network);
  }
  if (status === 404) {
    return new FocusServiceError("not_found", FOCUS_ERROR_MESSAGES.not_found, status);
  }

  return new FocusServiceError("unknown", message || FOCUS_ERROR_MESSAGES.unknown, status);
}

export function focusErrorCode(error: unknown): FocusErrorCode | null {
  if (!error) return null;
  return error instanceof FocusServiceError ? error.code : toFocusError(error).code;
}
