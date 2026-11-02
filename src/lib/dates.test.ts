import { describe, expect, it } from "vitest";

import { isTaskDueToday, isTaskOverdue, toDateKey } from "@/lib/dates";
import type { Task } from "@/types/domain";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "user-1",
    goalId: null,
    milestoneId: null,
    title: "Learn React hooks",
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: 60,
    completedAt: null,
    recurrenceRuleId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toDateKey", () => {
  it("resolves the calendar date in the user's time zone", () => {
    const instant = new Date("2026-01-01T23:30:00.000Z");

    expect(toDateKey(instant, "UTC")).toBe("2026-01-01");
    expect(toDateKey(instant, "Asia/Bishkek")).toBe("2026-01-02");
    expect(toDateKey(instant, "America/New_York")).toBe("2026-01-01");
  });

  it("handles daylight saving transitions", () => {
    const instant = new Date("2026-03-29T00:30:00.000Z");

    expect(toDateKey(instant, "Europe/Berlin")).toBe("2026-03-29");
  });
});

describe("isTaskOverdue", () => {
  const now = new Date("2026-02-10T09:00:00.000Z");

  it("is false when the task has no due date", () => {
    expect(isTaskOverdue(makeTask(), now, "UTC")).toBe(false);
  });

  it("is true only after the due date has passed locally", () => {
    expect(isTaskOverdue(makeTask({ dueDate: "2026-02-09" }), now, "UTC")).toBe(true);
    expect(isTaskOverdue(makeTask({ dueDate: "2026-02-10" }), now, "UTC")).toBe(false);
    expect(isTaskOverdue(makeTask({ dueDate: "2026-02-11" }), now, "UTC")).toBe(false);
  });

  it("uses the user's time zone, not UTC", () => {
    const lateEvening = new Date("2026-02-10T20:00:00.000Z");
    const task = makeTask({ dueDate: "2026-02-10" });

    expect(isTaskOverdue(task, lateEvening, "UTC")).toBe(false);
    expect(isTaskOverdue(task, lateEvening, "Asia/Bishkek")).toBe(true);
  });

  it("never marks completed or cancelled tasks as overdue", () => {
    expect(isTaskOverdue(makeTask({ dueDate: "2026-02-01", status: "completed" }), now)).toBe(
      false,
    );
    expect(isTaskOverdue(makeTask({ dueDate: "2026-02-01", status: "cancelled" }), now)).toBe(
      false,
    );
  });
});

describe("isTaskDueToday", () => {
  const now = new Date("2026-02-10T09:00:00.000Z");

  it("matches only today's date in the user's time zone", () => {
    expect(isTaskDueToday(makeTask({ dueDate: "2026-02-10" }), now, "UTC")).toBe(true);
    expect(isTaskDueToday(makeTask({ dueDate: "2026-02-09" }), now, "UTC")).toBe(false);
    expect(isTaskDueToday(makeTask({ dueDate: null }), now, "UTC")).toBe(false);
  });
});