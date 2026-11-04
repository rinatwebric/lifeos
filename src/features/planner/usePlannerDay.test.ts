import { describe, expect, it } from "vitest";

import { localDateTimeToIso } from "@/lib/dates";
import type { TimeBlock } from "@/types/domain";

import {
  buildPlannerDay,
  formatDurationMinutes,
  isValidDateKey,
  minutesToLabel,
  parseWeeklyAvailability,
  plannerDayBounds,
  shiftDateKey,
  type BuildPlannerDayInput,
} from "./usePlannerDay";

const TIME_ZONE = "Europe/Berlin";
const DATE_KEY = "2026-11-04";
/** 06:00 in Berlin: nothing on this day is in the past yet. */
const NOW = new Date("2026-11-04T05:00:00.000Z");
const TASK_ID = "123e4567-e89b-12d3-a456-426614174000";

function at(local: string, dateKey = DATE_KEY): string {
  return localDateTimeToIso(`${dateKey}T${local}`, TIME_ZONE);
}

const BLOCK_BASE: Omit<TimeBlock, "id" | "startTime" | "endTime"> = {
  userId: "user-1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  taskId: null,
  title: "Block",
  blockType: "personal",
};

function makeBlock(
  overrides: Partial<TimeBlock> & Pick<TimeBlock, "id" | "startTime" | "endTime">,
): TimeBlock {
  return { ...BLOCK_BASE, ...overrides };
}

