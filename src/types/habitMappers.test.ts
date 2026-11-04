import { describe, expect, it } from "vitest";

import {
  mapHabitLogRowToHabitLog,
  mapHabitRowToHabit,
  type HabitLogsRow,
  type HabitsRow,
} from "@/types/database";

describe("mapHabitRowToHabit", () => {
  it("maps a weekdays habit, keeping the schedule and counts", () => {
    const row: HabitsRow = {
      id: "habit-1",
      user_id: "user-1",
      title: "Read 20 minutes",
      description: "Before bed.",
      frequency: "weekdays",
      weekdays: [1, 3, 5],
      target_count: 1,
      reminder_time: "22:00:00",
      start_date: "2026-11-05",
      status: "active",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
    };

    expect(mapHabitRowToHabit(row)).toStrictEqual({
      id: "habit-1",
      userId: "user-1",
      title: "Read 20 minutes",
      description: "Before bed.",
      frequency: "weekdays",
      weekdays: [1, 3, 5],
      targetCount: 1,
      reminderTime: "22:00:00",
      startDate: "2026-11-05",
      status: "active",
      createdAt: "2026-11-04T10:00:00.000Z",
      updatedAt: "2026-11-04T10:00:00.000Z",
    });
  });

  it("preserves null description and reminder time", () => {
    const row: HabitsRow = {
      id: "habit-2",
      user_id: "user-1",
      title: "Drink water",
      description: null,
      frequency: "daily",
      weekdays: [],
      target_count: 8,
      reminder_time: null,
      start_date: "2026-11-05",
      status: "paused",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
    };

    const mapped = mapHabitRowToHabit(row);

    expect(mapped.description).toBeNull();
    expect(mapped.reminderTime).toBeNull();
    expect(mapped.status).toBe("paused");
    expect(mapped.weekdays).toStrictEqual([]);
  });
});

describe("mapHabitLogRowToHabitLog", () => {
  it("maps a log row to camelCase", () => {
    const row: HabitLogsRow = {
      id: "log-1",
      user_id: "user-1",
      habit_id: "habit-1",
      log_date: "2026-11-05",
      completed_count: 2,
      note: "Morning + evening.",
      created_at: "2026-11-05T08:00:00.000Z",
      updated_at: "2026-11-05T08:00:00.000Z",
    };

    expect(mapHabitLogRowToHabitLog(row)).toStrictEqual({
      id: "log-1",
      userId: "user-1",
      habitId: "habit-1",
      logDate: "2026-11-05",
      completedCount: 2,
      note: "Morning + evening.",
      createdAt: "2026-11-05T08:00:00.000Z",
      updatedAt: "2026-11-05T08:00:00.000Z",
    });
  });

  it("preserves a null note", () => {
    const row: HabitLogsRow = {
      id: "log-2",
      user_id: "user-1",
      habit_id: "habit-1",
      log_date: "2026-11-06",
      completed_count: 0,
      note: null,
      created_at: "2026-11-06T08:00:00.000Z",
      updated_at: "2026-11-06T08:00:00.000Z",
    };

    const mapped = mapHabitLogRowToHabitLog(row);

    expect(mapped.note).toBeNull();
    expect(mapped.completedCount).toBe(0);
  });
});
