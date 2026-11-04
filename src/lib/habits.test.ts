import { describe, expect, it } from "vitest";

import { toDateKey } from "@/lib/dates";
import type { Habit, HabitLog, HabitScheduleVersion } from "@/types/domain";

import {
  calculateHabitStats,
  getHabitDayStatus,
  getVersionForDate,
} from "./habits";

const HABIT_ID = "habit-1";
const USER_ID = "user-1";

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: HABIT_ID,
    userId: USER_ID,
    title: "Read",
    description: null,
    frequency: "daily",
    weekdays: [],
    targetCount: 1,
    reminderTime: null,
    startDate: "2026-10-26",
    status: "active",
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
    ...overrides,
  };
}

function version(
  effectiveFrom: string,
  overrides: Partial<HabitScheduleVersion> = {},
): HabitScheduleVersion {
  return {
    id: `v-${effectiveFrom}`,
    userId: USER_ID,
    habitId: HABIT_ID,
    effectiveFrom,
    effectiveTo: null,
    frequency: "daily",
    weekdays: [],
    targetCount: 1,
    startDate: "2026-10-26",
    status: "active",
    createdAt: `${effectiveFrom}T00:00:00.000Z`,
    updatedAt: `${effectiveFrom}T00:00:00.000Z`,
    ...overrides,
  };
}

function log(logDate: string, completedCount = 1): HabitLog {
  return {
    id: `log-${logDate}`,
    userId: USER_ID,
    habitId: HABIT_ID,
    logDate,
    completedCount,
    note: null,
    createdAt: `${logDate}T08:00:00.000Z`,
    updatedAt: `${logDate}T08:00:00.000Z`,
  };
}

const V_ALL = [version("2026-10-26")];

describe("getVersionForDate", () => {
  it("returns the version effective on that date", () => {
    const versions = [
      version("2026-10-26", { targetCount: 1, effectiveTo: "2026-11-02" }),
      version("2026-11-03", { targetCount: 3 }),
    ];

    expect(getVersionForDate(versions, "2026-11-02")?.targetCount).toBe(1);
    expect(getVersionForDate(versions, "2026-11-03")?.targetCount).toBe(3);
    expect(getVersionForDate(versions, "2026-11-10")?.targetCount).toBe(3);
  });

  it("returns null when no version covers the date (unknown past)", () => {
    expect(getVersionForDate(V_ALL, "2026-10-20")).toBeNull();
  });
});

describe("getHabitDayStatus", () => {
  it("marks a done day and keeps the actual over-target count", () => {
    const h = habit({ targetCount: 8 });
    const s = getHabitDayStatus(h, [version("2026-10-26", { targetCount: 8 })], [log("2026-11-04", 10)], "2026-11-04");

    expect(s.scheduled).toBe(true);
    expect(s.done).toBe(true);
    expect(s.completed).toBe(10);
    expect(s.target).toBe(8);
  });

  it("treats a paused day as unscheduled, not missed", () => {
    const s = getHabitDayStatus(
      habit(),
      [version("2026-10-26", { status: "paused" })],
      [],
      "2026-11-04",
    );

    expect(s.scheduled).toBe(false);
    expect(s.paused).toBe(true);
    expect(s.done).toBe(false);
  });

  it("treats a date before startDate as unscheduled", () => {
    const v = [version("2026-11-05", { startDate: "2026-11-05" })];
    const s = getHabitDayStatus(habit({ startDate: "2026-11-05" }), v, [], "2026-11-04");

    expect(s.scheduled).toBe(false);
    expect(s.done).toBe(false);
  });
});

