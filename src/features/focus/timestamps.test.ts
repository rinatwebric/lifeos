import { describe, expect, it } from "vitest";

import { notBefore } from "./timestamps";

describe("notBefore", () => {
  it("clamps a client timestamp that is behind the server start", () => {
    expect(notBefore("2026-11-22T09:45:00.000Z", "2026-11-22T09:45:02.000Z")).toBe(
      "2026-11-22T09:45:02.000Z",
    );
  });

  it("keeps a timestamp that is already at or after the start", () => {
    expect(notBefore("2026-11-22T09:45:05.000Z", "2026-11-22T09:45:02.000Z")).toBe(
      "2026-11-22T09:45:05.000Z",
    );
    expect(notBefore("2026-11-22T09:45:02.000Z", "2026-11-22T09:45:02.000Z")).toBe(
      "2026-11-22T09:45:02.000Z",
    );
  });

  it("leaves unparseable values untouched", () => {
    expect(notBefore("not-a-date", "2026-11-22T09:45:02.000Z")).toBe("not-a-date");
  });
});
