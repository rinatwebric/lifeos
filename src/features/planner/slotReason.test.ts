import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { SlotReasonParts } from "@/lib/planner";

import { formatIssueExplanation, formatSlotReason } from "./slotReason";

const PARTS: SlotReasonParts = {
  title: "Write report",
  date: "2026-11-05",
  timeRange: "09:00–11:00",
  minutes: 120,
  priority: "high",
  dueState: "overdue",
  dueDate: "2026-11-04",
  linked: true,
  preferred: true,
  workOverlap: false,
};

describe("formatSlotReason", () => {
  it("renders EN from stable parts (never compares English phrases)", () => {
    expect(formatSlotReason(PARTS, en.planner, en.enums.priority.high)).toBe(
      "“Write report” — planned 2026-11-05, 09:00–11:00 (120 min). High priority, due 2026-11-04 (overdue), linked to a goal, fits your preferred hours.",
    );
  });

  it("renders RU from the same parts", () => {
    const text = formatSlotReason(PARTS, ru.planner, ru.enums.priority.high);

    expect(text).toContain("«Write report»");
    expect(text).toContain("2026-11-05");
    expect(text).toContain("120 мин");
    expect(text).toContain("просрочено");
    expect(text).not.toContain("overdue");
    expect(text).not.toContain("min)");
  });

  it("covers no-due-date + work overlap", () => {
    const text = formatSlotReason(
      { ...PARTS, dueState: "none", dueDate: null, linked: false, preferred: false, workOverlap: true },
      en.planner,
      en.enums.priority.medium,
    );

    expect(text).toContain("no due date");
    expect(text).toContain("overlaps your working hours");
  });
});

describe("formatIssueExplanation", () => {
  it("maps codes to EN/RU without English comparison", () => {
    expect(formatIssueExplanation("too-long", en.planner)).toContain("longest free window");
    expect(formatIssueExplanation("too-long", ru.planner)).toContain("свободного окна");
    expect(formatIssueExplanation("needs-estimate", ru.planner)).toContain("оценки");
    expect(formatIssueExplanation("no-free-time", en.planner)).toContain("No free time");
  });
});
