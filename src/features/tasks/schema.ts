import { z } from "zod";

import { PRIORITIES, TASK_STATUSES } from "@/types/domain";

const DATE_KEY_MESSAGE = "Use YYYY-MM-DD.";
const DATETIME_MESSAGE = "Use an ISO date-time, e.g. 2026-11-04T10:00:00.000Z.";

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

const dateKeyField = z.iso.date({ error: DATE_KEY_MESSAGE });

const optionalDateKeyField = dateKeyField.nullable().optional();

const datetimeField = z.iso.datetime({ error: DATETIME_MESSAGE });

const optionalDatetimeField = datetimeField.nullable().optional();

interface ScheduleSlice {
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

/**
 * Scheduled end must be strictly after scheduled start. Timestamp comparison
 * (not lexicographic) so mixed offsets (`Z` vs `+03:00`) compare correctly.
 * Null/undefined on either side means "unscheduled" and always passes.
 */
function hasValidSchedule(values: ScheduleSlice): boolean {
  if (values.scheduledStart == null || values.scheduledEnd == null) {
    return true;
  }

  return Date.parse(values.scheduledEnd) > Date.parse(values.scheduledStart);
}

const SCHEDULE_REFINEMENT = {
  message: "Scheduled end must be after scheduled start.",
  path: ["scheduledEnd"] as const,
};

/**
 * Single source of truth for task inputs: the future TaskForm (Unit 6) and
 * the service layer share these schemas and the inferred types below.
 * Dates are YYYY-MM-DD keys; scheduled bounds are full ISO date-times.
 * There is deliberately no `overdue` status: overdue is derived on the
 * client via `isTaskOverdue` + `profiles.timezone`, never stored.
 */
export const taskBaseSchema = z.object({
  title: titleField,
  description: descriptionField,
  priority: z.enum(PRIORITIES),
  status: z.enum(TASK_STATUSES),
  dueDate: optionalDateKeyField,
  scheduledStart: optionalDatetimeField,
  scheduledEnd: optionalDatetimeField,
  estimatedDurationMinutes: z
    .number()
    .int()
    .positive("Estimated duration must be longer than 0 minutes.")
    .nullable()
    .optional(),
  goalId: z.string().uuid("Select a valid goal.").nullable().optional(),
  milestoneId: z.string().uuid("Select a valid milestone.").nullable().optional(),
});

export const createTaskSchema = taskBaseSchema.refine(hasValidSchedule, {
  message: SCHEDULE_REFINEMENT.message,
  path: [...SCHEDULE_REFINEMENT.path],
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = taskBaseSchema.partial().refine(hasValidSchedule, {
  message: SCHEDULE_REFINEMENT.message,
  path: [...SCHEDULE_REFINEMENT.path],
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export interface TaskValidationMessages {
  titleRequired: string;
  titleTooLong: string;
  descriptionTooLong: string;
  dateFormat: string;
  isoDateTime: string;
  scheduledEndAfterStart: string;
  durationPositive: string;
  validGoal: string;
  validMilestone: string;
}

/** Localized factories for forms; static exports above stay English for tests. */
export function createTaskFormSchemas(v: TaskValidationMessages) {
  const titleField = z.string().trim().min(1, v.titleRequired).max(200, v.titleTooLong);
  const descriptionField = z
    .string()
    .trim()
    .max(2000, v.descriptionTooLong)
    .nullable()
    .optional();
  const dateKeyField = z.iso.date({ error: v.dateFormat });
  const optionalDateKeyField = dateKeyField.nullable().optional();
  const datetimeField = z.iso.datetime({ error: v.isoDateTime });
  const optionalDatetimeField = datetimeField.nullable().optional();
  const base = z.object({
    title: titleField,
    description: descriptionField,
    priority: z.enum(PRIORITIES),
    status: z.enum(TASK_STATUSES),
    dueDate: optionalDateKeyField,
    scheduledStart: optionalDatetimeField,
    scheduledEnd: optionalDatetimeField,
    estimatedDurationMinutes: z
      .number()
      .int()
      .positive(v.durationPositive)
      .nullable()
      .optional(),
    goalId: z.string().uuid(v.validGoal).nullable().optional(),
    milestoneId: z.string().uuid(v.validMilestone).nullable().optional(),
  });
  const createTaskSchema = base.refine(hasValidSchedule, {
    message: v.scheduledEndAfterStart,
    path: ["scheduledEnd"],
  });
  const updateTaskSchema = base.partial().refine(hasValidSchedule, {
    message: v.scheduledEndAfterStart,
    path: ["scheduledEnd"],
  });
  return { createTaskSchema, updateTaskSchema };
}
