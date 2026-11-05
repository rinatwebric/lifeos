import { describe, expect, it } from "vitest";

import {
  computeFreeWindows,
  explainSlot,
  explainSlotParts,
  findConflicts,
  planDay,
  scoreTask,
  selectCandidates,
  type DayKey,
  type ScoreContext,
  type WeeklyAvailability,
} from "@/lib/planner";
import type { Task, TimeBlock } from "@/types/domain";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const DATE_KEY = "2026-11-05"; // A Thursday.
const TZ = "UTC";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "user-1",
    goalId: null,
    milestoneId: null,
    title: "Write report",
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: 60,
    completedAt: null,
    recurrenceRuleId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeBlock(id: string, startTime: string, endTime: string): TimeBlock {
  return {
    id,
    userId: "user-1",
    taskId: null,
    title: `Block ${id}`,
    startTime,
    endTime,
    blockType: "personal",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
}

function everyDay(start: string, end: string): WeeklyAvailability {
  const days: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  return Object.fromEntries(days.map((day) => [day, [{ start, end }]]));
}

function context(overrides: Partial<ScoreContext> = {}): ScoreContext {
  return { now: NOW, timeZone: TZ, ...overrides };
}

describe("computeFreeWindows", () => {
  it("wraps sleep past midnight onto the next day", () => {
    const windows = computeFreeWindows({
      dateKey: DATE_KEY,
      timeZone: TZ,
      wakeUpTime: "07:00",
      sleepTime: "02:00",
      workingHours: {},
      studyHours: {},
      blocks: [
        makeBlock("b1", "2026-11-05T22:00:00.000Z", "2026-11-05T23:00:00.000Z"),
        makeBlock("b2", "2026-11-06T00:30:00.000Z", "2026-11-06T01:30:00.000Z"),
      ],
    });

    expect(windows).toEqual([
      { start: "2026-11-05T07:00:00.000Z", end: "2026-11-05T22:00:00.000Z" },
      { start: "2026-11-05T23:00:00.000Z", end: "2026-11-06T00:30:00.000Z" },
      { start: "2026-11-06T01:30:00.000Z", end: "2026-11-06T02:00:00.000Z" },
    ]);
  });

  it("treats empty working hours as the whole wake day minus blocks", () => {
    const windows = computeFreeWindows({
      dateKey: DATE_KEY,
      timeZone: TZ,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: {},
      studyHours: {},
      blocks: [
        makeBlock("b1", "2026-11-05T10:00:00.000Z", "2026-11-05T11:00:00.000Z"),
        makeBlock("b2", "2026-11-05T14:00:00.000Z", "2026-11-05T14:30:00.000Z"),
      ],
    });

    expect(windows).toEqual([
      { start: "2026-11-05T07:00:00.000Z", end: "2026-11-05T10:00:00.000Z" },
      { start: "2026-11-05T11:00:00.000Z", end: "2026-11-05T14:00:00.000Z" },
      { start: "2026-11-05T14:30:00.000Z", end: "2026-11-05T23:00:00.000Z" },
    ]);
  });

  it("excludes work hours: wake 07–23, work 09–18, block 10–11 frees 07–09 and 18–23", () => {
    const windows = computeFreeWindows({
      dateKey: DATE_KEY,
      timeZone: TZ,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: { thu: [{ start: "09:00", end: "18:00" }] },
      studyHours: {},
      blocks: [makeBlock("b1", "2026-11-05T10:00:00.000Z", "2026-11-05T11:00:00.000Z")],
    });

    // Д1: work hours are subtracted with the blocks; the block inside work changes nothing.
    expect(windows).toEqual([
      { start: "2026-11-05T07:00:00.000Z", end: "2026-11-05T09:00:00.000Z" },
      { start: "2026-11-05T18:00:00.000Z", end: "2026-11-05T23:00:00.000Z" },
    ]);
  });

  it("subtracts working and study hours of the same day (Д1)", () => {
    const windows = computeFreeWindows({
      dateKey: DATE_KEY,
      timeZone: TZ,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: everyDay("09:00", "18:00"),
      studyHours: everyDay("19:00", "21:00"),
      blocks: [],
    });

    expect(windows).toEqual([
      { start: "2026-11-05T07:00:00.000Z", end: "2026-11-05T09:00:00.000Z" },
      { start: "2026-11-05T18:00:00.000Z", end: "2026-11-05T19:00:00.000Z" },
      { start: "2026-11-05T21:00:00.000Z", end: "2026-11-05T23:00:00.000Z" },
    ]);
  });

  it("cuts blocks from the remaining free time outside work hours", () => {
    const windows = computeFreeWindows({
      dateKey: DATE_KEY,
      timeZone: TZ,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: { thu: [{ start: "09:00", end: "18:00" }] },
      studyHours: {},
      blocks: [makeBlock("b1", "2026-11-05T19:00:00.000Z", "2026-11-05T20:00:00.000Z")],
    });

    expect(windows).toEqual([
      { start: "2026-11-05T07:00:00.000Z", end: "2026-11-05T09:00:00.000Z" },
      { start: "2026-11-05T18:00:00.000Z", end: "2026-11-05T19:00:00.000Z" },
      { start: "2026-11-05T20:00:00.000Z", end: "2026-11-05T23:00:00.000Z" },
    ]);
  });

  it("keeps windows intact when a block only touches their edges", () => {
    const input = {
      dateKey: DATE_KEY,
      timeZone: TZ,
      wakeUpTime: "09:00",
      sleepTime: "11:00",
      workingHours: {},
      studyHours: {},
      blocks: [] as TimeBlock[],
    };

    expect(computeFreeWindows(input)).toEqual([
      { start: "2026-11-05T09:00:00.000Z", end: "2026-11-05T11:00:00.000Z" },
    ]);

    const touchingBefore = {
      ...input,
      blocks: [makeBlock("b1", "2026-11-05T08:00:00.000Z", "2026-11-05T09:00:00.000Z")],
    };
    const touchingAfter = {
      ...input,
      blocks: [makeBlock("b1", "2026-11-05T11:00:00.000Z", "2026-11-05T12:00:00.000Z")],
    };

    expect(computeFreeWindows(touchingBefore)).toEqual(computeFreeWindows(input));
    expect(computeFreeWindows(touchingAfter)).toEqual(computeFreeWindows(input));
  });

  it("stays sorted with positive durations on a DST day (Europe/Berlin, 2026-03-29)", () => {
    const berlin = "Europe/Berlin";
    const sunday = "2026-03-29";

    const plain = computeFreeWindows({
      dateKey: sunday,
      timeZone: berlin,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: {},
      studyHours: {},
      blocks: [],
    });

    expect(plain).toEqual([{ start: "2026-03-29T05:00:00.000Z", end: "2026-03-29T21:00:00.000Z" }]);

    const busy = computeFreeWindows({
      dateKey: sunday,
      timeZone: berlin,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: { sun: [{ start: "09:00", end: "18:00" }] },
      studyHours: {},
      blocks: [makeBlock("b1", "2026-03-29T08:00:00.000Z", "2026-03-29T09:00:00.000Z")],
    });

    // Д1: work hours are subtracted; the block inside work changes nothing.
    expect(busy).toEqual([
      { start: "2026-03-29T05:00:00.000Z", end: "2026-03-29T07:00:00.000Z" },
      { start: "2026-03-29T16:00:00.000Z", end: "2026-03-29T21:00:00.000Z" },
    ]);

    for (let i = 0; i < busy.length; i += 1) {
      const window = busy[i];
      expect(Date.parse(window.end)).toBeGreaterThan(Date.parse(window.start));

      if (i > 0) {
        expect(Date.parse(window.start)).toBeGreaterThanOrEqual(Date.parse(busy[i - 1].end));
      }
    }
  });
});

describe("findConflicts", () => {
  const base = {
    now: new Date("2026-11-05T08:00:00.000Z"),
    timeZone: TZ,
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
  };

  it("flags nested blocks as overlap", () => {
    const conflicts = findConflicts(
      [
        makeBlock("outer", "2026-11-05T09:00:00.000Z", "2026-11-05T12:00:00.000Z"),
        makeBlock("inner", "2026-11-05T10:00:00.000Z", "2026-11-05T11:00:00.000Z"),
      ],
      base,
    );

    expect(conflicts).toEqual([
      {
        blockId: "inner",
        kind: "overlap",
        otherId: "outer",
        at: "2026-11-05T10:00:00.000Z",
      },
    ]);
  });

  it("does not treat touching edges as overlap", () => {
    const conflicts = findConflicts(
      [
        makeBlock("a", "2026-11-05T09:00:00.000Z", "2026-11-05T10:00:00.000Z"),
        makeBlock("b", "2026-11-05T10:00:00.000Z", "2026-11-05T11:00:00.000Z"),
      ],
      base,
    );

    expect(conflicts).toEqual([]);
  });

  it("flags blocks ending in the past, including exactly at now", () => {
    const conflicts = findConflicts(
      [
        makeBlock("past", "2026-11-05T10:00:00.000Z", "2026-11-05T11:00:00.000Z"),
        makeBlock("edge", "2026-11-05T11:00:00.000Z", "2026-11-05T12:00:00.000Z"),
        makeBlock("future", "2026-11-05T12:00:00.000Z", "2026-11-05T13:00:00.000Z"),
      ],
      { ...base, now: new Date("2026-11-05T12:00:00.000Z") },
    );

    expect(conflicts).toEqual([
      { blockId: "edge", kind: "past", at: "2026-11-05T12:00:00.000Z" },
      { blockId: "past", kind: "past", at: "2026-11-05T11:00:00.000Z" },
    ]);
  });

  it("reports a block over work hours as a soft work warning, not overlap", () => {
    const conflicts = findConflicts(
      [makeBlock("meeting", "2026-11-05T10:00:00.000Z", "2026-11-05T11:00:00.000Z")],
      { ...base, workingHours: { thu: [{ start: "09:00", end: "18:00" }] } },
    );

    expect(conflicts).toEqual([
      { blockId: "meeting", kind: "work", at: "2026-11-05T10:00:00.000Z" },
    ]);
  });

  it("flags blocks fully inside the sleep window", () => {
    const conflicts = findConflicts(
      [makeBlock("night", "2026-11-05T00:30:00.000Z", "2026-11-05T01:30:00.000Z")],
      { ...base, now: new Date("2026-11-04T12:00:00.000Z") },
    );

    expect(conflicts).toEqual([
      { blockId: "night", kind: "sleep", at: "2026-11-05T00:30:00.000Z" },
    ]);
  });

  it("flags blocks crossing the sleep boundary at the first asleep instant", () => {
    const conflicts = findConflicts(
      [makeBlock("late", "2026-11-05T22:30:00.000Z", "2026-11-05T23:30:00.000Z")],
      base,
    );

    expect(conflicts).toEqual([{ blockId: "late", kind: "sleep", at: "2026-11-05T23:00:00.000Z" }]);
  });
});

describe("scoreTask", () => {
  it("orders priorities critical above high above medium above low", () => {
    const scores = (["low", "medium", "high", "critical"] as const).map((priority) =>
      scoreTask(makeTask({ priority }), context()),
    );

    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(new Set(scores).size).toBe(4);
  });

  it("prefers a closer deadline at equal priority", () => {
    const sooner = scoreTask(makeTask({ dueDate: "2026-11-06" }), context());
    const later = scoreTask(makeTask({ dueDate: "2026-11-15" }), context());

    expect(sooner).toBeGreaterThan(later);
  });

  it("boosts an overdue task above an equal-priority task with a future deadline", () => {
    const overdue = makeTask({ dueDate: "2026-11-04" });
    const future = makeTask({ dueDate: "2026-11-06" });

    expect(scoreTask(overdue, context())).toBeGreaterThan(scoreTask(future, context()));
  });

  it("penalizes slots overlapping working hours without forbidding them (Д2)", () => {
    const task = makeTask();
    const hours = { thu: [{ start: "09:00", end: "18:00" }] };
    const overWork = { start: "2026-11-05T10:00:00.000Z", end: "2026-11-05T11:00:00.000Z" };
    const outsideWork = { start: "2026-11-05T19:00:00.000Z", end: "2026-11-05T20:00:00.000Z" };

    expect(scoreTask(task, context({ workingHours: hours }), overWork)).toBeLessThan(
      scoreTask(task, context({ workingHours: hours }), outsideWork),
    );
    expect(scoreTask(task, context({ workingHours: hours }), outsideWork)).toBe(
      scoreTask(task, context(), outsideWork),
    );
  });

  it("rewards a goal link and a preferred-period fit", () => {
    const plain = makeTask();
    const linked = makeTask({ goalId: "goal-1" });

    expect(scoreTask(linked, context())).toBeGreaterThan(scoreTask(plain, context()));

    const slot = { start: "2026-11-05T10:00:00.000Z", end: "2026-11-05T11:00:00.000Z" };
    const preferred = { thu: [{ start: "09:00", end: "12:00" }] };
    const withFit = scoreTask(plain, context({ preferredPeriods: preferred }), slot);
    const withoutFit = scoreTask(plain, context({ preferredPeriods: preferred }), {
      start: "2026-11-05T14:00:00.000Z",
      end: "2026-11-05T15:00:00.000Z",
    });

    expect(withFit).toBeGreaterThan(scoreTask(plain, context()));
    expect(withFit).toBeGreaterThan(withoutFit);
    expect(scoreTask(plain, context(), slot)).toBe(scoreTask(plain, context()));
  });
});

describe("selectCandidates", () => {
  it("splits closed, estimate-less and schedulable tasks", () => {
    const open = makeTask({ id: "open" });
    const noEstimate = makeTask({ id: "no-estimate", estimatedDurationMinutes: null });
    const done = makeTask({ id: "done", status: "completed" });
    const dropped = makeTask({ id: "dropped", status: "cancelled" });

    const result = selectCandidates({
      tasks: [open, noEstimate, done, dropped],
      now: NOW,
      timeZone: TZ,
    });

    expect(result.candidates.map((c) => c.task.id)).toEqual(["open"]);
    expect(result.needsEstimate.map((t) => t.id)).toEqual(["no-estimate"]);
    expect(result.excluded.map((t) => t.id)).toEqual(["done", "dropped"]);
  });

  it("flags overdue candidates and sorts by score, then due date, then id", () => {
    const overdue = makeTask({ id: "overdue", dueDate: "2026-11-04" });
    const future = makeTask({ id: "future", dueDate: "2026-11-06" });
    const farA = makeTask({ id: "a-far", dueDate: "2026-12-20" });
    const farB = makeTask({ id: "b-far", dueDate: "2026-12-25" });

    const result = selectCandidates({
      tasks: [farB, future, farA, overdue],
      now: NOW,
      timeZone: TZ,
    });

    expect(result.candidates.map((c) => c.task.id)).toEqual([
      "overdue",
      "future",
      "a-far",
      "b-far",
    ]);
    expect(result.candidates[0].overdue).toBe(true);
    expect(result.candidates.slice(1).every((c) => c.overdue === false)).toBe(true);
  });
});

describe("planDay", () => {
  const dayInput = {
    dateKey: DATE_KEY,
    timeZone: TZ,
    now: new Date("2026-11-05T08:00:00.000Z"),
    wakeUpTime: "09:00",
    sleepTime: "18:00",
    workingHours: {},
    studyHours: {},
    blocks: [] as TimeBlock[],
  };

  it("marks a task longer than any window as too-long", () => {
    const result = planDay({
      ...dayInput,
      wakeUpTime: "09:00",
      sleepTime: "10:00",
      tasks: [makeTask({ id: "long", estimatedDurationMinutes: 120 })],
    });

    expect(result.slots).toEqual([]);
    expect(result.doesNotFit).toEqual([{ taskId: "long", reason: "too-long" }]);
  });

  it("marks a task as no-window when earlier picks fragment the day", () => {
    const result = planDay({
      ...dayInput,
      wakeUpTime: "09:00",
      sleepTime: "10:00",
      tasks: [
        makeTask({ id: "first", priority: "high", estimatedDurationMinutes: 40 }),
        makeTask({ id: "second", priority: "medium", estimatedDurationMinutes: 30 }),
      ],
    });

    expect(result.slots.map((slot) => slot.taskId)).toEqual(["first"]);
    expect(result.slots[0]).toMatchObject({
      start: "2026-11-05T09:00:00.000Z",
      end: "2026-11-05T09:40:00.000Z",
    });
    expect(result.doesNotFit).toEqual([{ taskId: "second", reason: "no-window" }]);
  });

  it("keeps completed and cancelled tasks out of the plan entirely", () => {
    const result = planDay({
      ...dayInput,
      tasks: [
        makeTask({ id: "done", status: "completed" }),
        makeTask({ id: "dropped", status: "cancelled", estimatedDurationMinutes: null }),
        makeTask({ id: "open", estimatedDurationMinutes: 30 }),
      ],
    });

    expect(result.slots.map((slot) => slot.taskId)).toEqual(["open"]);
    expect(result.doesNotFit).toEqual([]);
    expect(result.needsEstimate).toEqual([]);
  });

  it("routes tasks without an estimate to needsEstimate", () => {
    const task = makeTask({ id: "vague", estimatedDurationMinutes: null });
    const result = planDay({ ...dayInput, tasks: [task] });

    expect(result.slots).toEqual([]);
    expect(result.doesNotFit).toEqual([]);
    expect(result.needsEstimate).toEqual([task]);
  });

  it("places higher scores first without overlap and without entering sleep", () => {
    const result = planDay({
      ...dayInput,
      blocks: [makeBlock("lunch", "2026-11-05T12:00:00.000Z", "2026-11-05T13:00:00.000Z")],
      tasks: [
        makeTask({ id: "t1", priority: "critical", estimatedDurationMinutes: 120 }),
        makeTask({ id: "t2", priority: "high", estimatedDurationMinutes: 60 }),
        makeTask({ id: "t3", priority: "low", estimatedDurationMinutes: 30 }),
      ],
    });

    expect(result.slots.map((slot) => slot.taskId)).toEqual(["t1", "t2", "t3"]);
    expect(result.slots).toEqual([
      expect.objectContaining({
        taskId: "t1",
        start: "2026-11-05T09:00:00.000Z",
        end: "2026-11-05T11:00:00.000Z",
      }),
      expect.objectContaining({
        taskId: "t2",
        start: "2026-11-05T11:00:00.000Z",
        end: "2026-11-05T12:00:00.000Z",
      }),
      expect.objectContaining({
        taskId: "t3",
        start: "2026-11-05T13:00:00.000Z",
        end: "2026-11-05T13:30:00.000Z",
      }),
    ]);

    for (const slot of result.slots) {
      expect(slot.reason.length).toBeGreaterThan(0);
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse("2026-11-05T09:00:00.000Z"));
      expect(Date.parse(slot.end)).toBeLessThanOrEqual(Date.parse("2026-11-05T18:00:00.000Z"));
    }

    for (let i = 1; i < result.slots.length; i += 1) {
      expect(Date.parse(result.slots[i].start)).toBeGreaterThanOrEqual(
        Date.parse(result.slots[i - 1].end),
      );
    }
  });

  it("breaks score ties by due date and never plans in the past", () => {
    const early = makeTask({ id: "early", dueDate: "2026-11-06", estimatedDurationMinutes: 60 });
    const late = makeTask({ id: "late", dueDate: "2026-11-10", estimatedDurationMinutes: 60 });

    const result = planDay({ ...dayInput, tasks: [late, early] });

    expect(result.slots.map((slot) => slot.taskId)).toEqual(["early", "late"]);

    const clipped = planDay({
      ...dayInput,
      now: new Date("2026-11-05T12:00:00.000Z"),
      wakeUpTime: "09:00",
      sleepTime: "18:00",
      tasks: [makeTask({ id: "only", estimatedDurationMinutes: 60 })],
    });

    expect(clipped.slots[0].start).toBe("2026-11-05T12:00:00.000Z");
  });

  it("never places slots inside working hours when free time exists outside them (Д1)", () => {
    const result = planDay({
      dateKey: DATE_KEY,
      timeZone: TZ,
      now: new Date("2026-11-05T06:00:00.000Z"),
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: { thu: [{ start: "09:00", end: "18:00" }] },
      studyHours: {},
      blocks: [],
      tasks: [makeTask({ id: "morning", estimatedDurationMinutes: 60 })],
    });

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]).toMatchObject({
      taskId: "morning",
      start: "2026-11-05T07:00:00.000Z",
      end: "2026-11-05T08:00:00.000Z",
    });
    for (const slot of result.slots) {
      const startMs = Date.parse(slot.start);
      const endMs = Date.parse(slot.end);
      expect(endMs).toBeLessThanOrEqual(Date.parse("2026-11-05T09:00:00.000Z"));
      expect(startMs).toBeGreaterThanOrEqual(Date.parse("2026-11-05T07:00:00.000Z"));
    }
    expect(result.doesNotFit).toEqual([]);
  });

  it("does not re-plan a task that already has a block that day", () => {
    const planned = makeTask({ id: "planned", estimatedDurationMinutes: 60 });
    const fresh = makeTask({ id: "fresh", estimatedDurationMinutes: 60 });
    const existing = {
      ...makeBlock("existing", "2026-11-05T09:00:00.000Z", "2026-11-05T10:00:00.000Z"),
      taskId: "planned",
      blockType: "task" as const,
    };

    const result = planDay({ ...dayInput, blocks: [existing], tasks: [planned, fresh] });

    expect(result.slots.map((slot) => slot.taskId)).toEqual(["fresh"]);
    expect(result.doesNotFit).toEqual([]);
    expect(result.alreadyPlanned).toEqual([
      {
        taskId: "planned",
        blockId: "existing",
        start: "2026-11-05T09:00:00.000Z",
        end: "2026-11-05T10:00:00.000Z",
      },
    ]);
  });

  it("keeps the block belonging to the same task out of free windows", () => {
    const planned = makeTask({ id: "planned", estimatedDurationMinutes: 60 });
    const other = makeTask({ id: "other", estimatedDurationMinutes: 60 });
    const existing = {
      ...makeBlock("existing", "2026-11-05T09:00:00.000Z", "2026-11-05T10:00:00.000Z"),
      taskId: "planned",
      blockType: "task" as const,
    };

    const result = planDay({ ...dayInput, blocks: [existing], tasks: [planned, other] });

    expect(result.slots.map((slot) => slot.taskId)).toEqual(["other"]);
    expect(result.slots[0]).toMatchObject({
      start: "2026-11-05T10:00:00.000Z",
      end: "2026-11-05T11:00:00.000Z",
    });
  });
});

