import { describe, expect, it } from "vitest";

import {
  createHabitLogSchema,
  createHabitSchema,
  updateHabitLogSchema,
  updateHabitSchema,
} from "./schemas";

const HABIT_ID = "123e4567-e89b-12d3-a456-426614174000";

const validHabit = {
  title: "Read 20 minutes",
  description: null,
  frequency: "daily",
  weekdays: [],
  targetCount: 1,
  reminderTime: null,
  startDate: "2026-11-05",
  status: "active",
} as const;

const validLog = {
  habitId: HABIT_ID,
  logDate: "2026-11-05",
  completedCount: 1,
  note: null,
} as const;

describe("habit schemas", () => {
  it("accepts a valid daily habit payload", () => {
    expect(createHabitSchema.safeParse(validHabit).success).toBe(true);
  });

  it("accepts a weekdays habit with days and a weekly habit with empty weekdays", () => {
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "weekdays", weekdays: [1, 3, 5] })
        .success,
    ).toBe(true);
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "weekly", targetCount: 5 }).success,
    ).toBe(true);
  });

  it("accepts paused and archived statuses, rejects anything else", () => {
    expect(createHabitSchema.safeParse({ ...validHabit, status: "paused" }).success).toBe(true);
    expect(createHabitSchema.safeParse({ ...validHabit, status: "archived" }).success).toBe(true);
    expect(createHabitSchema.safeParse({ ...validHabit, status: "todo" }).success).toBe(false);
    expect(createHabitSchema.safeParse({ ...validHabit, status: "completed" }).success).toBe(
      false,
    );
  });

  it("rejects unknown frequencies", () => {
    expect(createHabitSchema.safeParse({ ...validHabit, frequency: "monthly" }).success).toBe(
      false,
    );
  });

  it("rejects an empty title after trimming and a title longer than 200 characters", () => {
    expect(createHabitSchema.safeParse({ ...validHabit, title: "   " }).success).toBe(false);
    expect(createHabitSchema.safeParse({ ...validHabit, title: "x".repeat(201) }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range, non-integer and null weekdays", () => {
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "weekdays", weekdays: [7] }).success,
    ).toBe(false);
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "weekdays", weekdays: [-1] }).success,
    ).toBe(false);
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "weekdays", weekdays: [1.5] })
        .success,
    ).toBe(false);
    // NULL slips through `<@` in Postgres (comparison is not false) — the DB
    // bans it outright (0007), and so does the input schema.
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "weekdays", weekdays: [null] })
        .success,
    ).toBe(false);
  });

  it("requires a non-empty weekday list for weekdays frequency only", () => {
    const empty = createHabitSchema.safeParse({ ...validHabit, frequency: "weekdays", weekdays: [] });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0].path).toEqual(["weekdays"]);
    }
    expect(
      createHabitSchema.safeParse({ ...validHabit, frequency: "daily", weekdays: [] }).success,
    ).toBe(true);
  });

  it("rejects non-positive or non-integer target counts", () => {
    expect(createHabitSchema.safeParse({ ...validHabit, targetCount: 0 }).success).toBe(false);
    expect(createHabitSchema.safeParse({ ...validHabit, targetCount: -2 }).success).toBe(false);
    expect(createHabitSchema.safeParse({ ...validHabit, targetCount: 1.5 }).success).toBe(false);
    expect(createHabitSchema.safeParse({ ...validHabit, targetCount: 3 }).success).toBe(true);
  });

  it("caps target counts at the SQL integer maximum in create and update", () => {
    const max = 2 ** 31 - 1;
    expect(createHabitSchema.safeParse({ ...validHabit, targetCount: max }).success).toBe(true);
    expect(createHabitSchema.safeParse({ ...validHabit, targetCount: max + 1 }).success).toBe(
      false,
    );
    expect(updateHabitSchema.safeParse({ targetCount: max }).success).toBe(true);
    expect(updateHabitSchema.safeParse({ targetCount: max + 1 }).success).toBe(false);
  });

  it("rejects a nonexistent calendar start date with the date message", () => {
    const result = createHabitSchema.safeParse({ ...validHabit, startDate: "2026-02-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["startDate"]);
      expect(result.error.issues[0].message).toBe("Use YYYY-MM-DD.");
    }
  });

  it("accepts HH:MM reminder times and null, rejects the rest", () => {
    expect(createHabitSchema.safeParse({ ...validHabit, reminderTime: "23:00" }).success).toBe(
      true,
    );
    expect(createHabitSchema.safeParse({ ...validHabit, reminderTime: null }).success).toBe(true);
    expect(createHabitSchema.safeParse({ ...validHabit, reminderTime: undefined }).success).toBe(
      true,
    );
    expect(createHabitSchema.safeParse({ ...validHabit, reminderTime: "25:00" }).success).toBe(
      false,
    );
    expect(createHabitSchema.safeParse({ ...validHabit, reminderTime: "9:00" }).success).toBe(
      false,
    );
    expect(createHabitSchema.safeParse({ ...validHabit, reminderTime: "not-a-time" }).success).toBe(
      false,
    );
  });

  it("never accepts userId as trusted input", () => {
    const result = createHabitSchema.safeParse({ ...validHabit, userId: "user-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("userId" in result.data).toBe(false);
    }
    expect("userId" in createHabitSchema.shape).toBe(false);
  });

  it("supports partial updates and still guards the weekday rule", () => {
    expect(updateHabitSchema.safeParse({ title: "Renamed" }).success).toBe(true);
    expect(updateHabitSchema.safeParse({ targetCount: 0 }).success).toBe(false);
    expect(updateHabitSchema.safeParse({ targetCount: 1.5 }).success).toBe(false);
    const missing = updateHabitSchema.safeParse({ frequency: "weekdays" });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues[0].path).toEqual(["weekdays"]);
    }
    expect(
      updateHabitSchema.safeParse({ frequency: "weekdays", weekdays: [0, 6] }).success,
    ).toBe(true);
    expect("userId" in updateHabitSchema.shape).toBe(false);
  });
});