describe("calculateHabitStats (daily)", () => {
  const fromNov2 = [version("2026-11-02", { startDate: "2026-11-02" })];

  it("counts a simple 3-day run", () => {
    const stats = calculateHabitStats({
      habit: habit({ startDate: "2026-11-02" }),
      versions: fromNov2,
      logs: [log("2026-11-02"), log("2026-11-03"), log("2026-11-04")],
      todayKey: "2026-11-05",
    });

    expect(stats.planned).toBe(3);
    expect(stats.completed).toBe(3);
    expect(stats.missed).toBe(0);
    expect(stats.completionRate).toBe(100);
    expect(stats.currentStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
  });

  it("does not count a pending today as a miss and keeps the streak alive", () => {
    const stats = calculateHabitStats({
      habit: habit({ startDate: "2026-11-03" }),
      versions: [version("2026-11-03", { startDate: "2026-11-03" })],
      logs: [log("2026-11-03"), log("2026-11-04")],
      todayKey: "2026-11-05",
    });

    expect(stats.planned).toBe(2);
    expect(stats.missed).toBe(0);
    expect(stats.currentStreak).toBe(2);
  });

  it("counts today once it is done", () => {
    const stats = calculateHabitStats({
      habit: habit({ startDate: "2026-11-04" }),
      versions: [version("2026-11-04", { startDate: "2026-11-04" })],
      logs: [log("2026-11-04"), log("2026-11-05")],
      todayKey: "2026-11-05",
    });

    expect(stats.planned).toBe(2);
    expect(stats.completed).toBe(2);
    expect(stats.currentStreak).toBe(2);
  });

  it("breaks the streak on a missed closed day", () => {
    const stats = calculateHabitStats({
      habit: habit({ startDate: "2026-11-02" }),
      versions: fromNov2,
      logs: [log("2026-11-02"), log("2026-11-03"), log("2026-11-05")],
      todayKey: "2026-11-06",
    });

    // 11-02, 11-03 done; 11-04 missed; 11-05 done; 11-06 pending (excluded).
    expect(stats.planned).toBe(4);
    expect(stats.completed).toBe(3);
    expect(stats.missed).toBe(1);
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(2);
  });

  it("returns a real zero when nothing was done, null when nothing was planned", () => {
    const zero = calculateHabitStats({
      habit: habit({ startDate: "2026-11-02" }),
      versions: fromNov2,
      logs: [],
      todayKey: "2026-11-05",
    });

    expect(zero.planned).toBe(3);
    expect(zero.completionRate).toBe(0);

    const empty = calculateHabitStats({
      habit: habit({ startDate: "2026-11-10" }),
      versions: [version("2026-11-10", { startDate: "2026-11-10" })],
      logs: [],
      todayKey: "2026-11-05",
    });

    expect(empty.planned).toBe(0);
    expect(empty.completionRate).toBeNull();
  });

  it("caps the rate at 100 while keeping the actual count", () => {
    const stats = calculateHabitStats({
      habit: habit({ targetCount: 8, startDate: "2026-11-04" }),
      versions: [version("2026-11-04", { targetCount: 8, startDate: "2026-11-04" })],
      logs: [log("2026-11-04", 10)],
      todayKey: "2026-11-05",
    });

    expect(stats.completionRate).toBe(100);
  });
});

describe("calculateHabitStats (weekdays)", () => {
  const monFriFromOct30 = [
    version("2026-10-30", {
      frequency: "weekdays",
      weekdays: [1, 2, 3, 4, 5],
      startDate: "2026-10-30",
    }),
  ];
  const monFriFromNov2 = [
    version("2026-11-02", {
      frequency: "weekdays",
      weekdays: [1, 2, 3, 4, 5],
      startDate: "2026-11-02",
    }),
  ];

  it("skips the weekend without breaking the streak", () => {
    // 2026-10-30 Fri, 10-31 Sat, 11-01 Sun, 11-02 Mon, 11-03 Tue.
    const stats = calculateHabitStats({
      habit: habit({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5], startDate: "2026-10-30" }),
      versions: monFriFromOct30,
      logs: [log("2026-10-30"), log("2026-11-02"), log("2026-11-03")],
      todayKey: "2026-11-04",
    });

    expect(stats.missed).toBe(0);
    expect(stats.currentStreak).toBe(3);
  });

  it("counts a missed scheduled weekday", () => {
    const stats = calculateHabitStats({
      habit: habit({ frequency: "weekdays", weekdays: [1, 2, 3, 4, 5], startDate: "2026-11-02" }),
      versions: monFriFromNov2,
      logs: [log("2026-11-02")],
      todayKey: "2026-11-04",
    });

    // 11-02 done, 11-03 missed, today 11-04 pending.
    expect(stats.missed).toBe(1);
    expect(stats.currentStreak).toBe(0);
  });
});

describe("calculateHabitStats (pauses and unknown past)", () => {
  it("excludes paused days from the denominator and the streak", () => {
    const versions = [
      version("2026-11-01", { startDate: "2026-11-01", effectiveTo: "2026-11-01" }),
      version("2026-11-02", { startDate: "2026-11-01", status: "paused", effectiveTo: "2026-11-03" }),
      version("2026-11-04", { startDate: "2026-11-01" }),
    ];
    const stats = calculateHabitStats({
      habit: habit({ startDate: "2026-11-01" }),
      versions,
      logs: [log("2026-11-01"), log("2026-11-04")],
      todayKey: "2026-11-05",
    });

    expect(stats.missed).toBe(0);
    expect(stats.currentStreak).toBe(2);
  });

  it("treats days with no version as unknown: no obligations", () => {
    const stats = calculateHabitStats({
      habit: habit(),
      versions: [version("2026-11-03")],
      logs: [log("2026-11-03"), log("2026-11-04")],
      todayKey: "2026-11-05",
    });

    expect(stats.planned).toBe(2);
    expect(stats.missed).toBe(0);
    expect(stats.currentStreak).toBe(2);
  });
});

