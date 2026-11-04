import { describe, expect, it } from "vitest";

import { localDateTimeToIso } from "@/lib/dates";
import type { PlanBlock } from "@/lib/planner";
import type { Task } from "@/types/domain";

import { buildPlanPreview, type PlanPreviewInput } from "./usePlanPreview";

const TIME_ZONE = "Europe/Berlin";
const DATE_KEY = "2026-11-04";
/** 06:00 in Berlin: nothing on this day is in the past yet. */
const NOW = new Date("2026-11-04T05:00:00.000Z");

function at(local: string): string {
  return localDateTimeToIso(`${DATE_KEY}T${local}`, TIME_ZONE);
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

function makeBlock(id: string, start: string, end: string): PlanBlock {
  return { id, startTime: at(start), endTime: at(end) };
}

function build(overrides: Partial<PlanPreviewInput> = {}) {
  return buildPlanPreview({
    tasks: [],
    blocks: [],
    dateKey: DATE_KEY,
    timeZone: TIME_ZONE,
    now: NOW,
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
    preferredWorkPeriods: {},
    ...overrides,
  });
}

describe("buildPlanPreview", () => {
  it("returns an empty plan for a day without tasks", () => {
    const preview = build();

    expect(preview.slots).toEqual([]);
    expect(preview.doesNotFit).toEqual([]);
    expect(preview.needsEstimate).toEqual([]);
    expect(preview.alreadyPlanned).toEqual([]);
    expect(preview.summary).toEqual({
      candidateCount: 0,
      slotCount: 0,
      plannedMinutes: 0,
      unplacedCount: 0,
      unplacedMinutes: 0,
      needsEstimateCount: 0,
      alreadyPlannedCount: 0,
      hasWakingHours: true,
      hasFreeWindows: true,
    });
    expect(preview.canAccept).toBe(false);
  });

  it("places a task at the start of the waking hours with local labels", () => {
    const preview = build({
      tasks: [makeTask({ id: "t1", title: "Write the report", estimatedDurationMinutes: 45 })],
    });

    expect(preview.slots).toHaveLength(1);
    expect(preview.slots[0]).toMatchObject({
      taskId: "t1",
      taskTitle: "Write the report",
      startLabel: "07:00",
      endLabel: "07:45",
      crossesMidnight: false,
      durationMinutes: 45,
    });
    expect(preview.summary.plannedMinutes).toBe(45);
    expect(preview.canAccept).toBe(true);
  });

  it("asks for an estimate instead of inventing a duration", () => {
    const preview = build({
      tasks: [makeTask({ id: "t1", title: "Plan the launch", estimatedDurationMinutes: null })],
    });

    expect(preview.slots).toEqual([]);
    expect(preview.needsEstimate).toHaveLength(1);
    expect(preview.needsEstimate[0]).toMatchObject({
      taskId: "t1",
      taskTitle: "Plan the launch",
      estimatedDurationMinutes: null,
      reason: "needs-estimate",
      explanation:
        "This task has no time estimate. Add one so the planner knows how much time to reserve.",
    });
    expect(preview.summary.needsEstimateCount).toBe(1);
    expect(preview.canAccept).toBe(false);
  });

  it("keeps a task that is longer than every free window in doesNotFit", () => {
    const preview = build({
      wakeUpTime: "09:00",
      sleepTime: "10:00",
      tasks: [makeTask({ id: "t1", title: "Long task", estimatedDurationMinutes: 90 })],
    });

    expect(preview.slots).toEqual([]);
    expect(preview.doesNotFit).toHaveLength(1);
    expect(preview.doesNotFit[0]).toMatchObject({
      taskId: "t1",
      reason: "too-long",
      estimatedDurationMinutes: 90,
      explanation:
        "The estimate is longer than the longest free window on this day. Shorten the estimate or free up a longer stretch.",
    });
    expect(preview.summary.unplacedMinutes).toBe(90);
  });

  it("reports a task that lost the free time as no-window", () => {
    const preview = build({
      wakeUpTime: "09:00",
      sleepTime: "09:30",
      tasks: [
        makeTask({
          id: "a",
          title: "Critical task",
          priority: "critical",
          estimatedDurationMinutes: 30,
        }),
        makeTask({ id: "b", title: "Small task", priority: "low", estimatedDurationMinutes: 30 }),
      ],
    });

    expect(preview.slots.map((slot) => slot.taskId)).toEqual(["a"]);
    expect(preview.doesNotFit).toHaveLength(1);
    expect(preview.doesNotFit[0]).toMatchObject({
      taskId: "b",
      reason: "no-window",
      explanation:
        "The free time on this day ran out before this task could be placed. Move it to another day or free up time.",
    });
    expect(preview.summary.candidateCount).toBe(2);
    expect(preview.summary.unplacedCount).toBe(1);
  });

  it("reports an already planned task instead of planning it twice", () => {
    const preview = build({
      blocks: [{ id: "block-1", startTime: at("09:00"), endTime: at("10:00"), taskId: "t1" }],
      tasks: [
        makeTask({ id: "t1", title: "Planned already", estimatedDurationMinutes: 60 }),
        makeTask({ id: "t2", title: "Fresh task", estimatedDurationMinutes: 30 }),
      ],
    });

    expect(preview.slots.map((slot) => slot.taskId)).toEqual(["t2"]);
    expect(preview.doesNotFit).toEqual([]);
    expect(preview.alreadyPlanned).toEqual([
      expect.objectContaining({
        taskId: "t1",
        taskTitle: "Planned already",
        blockId: "block-1",
        startLabel: "09:00",
        endLabel: "10:00",
      }),
    ]);
    expect(preview.summary.alreadyPlannedCount).toBe(1);
    expect(preview.summary.candidateCount).toBe(1);
    expect(preview.canAccept).toBe(true);
  });

  it("orders the slots by start time and repeats itself exactly", () => {
    const tasks = [
      makeTask({ id: "t1", title: "First", estimatedDurationMinutes: 30, priority: "critical" }),
      makeTask({ id: "t2", title: "Second", estimatedDurationMinutes: 60, priority: "high" }),
      makeTask({ id: "t3", title: "Third", estimatedDurationMinutes: 15, priority: "low" }),
    ];

    const first = build({ tasks });
    const second = build({ tasks });
    const starts = first.slots.map((slot) => slot.start);

    expect(starts).toEqual([...starts].sort());
    expect(first.slots.map((slot) => slot.taskId)).toEqual(["t1", "t2", "t3"]);
    expect(second).toStrictEqual(first);
  });

  it("fills the why for every slot", () => {
    const preview = build({
      tasks: [
        makeTask({
          id: "t1",
          title: "Write the report",
          estimatedDurationMinutes: 30,
          dueDate: "2026-11-06",
          goalId: "g1",
        }),
      ],
    });

    expect(preview.slots).toHaveLength(1);
    const [slot] = preview.slots;
    expect(slot.reason).toContain("Write the report");
    expect(slot.reason).toContain("planned");
    expect(slot.reason).toContain("30 min");
    expect(slot.reason).toContain("due 2026-11-06");
    expect(slot.reason).toContain("linked to a goal");
  });

  it("tells the reader when a slot matches the preferred hours", () => {
    const preview = build({
      preferredWorkPeriods: { wed: [{ start: "07:00", end: "08:00" }] },
      tasks: [makeTask({ id: "t1", title: "Deep work", estimatedDurationMinutes: 30 })],
    });

    expect(preview.slots).toHaveLength(1);
    expect(preview.slots[0].reason).toContain("fits your preferred hours");
  });

  it("counts the time still to place", () => {
    const preview = build({
      wakeUpTime: "09:00",
      sleepTime: "10:00",
      tasks: [
        makeTask({ id: "t1", title: "Fits", estimatedDurationMinutes: 30 }),
        makeTask({ id: "t2", title: "Does not fit", estimatedDurationMinutes: 120 }),
        makeTask({ id: "t3", title: "No estimate", estimatedDurationMinutes: null }),
      ],
    });

    expect(preview.summary.plannedMinutes).toBe(30);
    expect(preview.summary.unplacedMinutes).toBe(120);
    expect(preview.summary.slotCount).toBe(1);
    expect(preview.summary.unplacedCount).toBe(1);
    expect(preview.summary.needsEstimateCount).toBe(1);
  });

  it("never proposes a closed task", () => {
    const preview = build({
      tasks: [
        makeTask({
          id: "done",
          title: "Finished",
          status: "completed",
          estimatedDurationMinutes: 30,
        }),
        makeTask({
          id: "dropped",
          title: "Dropped",
          status: "cancelled",
          estimatedDurationMinutes: null,
        }),
      ],
    });

    expect(preview.slots).toEqual([]);
    expect(preview.needsEstimate).toEqual([]);
    expect(preview.summary.candidateCount).toBe(0);
  });

  it("claims no free time without waking hours", () => {
    const preview = build({
      wakeUpTime: null,
      tasks: [
        makeTask({ id: "t1", title: "Ready task", estimatedDurationMinutes: 30 }),
        makeTask({ id: "t2", title: "No estimate", estimatedDurationMinutes: null }),
      ],
    });

    expect(preview.slots).toEqual([]);
    expect(preview.summary.hasWakingHours).toBe(false);
    expect(preview.summary.hasFreeWindows).toBe(false);
    expect(preview.summary.candidateCount).toBe(0);
    expect(preview.needsEstimate).toHaveLength(1);
    expect(preview.canAccept).toBe(false);
  });

  it("says there is no free time when the blocks fill the day", () => {
    const preview = build({
      blocks: [makeBlock("block-1", "07:00", "23:00")],
      tasks: [makeTask({ id: "t1", title: "Anything", estimatedDurationMinutes: 30 })],
    });

    expect(preview.summary.hasFreeWindows).toBe(false);
    expect(preview.slots).toEqual([]);
    expect(preview.doesNotFit).toHaveLength(1);
    expect(preview.doesNotFit[0].explanation).toBe(
      "No free time is left on this day, so nothing can be placed. Free up time or choose another day.",
    );
  });

  it("keeps free windows away from working and study hours", () => {
    const preview = build({
      workingHours: { wed: [{ start: "07:00", end: "12:00" }] },
      studyHours: { wed: [{ start: "12:00", end: "14:00" }] },
      tasks: [makeTask({ id: "t1", title: "Evening task", estimatedDurationMinutes: 60 })],
    });

    expect(preview.slots).toHaveLength(1);
    expect(preview.slots[0]).toMatchObject({ startLabel: "14:00", endLabel: "15:00" });
  });
});
