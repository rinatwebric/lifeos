import { beforeEach, describe, expect, it } from "vitest";

import { isLocaleValue, isThemeValue, readStoredPreference, writeStoredPreference } from "./storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("storage", () => {
  it("round-trips JSON with userId", () => {
    writeStoredPreference("k", "ru", "u1");
    expect(readStoredPreference("k", isLocaleValue)).toMatchObject({ value: "ru", userId: "u1" });
  });

  it("reads legacy plain strings", () => {
    window.localStorage.setItem("k", "dark");
    expect(readStoredPreference("k", isThemeValue)?.value).toBe("dark");

    window.localStorage.setItem("k2", "en");
    expect(readStoredPreference("k2", isLocaleValue)?.value).toBe("en");
  });

  it("rejects invalid values", () => {
    window.localStorage.setItem("k", "ky");
    expect(readStoredPreference("k", isLocaleValue)).toBeNull();
  });

  it("never throws when localStorage is unavailable", () => {
    const getItem = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("denied");
    };

    try {
      expect(readStoredPreference("k", isLocaleValue)).toBeNull();
      expect(() => writeStoredPreference("k", "en", null)).not.toThrow();
    } finally {
      window.localStorage.getItem = getItem;
    }
  });
});
