import { describe, expect, it } from "vitest";

import { createTaskSchema, updateTaskSchema } from "./schema";

const GOAL_ID = "123e4567-e89b-12d3-a456-426614174000";
const MILESTONE_ID = "123e4567-e89b-12d3-a456-426614174001";

const validTask = {
  title: "Write report",
  description: null,
  priority: "medium",
  status: "todo",
  dueDate: "2026-11-10",
  scheduledStart: "2026-11-10T09:00:00.000Z",
  scheduledEnd: "2026-11-10T10:00:00.000Z",
  estimatedDurationMinutes: 60,
  goalId: GOAL_ID,
  milestoneId: MILESTONE_ID,
} as const;

describe("task schemas", () => {
  it("accepts a valid task payload", () => {
    expect(createTaskSchema.safeParse(validTask).success).toBe(true);
  });

  it("accepts a minimal payload with nullable fields unset", () => {
    const result = createTaskSchema.safeParse({ title: "Call", priority: "low", status: "todo" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title after trimming", () => {
    const result = createTaskSchema.safeParse({ ...validTask, title: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 200 characters", () => {
    const result = createTaskSchema.safeParse({ ...validTask, title: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects scheduled end before or equal to scheduled start", () => {
    const before = createTaskSchema.safeParse({
      ...validTask,
      scheduledStart: "2026-11-10T10:00:00.000Z",
      scheduledEnd: "2026-11-10T09:00:00.000Z",
    });
    expect(before.success).toBe(false);
    if (!before.success) {
      expect(before.error.issues[0].path).toEqual(["scheduledEnd"]);
    }

    const equal = createTaskSchema.safeParse({
      ...validTask,
      scheduledStart: "2026-11-10T10:00:00.000Z",
      scheduledEnd: "2026-11-10T10:00:00.000Z",
    });
    expect(equal.success).toBe(false);
  });

  it("accepts a missing scheduled bound on either side", () => {
    expect(
      createTaskSchema.safeParse({ ...validTask, scheduledEnd: null }).success,
    ).toBe(true);
    expect(
      createTaskSchema.safeParse({ ...validTask, scheduledStart: undefined }).success,
    ).toBe(true);
  });

  it("rejects zero or negative estimated durations, accepts positive and null", () => {
    expect(
      createTaskSchema.safeParse({ ...validTask, estimatedDurationMinutes: 0 }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({ ...validTask, estimatedDurationMinutes: -15 }).success,
    ).toBe(false);
    expect(
      createTaskSchema.safeParse({ ...validTask, estimatedDurationMinutes: 30 }).success,
    ).toBe(true);
    expect(
      createTaskSchema.safeParse({ ...validTask, estimatedDurationMinutes: null }).success,
    ).toBe(true);
  });

  it("rejects a nonexistent calendar date with the date message", () => {
    const result = createTaskSchema.safeParse({ ...validTask, dueDate: "2026-02-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["dueDate"]);
      expect(result.error.issues[0].message).toBe("Use YYYY-MM-DD.");
    }
  });

  it("rejects a malformed scheduled datetime", () => {
    const result = createTaskSchema.safeParse({
      ...validTask,
      scheduledStart: "not-a-datetime",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["scheduledStart"]);
    }
  });

  it("rejects unknown priority and status values, including overdue", () => {
    expect(createTaskSchema.safeParse({ ...validTask, priority: "urgent" }).success).toBe(
      false,
    );
    expect(createTaskSchema.safeParse({ ...validTask, status: "done" }).success).toBe(false);
    // Overdue is derived via isTaskOverdue, never a stored status.
    expect(createTaskSchema.safeParse({ ...validTask, status: "overdue" }).success).toBe(
      false,
    );
  });

  it("accepts null/uuid goal and milestone links, rejects non-uuid", () => {
    expect(createTaskSchema.safeParse({ ...validTask, goalId: null }).success).toBe(true);
    expect(
      createTaskSchema.safeParse({ ...validTask, milestoneId: undefined }).success,
    ).toBe(true);
    expect(createTaskSchema.safeParse({ ...validTask, goalId: "nope" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...validTask, milestoneId: "nope" }).success).toBe(
      false,
    );
  });

  it("still guards the schedule order on partial updates", () => {
    const result = updateTaskSchema.safeParse({
      scheduledStart: "2026-11-10T10:00:00.000Z",
      scheduledEnd: "2026-11-10T09:00:00.000Z",
    });
    expect(result.success).toBe(false);
    expect(updateTaskSchema.safeParse({ title: "Renamed" }).success).toBe(true);
  });
});
