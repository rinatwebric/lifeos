import { describe, expect, it } from "vitest";

import { focusRangeIso } from "./range";

describe("focusRangeIso", () => {
  it("turns an inclusive local period into exclusive UTC bounds", () => {
    expect(focusRangeIso("2026-11-01", "2026-11-01", "UTC")).toEqual({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-02T00:00:00.000Z",
    });
  });

  it("uses the profile time zone, not the browser zone", () => {
    expect(focusRangeIso("2026-11-01", "2026-11-01", "Asia/Bishkek")).toEqual({
      from: "2026-10-31T18:00:00.000Z",
      to: "2026-11-01T18:00:00.000Z",
    });
  });
});
