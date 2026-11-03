import { z } from "zod";

import { RECURRENCE_FREQUENCIES } from "@/types/domain";

const DATE_KEY_MESSAGE = "Use YYYY-MM-DD.";

const weekdayField = z.number().int().min(0).max(6);

const dateKeyField = z.iso.date({ error: DATE_KEY_MESSAGE });

const optionalDateKeyField = dateKeyField.nullable().optional();

/**
 * Single source of truth for recurrence-rule inputs. Weekday convention
 * 0 = Sunday .. 6 = Saturday matches JS `getDay` and the DB CHECK
 * (`weekdays <@ '{0,1,2,3,4,5,6}'` in 0004). `intervalValue` is every N
 * days (daily) or every N weeks (weekdays / weekly).
 */
export const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    weekdays: z.array(weekdayField).default([]),
    intervalValue: z.number().int().min(1).default(1),
    startDate: dateKeyField,
    endDate: optionalDateKeyField,
    isActive: z.boolean().default(true),
  })
  .refine(
    (values) => values.frequency !== "weekdays" || values.weekdays.length > 0,
    {
      message: "Choose at least one weekday.",
      path: ["weekdays"],
    },
  )
  .refine(
    (values) => {
      if (values.endDate == null) {
        return true;
      }
      return Date.parse(values.endDate) >= Date.parse(values.startDate);
    },
    {
      message: "End date must not be before the start date.",
      path: ["endDate"],
    },
  );

export type CreateRecurrenceRuleInput = z.infer<typeof recurrenceRuleSchema>;

export const updateRecurrenceRuleSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES).optional(),
    weekdays: z.array(weekdayField).optional(),
    intervalValue: z.number().int().min(1).optional(),
    startDate: dateKeyField.optional(),
    endDate: dateKeyField.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (values) =>
      values.frequency !== "weekdays" ||
      (values.weekdays !== undefined && values.weekdays.length > 0),
    {
      message: "Choose at least one weekday.",
      path: ["weekdays"],
    },
  )
  .refine(
    (values) => {
      if (values.endDate == null || values.startDate == null) {
        return true;
      }
      return Date.parse(values.endDate) >= Date.parse(values.startDate);
    },
    {
      message: "End date must not be before the start date.",
      path: ["endDate"],
    },
  );

export type UpdateRecurrenceRuleInput = z.infer<typeof updateRecurrenceRuleSchema>;
