import { describe, expect, it } from "vitest";

import {
  buildBlockInput,
  draftDurationMinutes,
  resolveBlockTitle,
  wallTimeToIso,
  type BlockFormValues,
} from "./blockForm";

const TIME_ZONE = "Europe/Berlin";
const TASK_ID = "9f1c7a55-8b47-4e0e-9d8e-2c1f3f4a5b6c";

function values(overrides: Partial<BlockFormValues> = {}): BlockFormValues {
  return {
    blockType: "break",
    taskId: "",
    title: "Lunch",
    startLocal: "2026-11-04T09:00",
    endLocal: "2026-11-04T10:30",
    ...overrides,
  };
}

const TASKS = [{ id: TASK_ID, title: "Write the report" }];

describe("buildBlockInput", () => {
  it("converts both wall times in the user's zone, never the browser zone", () => {
    const result = buildBlockInput(values(), { timeZone: TIME_ZONE, tasks: TASKS });

    expect(wallTimeToIso("2026-11-04T09:00", TIME_ZONE)).toBe("2026-11-04T08:00:00.000Z");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.startTime).toBe("2026-11-04T08:00:00.000Z");
      expect(result.input.endTime).toBe("2026-11-04T09:30:00.000Z");
      expect(result.input.blockType).toBe("break");
      expect(result.input.title).toBe("Lunch");
      expect(result.input.taskId).toBeNull();
    }
  });

  it("rejects an end that is not after the start", () => {
    const result = buildBlockInput(values({ endLocal: "2026-11-04T09:00" }), {
      timeZone: TIME_ZONE,
      tasks: TASKS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.endTime).toBe("End must be after start.");
      expect(result.errors.startTime).toBeUndefined();
    }
  });

  it("rejects a reversed interval", () => {
    const result = buildBlockInput(values({ endLocal: "2026-11-04T08:00" }), {
      timeZone: TIME_ZONE,
      tasks: TASKS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.endTime).toBe("End must be after start.");
    }
  });

  it("rejects a task block that carries no task", () => {
    const result = buildBlockInput(values({ blockType: "task", title: "" }), {
      timeZone: TIME_ZONE,
      tasks: TASKS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.taskId).toBe("Choose the task this block is for.");
    }
  });

  it("accepts personal and break blocks without a task", () => {
    for (const blockType of ["personal", "break"] as const) {
      const result = buildBlockInput(values({ blockType, taskId: "" }), {
        timeZone: TIME_ZONE,
        tasks: TASKS,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.input.taskId).toBeNull();
        expect(result.input.blockType).toBe(blockType);
      }
    }
  });

  it("drops a task id left over from a type change", () => {
    const result = buildBlockInput(values({ blockType: "personal", taskId: TASK_ID }), {
      timeZone: TIME_ZONE,
      tasks: TASKS,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.taskId).toBeNull();
    }
  });

  it("takes the title from the chosen task", () => {
    const result = buildBlockInput(
      values({ blockType: "task", taskId: TASK_ID, title: "stale text" }),
      { timeZone: TIME_ZONE, tasks: TASKS },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.title).toBe("Write the report");
      expect(result.input.taskId).toBe(TASK_ID);
    }
  });

  it("requires a title for a break block", () => {
    const result = buildBlockInput(values({ title: "   " }), {
      timeZone: TIME_ZONE,
      tasks: TASKS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBe("Title is required.");
    }
  });

  it("asks for a time instead of throwing on an empty field", () => {
    const result = buildBlockInput(values({ startLocal: "" }), {
      timeZone: TIME_ZONE,
      tasks: TASKS,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.startTime).toBe("Choose a start date and time.");
    }
  });
});

describe("draftDurationMinutes", () => {
  it("measures the interval between the two wall times", () => {
    expect(draftDurationMinutes(values(), TIME_ZONE)).toBe(90);
  });

  it("returns null until the interval is valid", () => {
    expect(draftDurationMinutes(values({ endLocal: "2026-11-04T08:00" }), TIME_ZONE)).toBeNull();
    expect(draftDurationMinutes(values({ endLocal: "" }), TIME_ZONE)).toBeNull();
  });
});

describe("resolveBlockTitle", () => {
  it("prefers the task title over typed text", () => {
    expect(
      resolveBlockTitle(values({ blockType: "task", taskId: TASK_ID, title: "typed" }), TASKS),
    ).toBe("Write the report");
  });

  it("keeps the typed title for break and personal blocks", () => {
    expect(resolveBlockTitle(values({ title: "  Walk  " }), TASKS)).toBe("Walk");
  });
});