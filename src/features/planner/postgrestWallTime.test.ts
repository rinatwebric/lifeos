import { describe, expect, it } from "vitest";

import { localDateTimeToIso } from "@/lib/dates";
import type { Task, TimeBlock } from "@/types/domain";

import { collectBlockWarnings } from "./blockMessages";
import { buildPlannerDay, parseWeeklyAvailability, readWallTime } from "./usePlannerDay";
import { buildPlannerWeek } from "./usePlannerWeek";
import { buildPlanPreview } from "./usePlanPreview";

/**
 * PostgREST serializes Postgres `time` columns as "HH:MM:SS" (never the
 * "HH:MM" the forms write). The strict reader used to return null for that
 * shape, so on live data the app believed waking hours were unset: no Accept,
 * no sleep warnings, no day bounds. These tests pin the read boundary —
 * raw DB serialization in, normalized planner input out.
 */
const TIME_ZONE = "Europe/Berlin";
const DATE_KEY = "2026-11-04";
/** 06:00 in Berlin: nothing later on this day is in the past yet. */
const NOW = new Date("2026-11-04T05:00:00.000Z");

function at(local: string, dateKey = DATE_KEY): string {
  return localDateTimeToIso(`${dateKey}T${local}`, TIME_ZONE);
}

function makeBlock(
  overrides: Partial<TimeBlock> & Pick<TimeBlock, "id" | "startTime" | "endTime">,
): TimeBlock {
  return {
    userId: "user-1",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    taskId: null,
    title: "Block",
    blockType: "personal",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    userId: "user-1",
    goalId: null,
    milestoneId: null,
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: 30,
    completedAt: null,
    recurrenceRuleId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Raw DB values as PostgREST delivers them, normalized exactly like the hooks do. */
function wakingHours() {
  return {
    wakeUpTime: readWallTime("07:00:00"),
    sleepTime: readWallTime("23:00:00"),
  };
}

describe("PostgREST wall-time regression", () => {
  it("normalizes time columns and jsonb windows at the read boundary", () => {
    expect(readWallTime("07:00:00")).toBe("07:00");
    expect(readWallTime("23:00:00")).toBe("23:00");
    expect(
      parseWeeklyAvailability({ mon: [{ start: "09:00:00", end: "17:00:00" }] }),
    ).toStrictEqual({ mon: [{ start: "09:00", end: "17:00" }] });
  });

  it("builds day bounds from PostgREST waking hours", () => {
    const day = buildPlannerDay({
      blocks: [],
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      now: NOW,
      ...wakingHours(),
      workingHours: {},
      studyHours: {},
    });

    expect(day.hasWakingHours).toBe(true);
    expect(day.scale).toMatchObject({ startLabel: "07:00", endLabel: "23:00" });
    expect(day.free.length).toBeGreaterThan(0);
  });

  it("offers slots and Accept from PostgREST waking hours", () => {
    const preview = buildPlanPreview({
      tasks: [makeTask({ id: "t1", title: "Write the report" })],
      blocks: [],
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      now: NOW,
      ...wakingHours(),
      workingHours: {},
      studyHours: {},
      preferredWorkPeriods: {},
    });

    expect(preview.summary.hasWakingHours).toBe(true);
    expect(preview.slots).toHaveLength(1);
    expect(preview.canAccept).toBe(true);
  });

  it("marks sleep conflicts in the week from PostgREST waking hours", () => {
    const week = buildPlannerWeek({
      blocks: [
        makeBlock({ id: "late", startTime: at("23:30"), endTime: at("23:45") }),
      ],
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      now: NOW,
      ...wakingHours(),
      workingHours: {},
      studyHours: {},
    });

    const wednesday = week.days.find((day) => day.dateKey === DATE_KEY);

    expect(wednesday?.day.hasWakingHours).toBe(true);
    expect(wednesday?.hasConflict).toBe(true);
  });

  it("warns about sleep for PostgREST waking hours", () => {
    const warnings = collectBlockWarnings({
      startTime: at("22:00"),
      endTime: at("23:30"),
      blocks: [],
      now: NOW,
      timeZone: TIME_ZONE,
      ...wakingHours(),
    });

    expect(warnings.map((warning) => warning.kind)).toContain("sleep");
  });
});
