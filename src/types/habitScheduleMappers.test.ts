import { describe, expect, it } from "vitest";

import {
  mapHabitScheduleVersionRowToHabitScheduleVersion,
  type HabitScheduleVersionsRow,
} from "@/types/database";

describe("mapHabitScheduleVersionRowToHabitScheduleVersion", () => {
  it("maps an open version row to camelCase", () => {
    const row: HabitScheduleVersionsRow = {
      id: "version-1",
      user_id: "user-1",
      habit_id: "habit-1",
      effective_from: "2026-11-05",
      effective_to: null,
      frequency: "weekdays",
      weekdays: [1, 3, 5],
      target_count: 2,
      start_date: "2026-11-01",
      status: "active",
      created_at: "2026-11-05T08:00:00.000Z",
      updated_at: "2026-11-05T08:00:00.000Z",
    };

    expect(mapHabitScheduleVersionRowToHabitScheduleVersion(row)).toStrictEqual({
      id: "version-1",
      userId: "user-1",
      habitId: "habit-1",
      effectiveFrom: "2026-11-05",
      effectiveTo: null,
      frequency: "weekdays",
      weekdays: [1, 3, 5],
      targetCount: 2,
      startDate: "2026-11-01",
      status: "active",
      createdAt: "2026-11-05T08:00:00.000Z",
      updatedAt: "2026-11-05T08:00:00.000Z",
    });
  });

  it("preserves a closed pause interval", () => {
    const row: HabitScheduleVersionsRow = {
      id: "version-2",
      user_id: "user-1",
      habit_id: "habit-1",
      effective_from: "2026-10-01",
      effective_to: "2026-10-07",
      frequency: "daily",
      weekdays: [],
      target_count: 1,
      start_date: "2026-10-01",
      status: "paused",
      created_at: "2026-10-01T08:00:00.000Z",
      updated_at: "2026-10-08T08:00:00.000Z",
    };

    const mapped = mapHabitScheduleVersionRowToHabitScheduleVersion(row);

    expect(mapped.effectiveTo).toBe("2026-10-07");
    expect(mapped.status).toBe("paused");
  });
});