describe("calculateHabitStats (schedule change)", () => {
  it("judges each day by the target that was effective then", () => {
    const versions = [
      version("2026-11-02", { targetCount: 1, startDate: "2026-11-02", effectiveTo: "2026-11-02" }),
      version("2026-11-03", { targetCount: 3, startDate: "2026-11-02" }),
    ];
    const stats = calculateHabitStats({
      habit: habit({ targetCount: 3, startDate: "2026-11-02" }),
      versions,
      logs: [log("2026-11-02", 1), log("2026-11-03", 2)],
      todayKey: "2026-11-04",
    });

    // 11-02: 1/1 done (old target). 11-03: 2/3 missed (new target).
    expect(stats.planned).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.missed).toBe(1);
    expect(stats.currentStreak).toBe(0);
  });
});

describe("calculateHabitStats (weekly)", () => {
  const weekly3FromNov2 = [
    version("2026-11-02", { frequency: "weekly", targetCount: 3, startDate: "2026-11-02" }),
  ];

  it("sums the ISO week Monday to Sunday", () => {
    // Week of 2026-11-02 (Mon) .. 2026-11-08 (Sun): 1 + 2 = 3 → done.
    const done = calculateHabitStats({
      habit: habit({ frequency: "weekly", targetCount: 3, startDate: "2026-11-02" }),
      versions: weekly3FromNov2,
      logs: [log("2026-11-03", 1), log("2026-11-08", 2)],
      todayKey: "2026-11-09",
    });

    expect(done.planned).toBe(1);
    expect(done.completed).toBe(1);
    expect(done.completionRate).toBe(100);
  });

  it("does not split a Sunday off into the next week", () => {
    // A Sunday log belongs to the week that started the previous Monday.
    const stats = calculateHabitStats({
      habit: habit({ frequency: "weekly", targetCount: 2, startDate: "2026-11-02" }),
      versions: [version("2026-11-02", { frequency: "weekly", targetCount: 2, startDate: "2026-11-02" })],
      logs: [log("2026-11-08", 2)],
      todayKey: "2026-11-09",
    });

    expect(stats.completed).toBe(1);
  });

  it("leaves the current week out of the denominator until it is done", () => {
    const stats = calculateHabitStats({
      habit: habit({ frequency: "weekly", targetCount: 3 }),
      versions: [version("2026-10-26", { frequency: "weekly", targetCount: 3 })],
      // Last week done (3), this week 1/3 so far, today Thursday.
      logs: [log("2026-10-28", 3), log("2026-11-04", 1)],
      todayKey: "2026-11-05",
    });

    expect(stats.planned).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.missed).toBe(0);
    expect(stats.currentStreak).toBe(1);
  });

  it("counts a closed short week as missed", () => {
    const stats = calculateHabitStats({
      habit: habit({ frequency: "weekly", targetCount: 3, startDate: "2026-11-02" }),
      versions: weekly3FromNov2,
      logs: [log("2026-11-04", 1)],
      todayKey: "2026-11-09",
    });

    expect(stats.planned).toBe(1);
    expect(stats.missed).toBe(1);
    expect(stats.completionRate).toBe(0);
  });

  it("judges a partial first week by the logs since startDate", () => {
    // Habit starts Thursday 2026-11-05; Thu–Sun sum 5/5 → done.
    const stats = calculateHabitStats({
      habit: habit({ frequency: "weekly", targetCount: 5, startDate: "2026-11-05" }),
      versions: [version("2026-11-05", { frequency: "weekly", targetCount: 5, startDate: "2026-11-05" })],
      logs: [log("2026-11-05", 2), log("2026-11-08", 3)],
      todayKey: "2026-11-09",
    });

    expect(stats.planned).toBe(1);
    expect(stats.completed).toBe(1);
  });
});

describe("calculateHabitStats (timezone)", () => {
  it("derives today in the profile timezone at the midnight boundary", () => {
    // 2026-11-04 18:30 UTC is already 2026-11-05 in Asia/Bishkek (UTC+6).
    const instant = new Date("2026-11-04T18:30:00.000Z");

    expect(toDateKey(instant, "Asia/Bishkek")).toBe("2026-11-05");
    expect(toDateKey(instant, "UTC")).toBe("2026-11-04");
  });
});
