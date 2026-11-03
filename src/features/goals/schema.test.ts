import { describe, expect, it } from "vitest";

import { createGoalSchema, createMilestoneSchema, updateGoalSchema } from "./schema";

const validGoal = {
  title: "Learn piano",
  description: null,
  category: "personal_development",
  priority: "medium",
  status: "active",
  startDate: "2026-11-01",
  targetDate: "2026-12-01",
  progress: 10,
  progressMode: "manual",
} as const;

describe("goal schemas", () => {
  it("accepts a valid goal payload", () => {
    expect(createGoalSchema.safeParse(validGoal).success).toBe(true);
  });

  it("rejects an empty title after trimming", () => {
    const result = createGoalSchema.safeParse({ ...validGoal, title: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a target date before the start date", () => {
    const result = createGoalSchema.safeParse({
      ...validGoal,
      startDate: "2026-12-01",
      targetDate: "2026-11-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["targetDate"]);
    }
  });

  it("rejects progress outside 0..100", () => {
    expect(createGoalSchema.safeParse({ ...validGoal, progress: 150 }).success).toBe(false);
    expect(createGoalSchema.safeParse({ ...validGoal, progress: -1 }).success).toBe(false);
  });

  it("rejects unknown category/priority/status values", () => {
    expect(
      createGoalSchema.safeParse({ ...validGoal, category: "nope" }).success,
    ).toBe(false);
    expect(createGoalSchema.safeParse({ ...validGoal, priority: "urgent" }).success).toBe(
      false,
    );
    expect(createGoalSchema.safeParse({ ...validGoal, status: "done" }).success).toBe(false);
  });

  it("still guards the date order on partial updates", () => {
    const result = updateGoalSchema.safeParse({
      startDate: "2026-12-01",
      targetDate: "2026-11-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a nonexistent calendar date with the date message", () => {
    const result = createGoalSchema.safeParse({ ...validGoal, startDate: "2026-02-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["startDate"]);
      expect(result.error.issues[0].message).toBe("Use YYYY-MM-DD.");
    }
  });

  it("accepts a milestone payload", () => {
    const result = createMilestoneSchema.safeParse({
      goalId: "123e4567-e89b-12d3-a456-426614174000",
      title: "First step",
    });
    expect(result.success).toBe(true);
  });
});