describe("habit log schemas", () => {
  it("accepts a valid log payload", () => {
    expect(createHabitLogSchema.safeParse(validLog).success).toBe(true);
  });

  it("rejects a non-uuid habit link", () => {
    expect(createHabitLogSchema.safeParse({ ...validLog, habitId: "nope" }).success).toBe(false);
  });

  it("rejects a nonexistent calendar log date with the date message", () => {
    const result = createHabitLogSchema.safeParse({ ...validLog, logDate: "2026-02-30" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["logDate"]);
      expect(result.error.issues[0].message).toBe("Use YYYY-MM-DD.");
    }
  });

  it("rejects negative or non-integer counts, accepts zero and over-target values", () => {
    expect(createHabitLogSchema.safeParse({ ...validLog, completedCount: -1 }).success).toBe(
      false,
    );
    expect(createHabitLogSchema.safeParse({ ...validLog, completedCount: 1.5 }).success).toBe(
      false,
    );
    // Zero is a stored fact ("attempted, nothing done"); above target is
    // overfulfilment — both are allowed, no upper CHECK exists.
    expect(createHabitLogSchema.safeParse({ ...validLog, completedCount: 0 }).success).toBe(true);
    expect(createHabitLogSchema.safeParse({ ...validLog, completedCount: 5 }).success).toBe(true);
  });

  it("caps completed counts at the SQL integer maximum in create and update", () => {
    const max = 2 ** 31 - 1;
    expect(createHabitLogSchema.safeParse({ ...validLog, completedCount: max }).success).toBe(
      true,
    );
    expect(createHabitLogSchema.safeParse({ ...validLog, completedCount: max + 1 }).success).toBe(
      false,
    );
    expect(updateHabitLogSchema.safeParse({ completedCount: max }).success).toBe(true);
    expect(updateHabitLogSchema.safeParse({ completedCount: max + 1 }).success).toBe(false);
  });

  it("accepts null notes, rejects notes longer than 2000 characters", () => {
    expect(createHabitLogSchema.safeParse({ ...validLog, note: "Felt easy." }).success).toBe(true);
    expect(createHabitLogSchema.safeParse({ ...validLog, note: null }).success).toBe(true);
    expect(createHabitLogSchema.safeParse({ ...validLog, note: "x".repeat(2001) }).success).toBe(
      false,
    );
  });

  it("never accepts userId as trusted input", () => {
    const result = createHabitLogSchema.safeParse({ ...validLog, userId: "user-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("userId" in result.data).toBe(false);
    }
    expect("userId" in createHabitLogSchema.shape).toBe(false);
  });

  it("keeps logs pinned to their habit on update", () => {
    expect(updateHabitLogSchema.safeParse({ completedCount: 2 }).success).toBe(true);
    const moved = updateHabitLogSchema.safeParse({ habitId: HABIT_ID });
    expect(moved.success).toBe(true);
    if (moved.success) {
      // Logs never move between habits (like milestones never move between
      // goals): the key is stripped even if a caller sends it.
      expect("habitId" in moved.data).toBe(false);
    }
    expect(updateHabitLogSchema.safeParse({ completedCount: -1 }).success).toBe(false);
    expect(updateHabitLogSchema.safeParse({ completedCount: 1.5 }).success).toBe(false);
  });
});
