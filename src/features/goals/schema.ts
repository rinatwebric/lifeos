import { z } from "zod";

import {
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  MILESTONE_STATUSES,
  PRIORITIES,
  PROGRESS_MODES,
} from "@/types/domain";

const DATE_KEY_MESSAGE = "Use YYYY-MM-DD.";

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

const progressField = z.number().int().min(0).max(100, "Progress must be between 0 and 100.");

/**
 * Single source of truth for goal/milestone inputs: forms and the service
 * layer share these schemas (and the inferred types below).
 * Dates are YYYY-MM-DD keys; lexicographic comparison matches chronological
 * order, so `target_date >= start_date` is a plain string comparison.
 */
export const goalBaseSchema = z.object({
  title: titleField,
  description: descriptionField,
  category: z.enum(GOAL_CATEGORIES),
  priority: z.enum(PRIORITIES),
  status: z.enum(GOAL_STATUSES),
  startDate: dateKeyField,
  targetDate: optionalDateKeyField,
  progress: progressField,
  progressMode: z.enum(PROGRESS_MODES),
});

export const createGoalSchema = goalBaseSchema.refine(
  (values) =>
    values.targetDate === null ||
    values.targetDate === undefined ||
    values.targetDate >= values.startDate,
  {
    message: "Target date must be on or after the start date.",
    path: ["targetDate"],
  },
);

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = goalBaseSchema
  .partial()
  .refine(
    (values) =>
      values.targetDate === null ||
      values.targetDate === undefined ||
      values.startDate === undefined ||
      values.targetDate >= values.startDate,
    {
      message: "Target date must be on or after the start date.",
      path: ["targetDate"],
    },
  );

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const createMilestoneSchema = z.object({
  goalId: z.string().uuid("Goal is required."),
  title: titleField,
  description: descriptionField,
  targetDate: optionalDateKeyField,
  status: z.enum(MILESTONE_STATUSES).optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

/** Milestones never move between goals: `goalId` is intentionally omitted. */
export const updateMilestoneSchema = createMilestoneSchema.omit({ goalId: true }).partial();

export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

export interface GoalValidationMessages {
  titleRequired: string;
  titleTooLong: string;
  descriptionTooLong: string;
  dateFormat: string;
  progressRange: string;
  targetAfterStart: string;
  goalRequired: string;
}

/** Localized factories for forms; static exports above stay English for tests. */
export function createGoalFormSchemas(v: GoalValidationMessages) {
  const titleField = z.string().trim().min(1, v.titleRequired).max(200, v.titleTooLong);
  const descriptionField = z.string().trim().max(2000, v.descriptionTooLong).nullable().optional();
  const dateKeyField = z.iso.date({ error: v.dateFormat });
  const optionalDateKeyField = dateKeyField.nullable().optional();
  const progressField = z.number().int().min(0).max(100, v.progressRange);
  const base = z.object({
    title: titleField,
    description: descriptionField,
    category: z.enum(GOAL_CATEGORIES),
    priority: z.enum(PRIORITIES),
    status: z.enum(GOAL_STATUSES),
    startDate: dateKeyField,
    targetDate: optionalDateKeyField,
    progress: progressField,
    progressMode: z.enum(PROGRESS_MODES),
  });
  const createGoalSchema = base.refine(
    (values) =>
      values.targetDate === null ||
      values.targetDate === undefined ||
      values.targetDate >= values.startDate,
    { message: v.targetAfterStart, path: ["targetDate"] },
  );
  const updateGoalSchema = base.partial().refine(
    (values) =>
      values.targetDate === null ||
      values.targetDate === undefined ||
      values.startDate === undefined ||
      values.targetDate >= values.startDate,
    { message: v.targetAfterStart, path: ["targetDate"] },
  );
  return { createGoalSchema, updateGoalSchema };
}

export function createMilestoneFormSchema(v: {
  titleRequired: string;
  titleTooLong: string;
  descriptionTooLong: string;
  dateFormat: string;
}) {
  return z.object({
    title: z.string().trim().min(1, v.titleRequired).max(200, v.titleTooLong),
    description: z.string().trim().max(2000, v.descriptionTooLong).nullable().optional(),
    targetDate: z.iso.date({ error: v.dateFormat }).nullable().optional(),
  });
}

export type MilestoneFormValues = z.infer<ReturnType<typeof createMilestoneFormSchema>>;
