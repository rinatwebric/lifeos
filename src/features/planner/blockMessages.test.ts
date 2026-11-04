import { describe, expect, it } from "vitest";

import { localDateTimeToIso } from "@/lib/dates";

import { collectBlockWarnings, describeBlockError } from "./blockMessages";
import { BlockServiceError } from "./errors";

const TIME_ZONE = "UTC";
const DATE_KEY = "2026-11-04";
const NOW = new Date("2026-11-04T06:00:00.000Z");

function at(local: string): string {
  return localDateTimeToIso(`${DATE_KEY}T${local}`, TIME_ZONE);
}

function window_(id: string, start: string, end: string) {
  return { id, start: at(start), end: at(end) };
}

const WAKING = { wakeUpTime: "07:00", sleepTime: "23:00" };

describe("collectBlockWarnings", () => {
  it("reports an overlap with one existing block", () => {
    const warnings = collectBlockWarnings({
      startTime: at("09:00"),
      endTime: at("10:00"),
      blocks: [window_("b1", "09:30", "10:30")],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({
      kind: "overlap",
      message:
        "This block shares its time with another block. Both stay in your plan and are marked as overlapping.",
    });
  });

  it("counts every overlapping block", () => {
    const warnings = collectBlockWarnings({
      startTime: at("09:00"),
      endTime: at("12:00"),
      blocks: [window_("b1", "08:00", "10:00"), window_("b2", "11:00", "13:00")],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings.map((warning) => warning.kind)).toEqual(["overlap"]);
    expect(warnings[0]?.message).toContain("2 other blocks");
  });

  it("never conflicts a block with itself while it is being edited", () => {
    const warnings = collectBlockWarnings({
      startTime: at("09:00"),
      endTime: at("10:00"),
      blocks: [window_("b1", "09:00", "10:00")],
      editedBlockId: "b1",
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings).toEqual([]);
  });

  it("treats touching edges as no conflict", () => {
    const warnings = collectBlockWarnings({
      startTime: at("10:00"),
      endTime: at("11:00"),
      blocks: [window_("b1", "09:00", "10:00")],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings).toEqual([]);
  });

  it("reports a block outside the waking hours, naming them", () => {
    const warnings = collectBlockWarnings({
      startTime: at("22:00"),
      endTime: at("23:30"),
      blocks: [],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.kind).toBe("sleep");
    expect(warnings[0]?.message).toContain("(07:00–23:00)");
  });

  it("does not invent a waking-hours warning when the user has no preferences", () => {
    const warnings = collectBlockWarnings({
      startTime: at("22:00"),
      endTime: at("23:30"),
      blocks: [],
      now: NOW,
      timeZone: TIME_ZONE,
      wakeUpTime: null,
      sleepTime: null,
    });

    expect(warnings).toEqual([]);
  });

  it("reports a block that already ended", () => {
    const warnings = collectBlockWarnings({
      startTime: at("09:00"),
      endTime: at("10:00"),
      blocks: [],
      now: new Date("2026-11-04T12:00:00.000Z"),
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings.map((warning) => warning.kind)).toEqual(["past"]);
  });

  it("keeps a stable order: overlap, waking hours, past", () => {
    const warnings = collectBlockWarnings({
      startTime: at("04:00"),
      endTime: at("06:00"),
      blocks: [window_("b1", "05:00", "07:00")],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings.map((warning) => warning.kind)).toEqual(["overlap", "sleep", "past"]);
  });

  it("says nothing about working hours: a manual block over them is allowed", () => {
    const warnings = collectBlockWarnings({
      startTime: at("10:00"),
      endTime: at("11:00"),
      blocks: [],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
      workingHours: { wed: [{ start: "09:00", end: "17:00" }] },
    });

    expect(warnings).toEqual([]);
  });

  it("returns no warnings for an invalid interval, leaving it to the form", () => {
    const warnings = collectBlockWarnings({
      startTime: at("10:00"),
      endTime: at("09:00"),
      blocks: [],
      now: NOW,
      timeZone: TIME_ZONE,
      ...WAKING,
    });

    expect(warnings).toEqual([]);
  });
});

describe("describeBlockError", () => {
  it("maps every code to human copy", () => {
    const codes = [
      "validation",
      "not_found",
      "forbidden",
      "conflict",
      "network",
      "unknown",
    ] as const;

    for (const code of codes) {
      const message = describeBlockError(new BlockServiceError(code, "raw postgres text"));
      expect(message).not.toContain("raw postgres text");
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it("keeps a coded validation failure actionable", () => {
    expect(
      describeBlockError(new BlockServiceError("validation", "violates check constraint")),
    ).toBe("This block could not be saved. Check the times and the linked task, then try again.");
  });

  it("falls back to generic copy for anything that is not a block error", () => {
    expect(describeBlockError(new Error("boom"))).toBe(
      "The block could not be saved. Try again in a moment.",
    );
  });
});