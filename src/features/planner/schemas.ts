import { z } from "zod";

import { BLOCK_TYPES } from "@/types/domain";

const DATETIME_MESSAGE = "Use an ISO date-time, e.g. 2026-11-04T10:00:00.000Z.";

const titleField = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(200, "Title must be 200 characters or fewer.");

const datetimeField = z.iso.datetime({ error: DATETIME_MESSAGE });

const blockTypeField = z.enum(BLOCK_TYPES);

const taskIdField = z.string().uuid("Select a valid task.").nullable().optional();

interface TimeSlice {
  startTime?: string | null;
  endTime?: string | null;
}

/**
 * Strictly after, compared as instants (not lexicographically) so mixed
 * offsets (`Z` vs `+03:00`) compare correctly. Null/undefined on either
 * side means "not provided" and always passes — the service or the
 * database CHECK (`end_time > start_time`) decides the rest.
 */
function hasValidInterval(values: TimeSlice): boolean {
  if (values.startTime == null || values.endTime == null) {
    return true;
  }

  const start = Date.parse(values.startTime);
  const end = Date.parse(values.endTime);

  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

interface BlockLinkSlice {
  blockType?: (typeof BLOCK_TYPES)[number] | null;
  taskId?: string | null;
}

/**
 * Д4: `block_type = 'task'` ⇔ `task_id NOT NULL`. A task block without a
 * task and a break/personal block with a task both violate the 0005 CHECKs,
 * so the form layer rejects them with a human message before any write.
 */
function hasValidTaskLink(values: BlockLinkSlice): boolean {
  if (values.blockType === "task") {
    return typeof values.taskId === "string" && values.taskId.length > 0;
  }

  if (values.blockType === "break" || values.blockType === "personal") {
    return values.taskId == null;
  }

  return true;
}

/**
 * Single source of truth for time-block inputs: the future TimeBlockDialog
 * (plan.md Unit 7) and the service layer share these schemas and the
 * inferred types below. Times are full ISO date-times in UTC; display in
 * the user's IANA zone happens at read time.
 */
export const createBlockSchema = z
  .object({
    title: titleField,
    startTime: datetimeField,
    endTime: datetimeField,
    blockType: blockTypeField,
    taskId: taskIdField,
  })
  .refine(hasValidInterval, {
    message: "End must be after start.",
    path: ["endTime"],
  })
  .refine(hasValidTaskLink, {
    message: "A task block must link to a task; break and personal blocks must not.",
    path: ["taskId"],
  });

export type CreateBlockInput = z.infer<typeof createBlockSchema>;

/**
 * Partial update. The link refinement only rejects an explicit
 * contradiction inside the patch itself (task + null, or break/personal +
 * a task id). When the patch touches only one side of the pair, the
 * service resolves the effective post-patch pair against the stored row
 * before writing — the same posture as tasks' milestone/goal check.
 */
export const updateBlockSchema = z
  .object({
    title: titleField.optional(),
    startTime: datetimeField.optional(),
    endTime: datetimeField.optional(),
    blockType: blockTypeField.optional(),
    taskId: taskIdField,
  })
  .refine(hasValidInterval, {
    message: "End must be after start.",
    path: ["endTime"],
  })
  .refine(
    (values) => {
      if (values.blockType === "task" && values.taskId === null) {
        return false;
      }

      if (
        (values.blockType === "break" || values.blockType === "personal") &&
        typeof values.taskId === "string"
      ) {
        return false;
      }

      return true;
    },
    {
      message: "A task block must link to a task; break and personal blocks must not.",
      path: ["taskId"],
    },
  );

export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;

/**
 * One accepted proposal slot: a `task` block for one task, UTC instants.
 * The title travels with the slot (the task title at preview time); the
 * service falls back to the stored task title when it arrives blank.
 */
export const planSlotSchema = z
  .object({
    taskId: z.string().uuid("Select a valid task."),
    title: z.string().max(200, "Title must be 200 characters or fewer."),
    start: datetimeField,
    end: datetimeField,
  })
  .refine(
    (values) => {
      // Explicit parsability: an unparsable end must not collapse into a
      // NaN key downstream — it is a validation error here instead.
      const start = Date.parse(values.start);
      const end = Date.parse(values.end);

      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    },
    {
      message: "End must be after start.",
      path: ["end"],
    },
  );

/**
 * Batch accept of a plan preview. Slots are deduplicated by the service
 * (`taskId + start + end`), so sending the same plan twice is safe.
 * `dateKey`/`timeZone` scope the same-day check (B1): a slot whose task
 * already owns a block on that day is skipped and reported in
 * `skippedTaskIds`, never duplicated.
 */
export const applyPlanSchema = z.object({
  slots: z.array(planSlotSchema).max(100, "Too many slots in one plan."),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date, e.g. 2026-11-04."),
  timeZone: z.string().min(1, "Time zone is required."),
  /**
   * Explicit consent to write slots that overlap blocks already on this
   * day (S1). The panel binds it to the exact draft behind its checkbox;
   * without it an overlap is a coded `conflict`, never a silent booking.
   */
  allowConflicts: z.boolean().optional(),
});

export type ApplyPlanInput = z.infer<typeof applyPlanSchema>;

export interface ApplyPlanValidationMessages {
  titleTooLong: string;
  isoDateTime: string;
  validTask: string;
  endAfterStart: string;
  tooManySlots: string;
  calendarDate: string;
  timezoneRequired: string;
}

/**
 * Localized plan/apply schemas. Accepted values are identical to the static
 * exports (messages never affect parsing); the service layer keeps the
 * static schemas and maps failures to stable error codes.
 */
export function createApplyPlanSchemas(v: ApplyPlanValidationMessages) {
  const datetimeField = z.iso.datetime({ error: v.isoDateTime });
  const planSlotSchema = z
    .object({
      taskId: z.string().uuid(v.validTask),
      title: z.string().max(200, v.titleTooLong),
      start: datetimeField,
      end: datetimeField,
    })
    .refine(
      (values) => {
        const start = Date.parse(values.start);
        const end = Date.parse(values.end);
        return Number.isFinite(start) && Number.isFinite(end) && end > start;
      },
      { message: v.endAfterStart, path: ["end"] },
    );

  const applyPlanSchema = z.object({
    slots: z.array(planSlotSchema).max(100, v.tooManySlots),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, v.calendarDate),
    timeZone: z.string().min(1, v.timezoneRequired),
    allowConflicts: z.boolean().optional(),
  });

  return { planSlotSchema, applyPlanSchema };
}

export interface BlockValidationMessages {
  titleRequired: string;
  titleTooLong: string;
  isoDateTime: string;
  validTask: string;
  endAfterStart: string;
  taskLink: string;
}

/** Localized factories for forms; static exports above stay English for tests. */
export function createBlockFormSchemas(v: BlockValidationMessages) {
  const titleField = z.string().trim().min(1, v.titleRequired).max(200, v.titleTooLong);
  const datetimeField = z.iso.datetime({ error: v.isoDateTime });
  const blockTypeField = z.enum(BLOCK_TYPES);
  const taskIdField = z.string().uuid(v.validTask).nullable().optional();
  const createBlockSchema = z
    .object({
      title: titleField,
      startTime: datetimeField,
      endTime: datetimeField,
      blockType: blockTypeField,
      taskId: taskIdField,
    })
    .refine(hasValidInterval, { message: v.endAfterStart, path: ["endTime"] })
    .refine(hasValidTaskLink, { message: v.taskLink, path: ["taskId"] });
  return { createBlockSchema };
}
