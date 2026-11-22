import { describe, expect, it } from "vitest";

import { commandKeyLabel } from "./platform";

describe("commandKeyLabel", () => {
  it("uses the command symbol on Apple platforms", () => {
    expect(commandKeyLabel(true)).toBe("⌘K");
  });

  it("uses Ctrl on Windows and Linux", () => {
    expect(commandKeyLabel(false)).toBe("Ctrl K");
  });
});
