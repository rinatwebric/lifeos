import { describe, expect, it } from "vitest";

import { plannerDayBounds } from "@/features/planner/usePlannerDay";
import { localDateTimeToIso } from "@/lib/dates";
import type { BlockType, TimeBlock } from "@/types/domain";

import { DASHBOARD_SCHEDULE_LIMIT, buildDashboardSchedule } from "./useDashboardSchedule";

const TIME_ZONE = "Asia/Bishkek";
const DATE_KEY = "2026-11-04";

/** Wall time on the test day → stored UTC ISO (what the API returns). */
function at(wallTime: string): string {
  return localDateTimeToIso(`${DATE_KEY}T${wallTime}`, TIME_ZONE);
}

let blockSeq = 0;
function makeBlock(
  startWall: string,
  endWall: string,
  overrides: Partial<TimeBlock> = {},
): TimeBlock {
  blockSeq += 1;
  return {
    id: `block-${blockSeq}`,
    userId: "u1",
    taskId: null,
    title: `Block ${blockSeq}`,
    blockType: "task" as BlockType,
    startTime: at(startWall),
    endTime: at(endWall),
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

const bounds = plannerDayBounds(DATE_KEY, TIME_ZONE);
const now = new Date(at("12:00"));

describe("buildDashboardSchedule", () => {
  it("returns an empty day when there are no blocks", () => {
    const schedule = buildDashboardSchedule({ blocks: [], timeZone: TIME_ZONE, now, bounds });

    expect(schedule.blocks).toEqual([]);
    expect(schedule.dayBlockCount).toBe(0);
    expect(schedule.isEmpty).toBe(true);
    expect(schedule.isAllPast).toBe(false);
    expect(schedule.totals).toEqual({ task: 0, break: 0, personal: 0, scheduled: 0 });
  });

  it("filters out blocks that already ended", () => {
    const finished = makeBlock("08:00", "09:00");
    const current = makeBlock("11:30", "12:30");
    const upcoming = makeBlock("13:00", "14:00");

    const schedule = buildDashboardSchedule({
      blocks: [finished, current, upcoming],
      timeZone: TIME_ZONE,
      now,
      bounds,
    });

    expect(schedule.blocks.map((block) => block.id)).toEqual([current.id, upcoming.id]);
    expect(schedule.dayBlockCount).toBe(3);
    expect(schedule.isEmpty).toBe(false);
    expect(schedule.isAllPast).toBe(false);
  });

  it("reports a day whose blocks are all in the past", () => {
    const schedule = buildDashboardSchedule({
      blocks: [makeBlock("08:00", "09:00"), makeBlock("10:00", "11:00")],
      timeZone: TIME_ZONE,
      now,
      bounds,
    });

    expect(schedule.blocks).toEqual([]);
    expect(schedule.isEmpty).toBe(false);
    expect(schedule.isAllPast).toBe(true);
  });

  it("orders upcoming blocks by start time and labels them in the user's zone", () => {
    const late = makeBlock("16:00", "17:00");
    const early = makeBlock("13:00", "13:30");
    const middle = makeBlock("14:00", "15:00");

    const schedule = buildDashboardSchedule({
      blocks: [late, early, middle],
      timeZone: TIME_ZONE,
      now,
      bounds,
    });

    expect(schedule.blocks.map((block) => block.title)).toEqual([
      early.title,
      middle.title,
      late.title,
    ]);
    expect(schedule.blocks[0].startLabel).toBe("13:00");
    expect(schedule.blocks[0].endLabel).toBe("13:30");
    expect(schedule.blocks[0].durationMinutes).toBe(30);
  });

  it("sums minutes per type over the whole day, past blocks included", () => {
    const schedule = buildDashboardSchedule({
      blocks: [
        makeBlock("08:00", "09:00"),
        makeBlock("13:00", "14:00"),
        makeBlock("14:00", "14:15", { blockType: "break" }),
        makeBlock("15:00", "15:30", { blockType: "personal" }),
      ],
      timeZone: TIME_ZONE,
      now,
      bounds,
    });

    expect(schedule.totals).toEqual({ task: 120, break: 15, personal: 30, scheduled: 165 });
  });

  it("keeps at most the preview limit of upcoming blocks", () => {
    const blocks = Array.from({ length: DASHBOARD_SCHEDULE_LIMIT + 2 }, (_, index) =>
      makeBlock(`1${index.toString()}:00`, `1${index.toString()}:30`, { title: `Slot ${index}` }),
    );

    const schedule = buildDashboardSchedule({
      blocks,
      timeZone: TIME_ZONE,
      now,
      limit: 3,
      bounds,
    });

    expect(schedule.blocks).toHaveLength(3);
    expect(schedule.dayBlockCount).toBe(DASHBOARD_SCHEDULE_LIMIT + 2);
  });

  it("names a task block by its linked task and falls back to the block title", () => {
    const linked = makeBlock("13:00", "14:00", { taskId: "task-1", title: "Fallback" });
    const standalone = makeBlock("15:00", "15:30", { blockType: "break", title: "Lunch" });

    const schedule = buildDashboardSchedule({
      blocks: [linked, standalone],
      timeZone: TIME_ZONE,
      now,
      bounds,
      taskTitleById: new Map([["task-1", "Write the report"]]),
    });

    expect(schedule.blocks.map((block) => block.title)).toEqual(["Write the report", "Lunch"]);
  });

  it("clips a block that starts before local midnight and drops an inverted interval", () => {
    const crossing = makeBlock("23:30", "01:30", {
      title: "Early",
      startTime: localDateTimeToIso("2026-11-03T23:30", TIME_ZONE),
    });
    const inverted = makeBlock("16:00", "15:00");

    const schedule = buildDashboardSchedule({
      blocks: [crossing, inverted],
      timeZone: TIME_ZONE,
      now: new Date(at("00:00")),
      bounds,
    });

    // Started "yesterday" in wall time: clamped to this day's midnight.
    expect(schedule.blocks).toHaveLength(1);
    expect(schedule.blocks[0].startLabel).toBe("00:00");
    expect(schedule.blocks[0].durationMinutes).toBe(90);
    expect(schedule.dayBlockCount).toBe(1);
  });
});
