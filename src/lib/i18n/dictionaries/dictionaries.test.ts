import { describe, expect, it } from "vitest";

import { en } from "./en";
import { ru } from "./ru";

function leaves(value: unknown, path: string[] = []): string[][] {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, [...path, key]),
    );
  }

  return [path];
}

function getAt(root: unknown, path: string[]): unknown {
  let node: unknown = root;

  for (const segment of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }

  return node;
}

describe("dictionaries", () => {
  it("have identical key shapes in en and ru", () => {
    const enKeys = leaves(en).map((p) => p.join(".")).sort();
    const ruKeys = leaves(ru as unknown).map((p) => p.join(".")).sort();

    expect(ruKeys).toStrictEqual(enKeys);
  });

  it("have no empty strings", () => {
    for (const path of leaves(en)) {
      const value = getAt(en, path);
      expect(typeof value === "string" && value.length > 0, path.join(".")).toBe(true);
    }

    for (const path of leaves(ru as unknown)) {
      const value = getAt(ru as unknown, path);
      expect(typeof value === "string" && value.length > 0, path.join(".")).toBe(true);
    }
  });
});
