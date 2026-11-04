import { describe, expect, it } from "vitest";

import {
  AVAILABILITY_MESSAGES,
  MAX_WINDOWS_PER_DAY,
  availabilityFormSchema,
  availabilityToDays,
  daysToAvailability,
  type AvailabilityDayValues,
  type AvailabilityFormValues,
} from "./schemas";
import { WEEKDAYS, type AvailabilityWindow, type AvailabilityWindows, type Weekday } from "@/types/domain";

function emptyWeek(): AvailabilityDayValues[] {
  return availabilityToDays({});
}

function weekWith(day: Weekday, windows: AvailabilityWindow[]): AvailabilityFormValues {
  return {
    days: emptyWeek().map((entry) =>
      entry.day === day ? { ...entry, windows: windows.map((window) => ({ ...window })) } : entry,
    ),
  };
}

function messagesFor(values: AvailabilityFormValues): string[] {
  const result = availabilityFormSchema.safeParse(values);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("availabilityFormSchema", () => {
  it("accepts a week where every day is empty ({} means not set)", () => {
    const result = availabilityFormSchema.safeParse({ days: emptyWeek() });

    expect(result.success).toBe(true);
    expect(daysToAvailability(emptyWeek())).toStrictEqual({});
  });

  it("accepts windows in HH:MM within one day", () => {
    const result = availabilityFormSchema.safeParse(
      weekWith("mon", [{ start: "09:00", end: "12:00" }]),
    );

    expect(result.success).toBe(true);
  });

  it("rejects an end time that is not after the start time", () => {
    const values = weekWith("mon", [{ start: "12:00", end: "09:00" }]);
    const result = availabilityFormSchema.safeParse(values);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(AVAILABILITY_MESSAGES.endAfterStart);
    expect(result.error?.issues[0].path).toStrictEqual(["days", 0, "windows", 0, "end"]);
  });

  it("rejects a zero-length window", () => {
    expect(messagesFor(weekWith("mon", [{ start: "09:00", end: "09:00" }]))).toContain(
      AVAILABILITY_MESSAGES.endAfterStart,
    );
  });

  it("rejects overlapping windows inside one day", () => {
    const values = weekWith("tue", [
      { start: "09:00", end: "12:00" },
      { start: "11:00", end: "13:00" },
    ]);

    expect(messagesFor(values)).toContain(AVAILABILITY_MESSAGES.overlap);
  });

  it("rejects a window that contains another one", () => {
    const values = weekWith("wed", [
      { start: "08:00", end: "18:00" },
      { start: "10:00", end: "11:00" },
    ]);

    expect(messagesFor(values)).toContain(AVAILABILITY_MESSAGES.overlap);
  });

  it("accepts back-to-back windows that only touch at the edge", () => {
    const values = weekWith("thu", [
      { start: "09:00", end: "12:00" },
      { start: "12:00", end: "14:00" },
    ]);

    expect(messagesFor(values)).toStrictEqual([]);
  });

  it(`rejects more than ${MAX_WINDOWS_PER_DAY} windows per day`, () => {
    const windows: AvailabilityWindow[] = Array.from({ length: MAX_WINDOWS_PER_DAY + 1 }, (_, i) => ({
      start: `${String(8 + i).padStart(2, "0")}:00`,
      end: `${String(8 + i).padStart(2, "0")}:30`,
    }));

    expect(messagesFor(weekWith("fri", windows))).toContain(AVAILABILITY_MESSAGES.tooManyWindows);
  });

  it("rejects a malformed time", () => {
    expect(messagesFor(weekWith("sat", [{ start: "9:00", end: "10:00" }]))).toContain(
      "Use HH:MM (24-hour).",
    );
  });

  it("requires all seven days", () => {
    const values = { days: emptyWeek().slice(0, WEEKDAYS.length - 1) };

    expect(messagesFor(values as AvailabilityFormValues)).toContain(AVAILABILITY_MESSAGES.allDays);
  });

  it("keeps windows of different days independent", () => {
    const values: AvailabilityFormValues = {
      days: emptyWeek().map((entry) => {
        if (entry.day === "mon") return { ...entry, windows: [{ start: "09:00", end: "12:00" }] };
        if (entry.day === "tue") return { ...entry, windows: [{ start: "11:00", end: "13:00" }] };
        return entry;
      }),
    };

    expect(messagesFor(values)).toStrictEqual([]);
  });
});

describe("availability mapping", () => {
  it("pads the JSONB object to seven day rows in calendar order", () => {
    const windows: AvailabilityWindows = { thu: [{ start: "18:00", end: "20:00" }] };
    const days = availabilityToDays(windows);

    expect(days.map((day) => day.day)).toStrictEqual([...WEEKDAYS]);
    expect(days.find((day) => day.day === "thu")?.windows).toStrictEqual([
      { start: "18:00", end: "20:00" },
    ]);
    expect(days.find((day) => day.day === "mon")?.windows).toStrictEqual([]);
  });

  it("drops empty days so an unset week stays {}", () => {
    const availability = daysToAvailability(emptyWeek());

    expect(availability).toStrictEqual({});
    expect(Object.keys(availability)).toHaveLength(0);
  });

  it("round-trips windows without inventing days", () => {
    const windows: AvailabilityWindows = {
      mon: [{ start: "09:00", end: "12:00" }],
      sat: [
        { start: "10:00", end: "11:00" },
        { start: "12:00", end: "13:00" },
      ],
    };

    expect(daysToAvailability(availabilityToDays(windows))).toStrictEqual(windows);
  });
});