import { describe, expect, it } from "vitest";

import type { Goal, Habit, Task } from "@/types/domain";

import {
  bucketize,
  buildWeeklyReview,
  countCompletionsPerBucket,
  getPeriodRange,
  groupTasksByGoalCategory,
  type AnalyticsPeriod,
} from "./summary";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    userId: "u1",
    goalId: null,
    milestoneId: null,
    title: "Task",
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: null,
    completedAt: null,
    recurrenceRuleId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getPeriodRange", () => {
  it.each([
    ["day", "2026-11-05", "2026-11-05", "2026-11-05"],
    ["week", "2026-11-05", "2026-11-02", "2026-11-08"],
    ["week", "2026-11-08", "2026-11-02", "2026-11-08"],
    ["month", "2026-11-05", "2026-11-01", "2026-11-30"],
    ["month", "2026-02-10", "2026-02-01", "2026-02-28"],
    ["year", "2026-11-05", "2026-01-01", "2026-12-31"],
  ] satisfies Array<[AnalyticsPeriod, string, string, string]>)(
    "bounds %s around %s",
    (period, today, from, to) => {
      expect(getPeriodRange(period, today)).toStrictEqual({ from, to });
    },
  );

  it("starts the week on Monday (a Sunday belongs to the week behind it)", () => {
    expect(getPeriodRange("week", "2026-11-08").from).toBe("2026-11-02");
  });
});

describe("bucketize", () => {
  it("buckets a week into 7 days and a year into 12 months", () => {
    expect(bucketize({ from: "2026-11-02", to: "2026-11-08" }, "day")).toHaveLength(7);
    expect(bucketize({ from: "2026-01-01", to: "2026-12-31" }, "month")).toHaveLength(12);
  });
});

describe("countCompletionsPerBucket", () => {
  it("counts completed tasks by completed_at in the profile timezone, skipping dateless rows", () => {
    const tasks = [
      // 2026-11-04 20:00 UTC = 2026-11-05 in Asia/Bishkek.
      task({ id: "a", status: "completed", completedAt: "2026-11-04T20:00:00.000Z" }),
      task({ id: "b", status: "completed", completedAt: "2026-11-04T10:00:00.000Z" }),
      task({ id: "c", status: "completed", completedAt: null }),
      task({ id: "d", status: "todo", completedAt: null }),
    ];
    const buckets = bucketize({ from: "2026-11-04", to: "2026-11-05" }, "day");

    const counts = countCompletionsPerBucket(tasks, buckets, "Asia/Bishkek");

    expect(counts).toStrictEqual([
      { key: "2026-11-04", label: "11-04", completed: 1 },
      { key: "2026-11-05", label: "11-05", completed: 1 },
    ]);
  });
});

describe("groupTasksByGoalCategory", () => {
  it("groups by the linked goal's category and keeps goal-less tasks visible", () => {
    const goals: Goal[] = [
      {
        id: "g1",
        userId: "u1",
        title: "Career",
        description: null,
        category: "career",
        priority: "high",
        status: "active",
        startDate: "2026-11-01",
        targetDate: null,
        progress: 50,
        progressMode: "manual",
        completedAt: null,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    ];
    const tasks = [task({ id: "a", goalId: "g1" }), task({ id: "b", goalId: null })];

    expect(groupTasksByGoalCategory(tasks, goals)).toStrictEqual([
      { category: "career", count: 1 },
      { category: "no-goal", count: 1 },
    ]);
  });
});

describe("buildWeeklyReview", () => {
  const habit = (id: string): Habit => ({
    id,
    userId: "u1",
    title: id,
    description: null,
    frequency: "daily",
    weekdays: [],
    targetCount: 1,
    reminderTime: null,
    startDate: "2026-11-02",
    status: "active",
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  });

  it("summarizes the week from real counts with explicit denominators", () => {
    const tasks = [
      task({ id: "done", status: "completed", completedAt: "2026-11-03T10:00:00.000Z", dueDate: "2026-11-03" }),
      task({ id: "open", status: "todo", dueDate: "2026-11-06" }),
      task({ id: "late", status: "todo", dueDate: "2026-10-30" }),
    ];

    const lines = buildWeeklyReview({
      tasks,
      goals: [],
      habitRows: [
        {
          habit: habit("h1"),
          stats: { planned: 3, completed: 2, missed: 1, completionRate: 67, currentStreak: 1, bestStreak: 2 },
        },
      ],
      weekFrom: "2026-11-02",
      todayKey: "2026-11-05",
      timeZone: "UTC",
    });

    expect(lines.join("\n")).toContain("1 of 2 tasks due this week done");
    expect(lines.join("\n")).toContain("1 overdue task needs a new date");
    expect(lines.join("\n")).toContain("habits: 2 of 3 planned days done");
  });

  it("says the week is empty instead of reporting 0% as failure", () => {
    const lines = buildWeeklyReview({
      tasks: [],
      goals: [],
      habitRows: [],
      weekFrom: "2026-11-02",
      todayKey: "2026-11-05",
      timeZone: "UTC",
    });

    expect(lines.join("\n")).toContain("No tasks due this week yet");
    expect(lines.join("\n")).not.toContain("0%");
  });
});