describe("explainSlot", () => {
  it("covers task, day, time, duration and the reason", () => {
    const task = makeTask({
      title: "Write report",
      priority: "high",
      dueDate: "2026-11-04",
      goalId: "goal-1",
    });
    const text = explainSlot(
      task,
      { start: "2026-11-05T09:00:00.000Z", end: "2026-11-05T11:00:00.000Z" },
      context({ preferredPeriods: { thu: [{ start: "08:00", end: "12:00" }] } }),
    );

    expect(text).toContain("Write report");
    expect(text).toContain("2026-11-05");
    expect(text).toContain("09:00");
    expect(text).toContain("11:00");
    expect(text).toContain("120 min");
    expect(text).toContain("high priority");
    expect(text).toContain("overdue");
    expect(text).toContain("goal");
    expect(text).toContain("preferred hours");
    expect(text).not.toContain("AI");
  });

  it("warns about working-hours overlap in the reason (Д2)", () => {
    const text = explainSlot(
      makeTask({ title: "Write report" }),
      { start: "2026-11-05T10:00:00.000Z", end: "2026-11-05T11:00:00.000Z" },
      context({ workingHours: { thu: [{ start: "09:00", end: "18:00" }] } }),
    );

    expect(text).toContain("Write report");
    expect(text).toContain("working hours");
  });
});

