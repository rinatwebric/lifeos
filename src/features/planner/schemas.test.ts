import { describe, expect, it } from "vitest";

import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";

import { applyPlanSchema, createApplyPlanSchemas, planSlotSchema } from "./schemas";

const UUID = "9f1c7a55-8b47-4e0e-9d8e-2c1f3f4a5b6c";

function messages(locale: "en" | "ru") {
  const d = locale === "en" ? en : ru;
  return {
    titleRequired: d.validation.titleRequired,
    titleTooLong: d.validation.titleTooLong,
    isoDateTime: d.validation.isoDateTime,
    validTask: d.validation.validTask,
    endAfterStart: d.planner.schemaEndAfterStart,
    tooManySlots: d.planner.schemaTooManySlots,
    calendarDate: d.validation.calendarDate,
    timezoneRequired: d.planner.schemaTimezoneRequired,
  };
}

const VALID_SLOT = {
  taskId: UUID,
  title: "Deep work",
  start: "2026-11-04T07:00:00.000Z",
  end: "2026-11-04T08:00:00.000Z",
};

const VALID_PLAN = {
  slots: [VALID_SLOT],
  dateKey: "2026-11-04",
  timeZone: "Asia/Bishkek",
};

describe("applyPlan schemas i18n", () => {
  it("emits Russian messages without changing accepted values", () => {
    const { planSlotSchema: ruSlot, applyPlanSchema: ruApply } = createApplyPlanSchemas(
      messages("ru"),
    );

    // Valid fixtures parse in both locales.
    expect(planSlotSchema.safeParse(VALID_SLOT).success).toBe(true);
    expect(ruSlot.safeParse(VALID_SLOT).success).toBe(true);
    expect(applyPlanSchema.safeParse(VALID_PLAN).success).toBe(true);
    expect(ruApply.safeParse(VALID_PLAN).success).toBe(true);

    // Same invalid shapes rejected in both locales.
    const badEnd = { ...VALID_SLOT, end: "2026-11-04T06:00:00.000Z" };
    expect(planSlotSchema.safeParse(badEnd).success).toBe(false);
    expect(ruSlot.safeParse(badEnd).success).toBe(false);

    const badPlan = { slots: [], dateKey: "not-a-date", timeZone: "" };
    expect(applyPlanSchema.safeParse(badPlan).success).toBe(false);
    expect(ruApply.safeParse(badPlan).success).toBe(false);
  });

  it("reports RU messages for title, slot interval and plan fields", () => {
    const { planSlotSchema: ruSlot, applyPlanSchema: ruApply } = createApplyPlanSchemas(
      messages("ru"),
    );

    const longTitle = ruSlot.safeParse({ ...VALID_SLOT, title: "x".repeat(201) });
    expect(longTitle.success).toBe(false);
    if (!longTitle.success) {
      expect(longTitle.error.issues[0]?.message).toBe(ru.validation.titleTooLong);
    }

    const reversed = ruSlot.safeParse({ ...VALID_SLOT, end: "2026-11-04T06:00:00.000Z" });
    expect(reversed.success).toBe(false);
    if (!reversed.success) {
      expect(reversed.error.issues[0]?.message).toBe(ru.planner.schemaEndAfterStart);
    }

    const badTask = ruSlot.safeParse({ ...VALID_SLOT, taskId: "nope" });
    expect(badTask.success).toBe(false);
    if (!badTask.success) {
      expect(badTask.error.issues[0]?.message).toBe(ru.validation.validTask);
    }

    const tooMany = ruApply.safeParse({
      ...VALID_PLAN,
      slots: Array.from({ length: 101 }, (_, i) => ({ ...VALID_SLOT, taskId: UUID, title: `T${i}` })),
    });
    expect(tooMany.success).toBe(false);
    if (!tooMany.success) {
      expect(tooMany.error.issues[0]?.message).toBe(ru.planner.schemaTooManySlots);
    }

    const badKey = ruApply.safeParse({ ...VALID_PLAN, dateKey: "04-11-2026" });
    expect(badKey.success).toBe(false);
    if (!badKey.success) {
      expect(badKey.error.issues[0]?.message).toBe(ru.validation.calendarDate);
    }

    const noZone = ruApply.safeParse({ ...VALID_PLAN, timeZone: "" });
    expect(noZone.success).toBe(false);
    if (!noZone.success) {
      expect(noZone.error.issues[0]?.message).toBe(ru.planner.schemaTimezoneRequired);
    }
  });
});
