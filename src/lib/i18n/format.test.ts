import { describe, expect, it } from "vitest";

import { pluralCategory, tmpl } from "./format";

describe("tmpl", () => {
  it("replaces {vars}", () => {
    expect(tmpl("Hello, {name}!", { name: "Ada" })).toBe("Hello, Ada!");
  });

  it("leaves unknown placeholders intact", () => {
    expect(tmpl("Hi {name}", {})).toBe("Hi {name}");
  });
});

describe("pluralCategory", () => {
  it("handles English one/other", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 2)).toBe("other");
    expect(pluralCategory("en", 5)).toBe("other");
  });

  it("handles Russian 1/2/5/11/21", () => {
    expect(pluralCategory("ru", 1)).toBe("one");
    expect(pluralCategory("ru", 2)).toBe("few");
    expect(pluralCategory("ru", 5)).toBe("many");
    expect(pluralCategory("ru", 11)).toBe("many");
    expect(pluralCategory("ru", 21)).toBe("one");
    expect(pluralCategory("ru", 22)).toBe("few");
    expect(pluralCategory("ru", 25)).toBe("many");
    expect(pluralCategory("ru", 111)).toBe("many");
    expect(pluralCategory("ru", 112)).toBe("many");
  });
});
