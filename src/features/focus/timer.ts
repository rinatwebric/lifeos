import type { FocusSession } from "@/types/domain";

export const FOCUS_PRESET_MINUTES = [25, 50, 90] as const;

export interface FocusClock {
  elapsedSeconds: number;
  plannedSeconds: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  progress: number;
  formatted: string;
}

function finiteMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Elapsed focused time, not wall time. A paused session freezes at pausedAt;
 * accumulated pausedSeconds from earlier pauses is subtracted. Using stored
 * timestamps (instead of counting interval ticks) keeps the value correct
 * after reload, background tabs and device sleep.
 */
export function focusElapsedSeconds(
  session: Pick<FocusSession, "startedAt" | "endedAt" | "pausedAt" | "pausedSeconds">,
  nowMs = Date.now(),
): number {
  const startedMs = finiteMs(session.startedAt);
  if (startedMs === null) return 0;

  const endedMs = finiteMs(session.endedAt);
  const pausedMs = finiteMs(session.pausedAt);
  const referenceMs =
    endedMs !== null ? endedMs : pausedMs !== null ? Math.min(nowMs, pausedMs) : nowMs;

  return Math.max(0, Math.floor((referenceMs - startedMs - session.pausedSeconds * 1000) / 1000));
}

export function formatFocusClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function focusClock(
  session: Pick<
    FocusSession,
    "startedAt" | "endedAt" | "pausedAt" | "pausedSeconds" | "plannedMinutes"
  >,
  nowMs = Date.now(),
): FocusClock {
  const elapsedSeconds = focusElapsedSeconds(session, nowMs);
  const plannedSeconds = Math.max(60, session.plannedMinutes * 60);
  const remainingSeconds = plannedSeconds - elapsedSeconds;
  const overtimeSeconds = Math.max(0, elapsedSeconds - plannedSeconds);
  const progress = Math.min(100, Math.max(0, (elapsedSeconds / plannedSeconds) * 100));

  return {
    elapsedSeconds,
    plannedSeconds,
    remainingSeconds,
    overtimeSeconds,
    progress,
    formatted: formatFocusClock(elapsedSeconds),
  };
}
