import { describe, expect, it } from "vitest";

import { focusClock, focusElapsedSeconds, formatFocusClock } from "./timer";

const BASE = {
  startedAt: "2026-01-01T10:00:00.000Z",
  endedAt: null,
  pausedAt: null,
  pausedSeconds: 0,
  plannedMinutes: 25,
};

function at(hours: number, minutes: number, seconds = 0): number {
  return Date.parse(
    `2026-01-01T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.000Z`,
  );
}

describe("focus timer", () => {
  it("counts wall time while running", () => {
    expect(focusElapsedSeconds(BASE, at(10, 10))).toBe(600);
    expect(focusClock(BASE, at(10, 10))).toMatchObject({
      elapsedSeconds: 600,
      remainingSeconds: 900,
      overtimeSeconds: 0,
      progress: 40,
      formatted: "10:00",
    });
  });

  it("freezes a paused session at paused_at", () => {
    const paused = { ...BASE, pausedAt: "2026-01-01T10:05:00.000Z" };
    expect(focusElapsedSeconds(paused, at(10, 20))).toBe(300);
  });

  it("subtracts accumulated pauses after resume", () => {
    const resumed = { ...BASE, pausedSeconds: 120 };
    expect(focusElapsedSeconds(resumed, at(10, 10))).toBe(480);
  });

  it("uses ended_at for a completed session", () => {
    const ended = { ...BASE, endedAt: "2026-01-01T10:07:00.000Z" };
    expect(focusElapsedSeconds(ended, at(11, 0))).toBe(420);
  });

  it("reports overtime and clamps progress", () => {
    expect(focusClock(BASE, at(10, 30))).toMatchObject({
      overtimeSeconds: 300,
      progress: 100,
      formatted: "30:00",
    });
  });

  it("formats short and long clocks", () => {
    expect(formatFocusClock(65)).toBe("01:05");
    expect(formatFocusClock(3665)).toBe("1:01:05");
    expect(formatFocusClock(-10)).toBe("00:00");
  });
});