describe("explainSlotParts", () => {
  it("returns stable structured reasons (no English comparison needed)", () => {
    const parts = explainSlotParts(
      makeTask({
        title: "Write report",
        priority: "high",
        dueDate: "2026-11-04",
        goalId: "goal-1",
      }),
      { start: "2026-11-05T09:00:00.000Z", end: "2026-11-05T11:00:00.000Z" },
      context({ preferredPeriods: { thu: [{ start: "08:00", end: "12:00" }] } }),
    );

    expect(parts).toStrictEqual({
      title: "Write report",
      date: "2026-11-05",
      timeRange: "09:00–11:00",
      minutes: 120,
      priority: "high",
      dueState: "overdue",
      dueDate: "2026-11-04",
      linked: true,
      preferred: true,
      workOverlap: false,
    });
  });

  it("marks tasks without due date and working-hours overlap", () => {
    const parts = explainSlotParts(
      makeTask({ title: "Write report" }),
      { start: "2026-11-05T10:00:00.000Z", end: "2026-11-05T11:00:00.000Z" },
      context({ workingHours: { thu: [{ start: "09:00", end: "18:00" }] } }),
    );

    expect(parts.dueState).toBe("none");
    expect(parts.linked).toBe(false);
    expect(parts.workOverlap).toBe(true);
  });
});
