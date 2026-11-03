import { describe, expect, it } from "vitest";

import { expandRecurrenceDates, RECURRENCE_HORIZON_DAYS } from "@/lib/recurrence";

const BASE: {
  frequency: "daily";
  weekdays: number[];
  intervalValue: number;
  startDate: string;
  endDate: string | null;
} = {
  frequency: "daily",
  weekdays: [],
  intervalValue: 1,
  startDate: "2026-11-04",
  endDate: null,
};

describe("expandRecurrenceDates", () => {
  it("expands a daily rule over the horizon", () => {
    const dates = expandRecurrenceDates(
      { ...BASE, frequency: "daily" },
      "2026-11-04",
      RECURRENCE_HORIZON_DAYS,
    );

    expect(dates).toHaveLength(RECURRENCE_HORIZON_DAYS);
    expect(dates[0]).toBe("2026-11-04");
    expect(dates[RECURRENCE_HORIZON_DAYS - 1]).toBe("2026-12-03");
  });

  it("respects interval_value for daily rules", () => {
    expect(
      expandRecurrenceDates({ ...BASE, frequency: "daily", intervalValue: 2 }, "2026-11-04", 5),
    ).toEqual(["2026-11-04", "2026-11-06", "2026-11-08"]);
  });

  it("expands named weekdays (Mon/Wed/Fri)", () => {
    // 2026-11-04 is a Wednesday.
    const dates = expandRecurrenceDates(
      { ...BASE, frequency: "weekdays", weekdays: [1, 3, 5] },
      "2026-11-04",
      8,
    );

    expect(dates).toEqual(["2026-11-04", "2026-11-06", "2026-11-09", "2026-11-11"]);
  });

  it("repeats weekly on the start weekday", () => {
    const dates = expandRecurrenceDates({ ...BASE, frequency: "weekly" }, "2026-11-04", 15);

    expect(dates).toEqual(["2026-11-04", "2026-11-11", "2026-11-18"]);
  });

  it("stops at end_date and skips days before start_date", () => {
    expect(
      expandRecurrenceDates(
        { ...BASE, frequency: "daily", endDate: "2026-11-05" },
        "2026-11-04",
        10,
      ),
    ).toEqual(["2026-11-04", "2026-11-05"]);

    expect(expandRecurrenceDates({ ...BASE, frequency: "daily" }, "2026-11-01", 3)).toEqual([]);
  });

  it("returns [] on garbage input instead of throwing", () => {
    expect(expandRecurrenceDates({ ...BASE, frequency: "daily" }, "not-a-date", 10)).toEqual([]);
    expect(expandRecurrenceDates({ ...BASE, frequency: "daily" }, "2026-11-04", 0)).toEqual([]);
  });
});
