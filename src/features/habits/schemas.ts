import { z } from "zod";

import { HABIT_STATUSES, RECURRENCE_FREQUENCIES } from "@/types/domain";

const DATE_KEY_MESSAGE = "Use YYYY-MM-DD.";
const REMINDER_MESSAGE = "Use HH:MM (24-hour).";

const titleField = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(200, "Title must be 200 characters or fewer.");

const descriptionField = z
  .string()
  .trim()
  .max(2000, "Description must be 2,000 characters or fewer.")
  .nullable()
  .optional();

const noteField = z
  .string()
  .trim()
  .max(2000, "Note must be 2,000 characters or fewer.")
  .nullable()
  .optional();

const dateKeyField = z.iso.date({ error: DATE_KEY_MESSAGE });

const weekdayField = z.number().int().min(0).max(6);

// Wall-clock reminder stored as TIME in the DB (0007); no notification
// infrastructure reads it yet. Strictly HH:MM on input — the DB serializes
// TIME as HH:MM:SS on read, so the read path normalizes via `toWallTime`
// (same split as settings `timeField`).
const reminderTimeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, REMINDER_MESSAGE)
  .nullable()
  .optional();

/**
 * Single source of truth for habit/log inputs: the future Habits UI (step 3)
 * and the service layer share these schemas and the inferred types below.
 * Weekday convention 0 = Sunday .. 6 = Saturday matches JS `getDay` and the
 * DB CHECK (`weekdays <@ '{0,1,2,3,4,5,6}'` in 0007).
 * There is deliberately no `userId`: identity always comes from the verified
 * JWT, never from client input (AGENTS.md §5).
 */
export const habitBaseSchema = z.object({
  title: titleField,
  description: descriptionField,
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  weekdays: z.array(weekdayField).default([]),
  targetCount: z.number().int().min(1, "Target count must be at least 1."),
  reminderTime: reminderTimeField,
  startDate: dateKeyField,
  status: z.enum(HABIT_STATUSES),
});

export const createHabitSchema = habitBaseSchema.refine(
  (values) => values.frequency !== "weekdays" || values.weekdays.length > 0,
  {
    message: "Choose at least one weekday.",
    path: ["weekdays"],
  },
);

export type CreateHabitInput = z.infer<typeof createHabitSchema>;

/**
 * Explicitly redeclared (not `.partial()`): the base `weekdays` default would
 * otherwise leak into the update shape, and the weekdays/frequency rule needs
 * the same wording as creation. A frequency change to `weekdays` without an
 * explicit new list is rejected here; the service (step 2) merges with the
 * stored row before this check when only one side changes.
 */
export const updateHabitSchema = z
  .object({
    title: titleField.optional(),
    description: descriptionField,
    frequency: z.enum(RECURRENCE_FREQUENCIES).optional(),
    weekdays: z.array(weekdayField).optional(),
    targetCount: z.number().int().min(1, "Target count must be at least 1.").optional(),
    reminderTime: reminderTimeField,
    startDate: dateKeyField.optional(),
    status: z.enum(HABIT_STATUSES).optional(),
  })
  .refine(
    (values) =>
      values.frequency !== "weekdays" ||
      (values.weekdays !== undefined && values.weekdays.length > 0),
    {
      message: "Choose at least one weekday.",
      path: ["weekdays"],
    },
  );

export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;

export const habitLogBaseSchema = z.object({
  habitId: z.string().uuid("Select a valid habit."),
  logDate: dateKeyField,
  completedCount: z.number().int().min(0, "Completed count must be 0 or more."),
  note: noteField,
});

export const createHabitLogSchema = habitLogBaseSchema;

export type CreateHabitLogInput = z.infer<typeof createHabitLogSchema>;

/** Logs never move between habits: `habitId` is intentionally omitted. */
export const updateHabitLogSchema = habitLogBaseSchema.omit({ habitId: true }).partial();

export type UpdateHabitLogInput = z.infer<typeof updateHabitLogSchema>;
