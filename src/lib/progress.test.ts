import { describe, expect, it } from "vitest";

import {
  calculateCompletionRate,
  calculateGoalProgress,
  calculateMilestoneProgress,
  clampPercent,
} from "@/lib/progress";

describe("calculateMilestoneProgress", () => {
  it("uses completed / total × 100", () => {
    expect(calculateMilestoneProgress(1, 4)).toBe(25);
    expect(calculateMilestoneProgress(3, 3)).toBe(100);
    expect(calculateMilestoneProgress(2, 3)).toBe(67);
  });

  it("returns null when the goal has no milestones", () => {
    expect(calculateMilestoneProgress(0, 0)).toBeNull();
  });
});

describe("clampPercent", () => {
  it("keeps values inside 0–100 and rounds them", () => {
    expect(clampPercent(-12)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(42.4)).toBe(42);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe("calculateGoalProgress", () => {
  it("prefers milestone progress when the goal is milestone-based", () => {
    expect(
      calculateGoalProgress({
        progressMode: "milestones",
        progress: 10,
        milestones: [{ status: "completed" }, { status: "pending" }],
      }),
    ).toBe(50);
  });

  it("falls back to manual progress when there are no milestones", () => {
    expect(
      calculateGoalProgress({ progressMode: "milestones", progress: 33, milestones: [] }),
    ).toBe(33);
  });

  it("uses manual progress for manual goals", () => {
    expect(
      calculateGoalProgress({
        progressMode: "manual",
        progress: 80,
        milestones: [{ status: "completed" }],
      }),
    ).toBe(80);
  });
});

describe("calculateCompletionRate", () => {
  it("returns null instead of 0% when nothing was planned", () => {
    expect(calculateCompletionRate(0, 0)).toBeNull();
  });

  it("calculates the daily completion rate", () => {
    expect(calculateCompletionRate(3, 4)).toBe(75);
  });
});