function build(overrides: Partial<BuildPlannerDayInput> = {}) {
  return buildPlannerDay({
    blocks: [],
    dateKey: DATE_KEY,
    timeZone: TIME_ZONE,
    now: NOW,
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
    ...overrides,
  });
}
describe("buildPlannerDay", () => {
  it("models an empty day as one free window and no conflicts", () => {
    const day = build();

    expect(day.isEmpty).toBe(true);
    expect(day.blocks).toEqual([]);
    expect(day.busy).toEqual([]);
    expect(day.free).toEqual([
      {
        startMinutes: 420,
        endMinutes: 1380,
        durationMinutes: 960,
        startLabel: "07:00",
        endLabel: "23:00",
      },
    ]);
    expect(day.totals).toEqual({ task: 0, break: 0, personal: 0, scheduled: 0, free: 960 });
    expect(day.hasConflicts).toBe(false);
    expect(day.hasWakingHours).toBe(true);
    expect(day.scale).toMatchObject({ startLabel: "07:00", endLabel: "23:00" });
  });

  it("names a task block by its task, totals each type and leaves the gaps free", () => {
    const day = build({
      blocks: [
        makeBlock({
          id: "task-1",
          blockType: "task",
          taskId: TASK_ID,
          title: "Block title",
          startTime: at("09:00"),
          endTime: at("10:30"),
        }),
        makeBlock({
          id: "break-1",
          blockType: "break",
          title: "Coffee",
          startTime: at("10:30"),
          endTime: at("10:45"),
        }),
        makeBlock({
          id: "personal-1",
          title: "Walk",
          startTime: at("12:00"),
          endTime: at("12:30"),
        }),
      ],
      taskTitleById: new Map([[TASK_ID, "Write the report"]]),
    });

    expect(day.isEmpty).toBe(false);
    expect(day.blocks.map((block) => block.id)).toEqual(["task-1", "break-1", "personal-1"]);
    expect(day.blocks[0]).toMatchObject({
      title: "Write the report",
      blockType: "task",
      startLabel: "09:00",
      endLabel: "10:30",
      durationMinutes: 90,
      overlaps: false,
      crossesSleep: false,
    });
    expect(day.blocks[1].title).toBe("Coffee");
    expect(day.totals).toEqual({ task: 90, break: 15, personal: 30, scheduled: 135, free: 825 });
    expect(day.free.map((window) => [window.startLabel, window.endLabel])).toEqual([
      ["07:00", "09:00"],
      ["10:45", "12:00"],
      ["12:30", "23:00"],
    ]);
    // Touching intervals are one occupied stretch: 09:00–10:30 + 10:30–10:45.
    expect(day.busy.map((interval) => [interval.startLabel, interval.endLabel])).toEqual([
      ["09:00", "10:45"],
      ["12:00", "12:30"],
    ]);
    expect(day.hasConflicts).toBe(false);
  });
  it("marks both sides of an overlap and merges the shared time", () => {
    const day = build({
      blocks: [
        makeBlock({ id: "a", startTime: at("09:00"), endTime: at("10:00") }),
        makeBlock({ id: "b", startTime: at("09:30"), endTime: at("10:30") }),
      ],
    });

    expect(day.conflicts).toEqual([
      { blockId: "b", kind: "overlap", otherId: "a", at: at("09:30") },
    ]);
    expect(day.blocks.map((block) => block.overlaps)).toEqual([true, true]);
    expect(day.overlappingBlocks).toBe(2);
    expect(day.hasConflicts).toBe(true);
    expect(day.busy).toEqual([
      {
        startMinutes: 540,
        endMinutes: 630,
        durationMinutes: 90,
        startLabel: "09:00",
        endLabel: "10:30",
      },
    ]);
    expect(day.totals.personal).toBe(120);
  });

  it("clips an overnight block to the day without breaking the maths", () => {
    const day = build({
      blocks: [
        makeBlock({
          id: "night",
          title: "Late reading",
          startTime: at("22:00", "2026-11-03"),
          endTime: at("00:30"),
        }),
      ],
    });

    expect(day.blocks).toHaveLength(1);
    expect(day.blocks[0]).toMatchObject({
      startLabel: "00:00",
      endLabel: "00:30",
      durationMinutes: 30,
      crossesSleep: true,
      overlaps: false,
    });
    expect(day.totals.personal).toBe(30);
    expect(day.hasConflicts).toBe(true);
    expect(day.sleepBlocks).toBe(1);
  });

  it("keeps a past block in the day but does not mark it as a conflict", () => {
    const day = build({
      now: new Date("2026-11-04T12:00:00.000Z"),
      blocks: [
        makeBlock({ id: "done", startTime: at("09:00"), endTime: at("09:30") }),
        makeBlock({ id: "next", startTime: at("15:00"), endTime: at("15:30") }),
      ],
    });

    expect(day.blocks).toHaveLength(2);
    expect(day.conflicts).toEqual([{ blockId: "done", kind: "past", at: at("09:30") }]);
    expect(day.hasConflicts).toBe(false);
    expect(day.overlappingBlocks).toBe(0);
    expect(day.totals.scheduled).toBe(60);
  });

  it("ignores blocks outside the day, inverted intervals and unreadable dates", () => {
    const day = build({
      blocks: [
        makeBlock({
          id: "tomorrow",
          startTime: at("09:00", "2026-11-05"),
          endTime: at("10:00", "2026-11-05"),
        }),
        makeBlock({ id: "inverted", startTime: at("12:00"), endTime: at("11:00") }),
        makeBlock({ id: "broken", startTime: "not-a-date", endTime: at("10:00") }),
      ],
    });

    expect(day.isEmpty).toBe(true);
    expect(day.conflicts).toEqual([]);
    expect(day.totals.scheduled).toBe(0);
  });

  it("claims no free time and no sleep conflict when waking hours are unknown", () => {
    const day = build({
      wakeUpTime: null,
      sleepTime: null,
      blocks: [makeBlock({ id: "morning", startTime: at("09:00"), endTime: at("10:00") })],
    });

    expect(day.hasWakingHours).toBe(false);
    expect(day.free).toEqual([]);
    expect(day.totals.free).toBe(0);
    expect(day.conflicts).toEqual([]);
    expect(day.scale).toMatchObject({ startLabel: "00:00", endLabel: "24:00" });
    expect(day.blocks[0].crossesSleep).toBe(false);
  });
});
describe("planner day helpers", () => {
  it("formats durations with a unit", () => {
    expect(formatDurationMinutes(0)).toBe("0 min");
    expect(formatDurationMinutes(1)).toBe("1 min");
    expect(formatDurationMinutes(2)).toBe("2 min");
    expect(formatDurationMinutes(5)).toBe("5 min");
    expect(formatDurationMinutes(21)).toBe("21 min");
    expect(formatDurationMinutes(45)).toBe("45 min");
    expect(formatDurationMinutes(60)).toBe("1 h");
    expect(formatDurationMinutes(61)).toBe("1 h 1 min");
    expect(formatDurationMinutes(90)).toBe("1 h 30 min");
    expect(formatDurationMinutes(125)).toBe("2 h 5 min");
  });

  it("formats durations in Russian with 1/2/5/11/21 forms", () => {
    expect(formatDurationMinutes(0, "ru")).toBe("0 минут");
    expect(formatDurationMinutes(1, "ru")).toBe("1 минута");
    expect(formatDurationMinutes(2, "ru")).toBe("2 минуты");
    expect(formatDurationMinutes(5, "ru")).toBe("5 минут");
    expect(formatDurationMinutes(21, "ru")).toBe("21 минута");
    expect(formatDurationMinutes(60, "ru")).toBe("1 час");
    expect(formatDurationMinutes(61, "ru")).toBe("1 час 1 минута");
    expect(formatDurationMinutes(90, "ru")).toBe("1 час 30 минут");
    expect(formatDurationMinutes(125, "ru")).toBe("2 часа 5 минут");
  });

  it("labels minutes after local midnight", () => {
    expect(minutesToLabel(0)).toBe("00:00");
    expect(minutesToLabel(555)).toBe("09:15");
    expect(minutesToLabel(1440)).toBe("24:00");
  });

  it("shifts date keys across month and year boundaries", () => {
    expect(shiftDateKey("2026-11-04", 1)).toBe("2026-11-05");
    expect(shiftDateKey("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("rejects impossible date keys", () => {
    expect(isValidDateKey("2026-11-04")).toBe(true);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("04-11-2026")).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
    expect(() => shiftDateKey("2026-13-01", 1)).toThrow(/Invalid date key/);
  });

  it("returns local midnights for the day bounds", () => {
    expect(plannerDayBounds(DATE_KEY, TIME_ZONE)).toEqual({
      start: "2026-11-03T23:00:00.000Z",
      end: "2026-11-04T23:00:00.000Z",
    });
  });

  it("keeps only well-formed availability intervals", () => {
    expect(
      parseWeeklyAvailability({
        mon: [{ start: "09:00", end: "18:00" }],
        tue: [{ start: "9:00", end: "18:00" }],
        wed: "09:00-18:00",
        thu: [{ start: "09:00" }],
      }),
    ).toEqual({ mon: [{ start: "09:00", end: "18:00" }] });
    expect(parseWeeklyAvailability(null)).toEqual({});
  });
});
