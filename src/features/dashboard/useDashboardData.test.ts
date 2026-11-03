import { describe, expect, it } from "vitest";

import { toDateKey } from "@/lib/dates";
import type { Task } from "@/types/domain";

import {
  buildActiveGoalItems,
  selectDailyProgress,
  selectTodayTasks,
  summarizeMilestones,
} from "./useDashboardData";
import type { MilestoneProgressSlice } from "@/features/goals/api";
import type { Goal } from "@/types/domain";

const TIME_ZONE = "Asia/Bishkek";

let taskSeq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  taskSeq += 1;
  return {
    id: `task-${taskSeq}`,
    userId: "u1",
    goalId: null,
    milestoneId: null,
    title: `Task ${taskSeq}`,
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
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    userId: "u1",
    title: "Learn piano",
    description: null,
    category: "personal_development",
    priority: "medium",
    status: "active",
    startDate: "2026-11-01",
    targetDate: "2026-12-01",
    progress: 20,
    progressMode: "manual",
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

function todayKey(now: Date): string {
  return toDateKey(now, TIME_ZONE);
}

describe("selectTodayTasks", () => {
  it("excludes cancelled tasks due today", () => {
    const now = new Date();
    const today = todayKey(now);
    const tasks = [
      makeTask({ id: "t1", title: "Keep", status: "todo", dueDate: today }),
      makeTask({ id: "t2", title: "Drop", status: "cancelled", dueDate: today }),
    ];

    const result = selectTodayTasks(tasks, now, TIME_ZONE);

    expect(result.map((task) => task.id)).toEqual(["t1"]);
  });

  it("excludes cancelled completed-date tasks from the closed branch", () => {
    const now = new Date();
    const today = todayKey(now);
    const tasks = [
      makeTask({ id: "t1", title: "Done", status: "completed", dueDate: today }),
      makeTask({ id: "t2", title: "Cancelled", status: "cancelled", dueDate: today }),
    ];

    const result = selectTodayTasks(tasks, now, TIME_ZONE);

    expect(result.map((task) => task.id)).toEqual(["t1"]);
  });
});

describe("selectDailyProgress", () => {
  it("returns 50 for one completed of two", () => {
    const now = new Date();
    const today = todayKey(now);
    const tasks = [
      makeTask({ id: "t1", status: "completed", dueDate: today }),
      makeTask({ id: "t2", status: "todo", dueDate: today }),
    ];

    expect(selectDailyProgress(tasks, now, TIME_ZONE)).toEqual({
      completed: 1,
      total: 2,
      rate: 50,
    });
  });

  it("ignores cancelled tasks in the rate", () => {
    const now = new Date();
    const today = todayKey(now);
    const withoutCancelled = [
      makeTask({ id: "t1", status: "completed", dueDate: today }),
      makeTask({ id: "t2", status: "todo", dueDate: today }),
    ];
    const withCancelled = [
      ...withoutCancelled,
      makeTask({ id: "t3", status: "cancelled", dueDate: today }),
    ];

    expect(selectDailyProgress(withCancelled, now, TIME_ZONE)).toEqual(
      selectDailyProgress(withoutCancelled, now, TIME_ZONE),
    );
    expect(selectDailyProgress(withCancelled, now, TIME_ZONE)).toEqual({
      completed: 1,
      total: 2,
      rate: 50,
    });
  });

  it("returns null rate when only cancelled tasks are due today", () => {
    const now = new Date();
    const today = todayKey(now);
    const tasks = [makeTask({ id: "t1", status: "cancelled", dueDate: today })];

    expect(selectDailyProgress(tasks, now, TIME_ZONE)).toEqual({
      completed: 0,
      total: 0,
      rate: null,
    });
  });
});

describe("summarizeMilestones / buildActiveGoalItems", () => {
  it("groups statuses by goal without extra filtering", () => {
    const slices: Pick<MilestoneProgressSlice, "goalId" | "status">[] = [
      { goalId: "goal-1", status: "completed" },
      { goalId: "goal-1", status: "pending" },
      { goalId: "goal-2", status: "pending" },
    ];

    const grouped = summarizeMilestones(slices);

    expect(grouped.get("goal-1")).toMatchObject({ total: 2, completed: 1 });
    expect(grouped.get("goal-1")?.statuses).toEqual(["completed", "pending"]);
    expect(grouped.get("goal-2")).toMatchObject({ total: 1, completed: 0 });
  });

  it("derives milestone progress from the grouped map", () => {
    const goals = [makeGoal({ progressMode: "milestones", progress: 5 })];
    const slices: Pick<MilestoneProgressSlice, "goalId" | "status">[] = [
      { goalId: "goal-1", status: "completed" },
      { goalId: "goal-1", status: "pending" },
      { goalId: "goal-1", status: "pending" },
      { goalId: "goal-1", status: "pending" },
    ];

    const [item] = buildActiveGoalItems(goals, slices);

    expect(item.progress).toBe(25);
    expect(item.totalMilestones).toBe(4);
    expect(item.completedMilestones).toBe(1);
    expect(item.remainingMilestones).toBe(3);
  });

  it("falls back to manual progress when there are no milestones", () => {
    const goals = [makeGoal({ progressMode: "milestones", progress: 33 })];

    const [item] = buildActiveGoalItems(goals, []);

    expect(item.progress).toBe(33);
  });
});
