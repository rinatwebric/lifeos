import { localDateTimeToIso } from "@/lib/dates";
import type { Messages } from "@/lib/i18n/I18nContext";
import type { BlockType } from "@/types/domain";

import { createBlockFormSchemas, createBlockSchema, type CreateBlockInput } from "./schemas";

/**
 * Form-to-payload adapter for `TimeBlockDialog` (plan.md Unit 7). Framework
 * free on purpose: the dialog holds the field state, this module owns the
 * conversion and the validation verdict, so both are testable without React.
 *
 * Two rules it encodes:
 * - Wall time in, instant out. `datetime-local` values mean "this clock time
 *   in the user's zone", never the browser zone, so they are converted with
 *   `localDateTimeToIso` only.
 * - One source of truth for the rules: the payload is validated by
 *   `createBlockSchema` from `./schemas` (end after start, a task block needs
 *   a task, break/personal blocks must not carry one). Nothing is re-checked
 *   here; only the message for "no task chosen" is phrased for the form, and
 *   the derived title for a task block is filled in from the chosen task.
 */

export interface BlockFormValues {
  blockType: BlockType;
  /** `""` means "no task chosen". */
  taskId: string;
  /** Only used for break/personal blocks; a task block takes the task title. */
  title: string;
  /** `<input type="datetime-local">` value: wall time in the user's zone. */
  startLocal: string;
  endLocal: string;
}

/** Field a form error belongs to; times keep the form's own names. */
export type BlockFormField = "taskId" | "title" | "startTime" | "endTime";

export type BlockFormErrors = Partial<Record<BlockFormField, string>>;

export interface BlockTaskOption {
  id: string;
  title: string;
}

export type BuildBlockInputResult =
  | { ok: true; input: CreateBlockInput }
  | { ok: false; errors: BlockFormErrors };

/**
 * Reads a `<input type="datetime-local">` value as wall time in `timeZone` and
 * returns the UTC instant, or null when the field is empty or malformed. The
 * dialog never converts through `new Date(value)` — that would use the browser
 * zone instead of the user's.
 */
export function wallTimeToIso(local: string, timeZone: string): string | null {
  if (local.trim() === "") {
    return null;
  }

  try {
    return localDateTimeToIso(local, timeZone);
  } catch {
    return null;
  }
}

/**
 * Duration of the draft in whole minutes, or null while the interval is not
 * valid yet (empty field, unparseable value, end not after start).
 */
export function draftDurationMinutes(values: BlockFormValues, timeZone: string): number | null {
  const startTime = wallTimeToIso(values.startLocal, timeZone);
  const endTime = wallTimeToIso(values.endLocal, timeZone);

  if (startTime === null || endTime === null) {
    return null;
  }

  const minutes = Math.round((Date.parse(endTime) - Date.parse(startTime)) / 60_000);

  return minutes > 0 ? minutes : null;
}

/** Effective block title: the linked task's title, or the typed one. */
export function resolveBlockTitle(
  values: BlockFormValues,
  tasks: readonly BlockTaskOption[],
): string {
  if (values.blockType !== "task") {
    return values.title.trim();
  }

  const taskId = values.taskId.trim();
  return tasks.find((task) => task.id === taskId)?.title.trim() ?? "";
}

/**
 * Validates the form and returns the payload for `createBlock`/`updateBlock`.
 * The dialog always sends the full payload, so one schema covers both modes.
 */
export function buildBlockInput(
  values: BlockFormValues,
  options: {
    timeZone: string;
    tasks: readonly BlockTaskOption[];
    missingStart?: string;
    missingEnd?: string;
    missingTask?: string;
    v?: Messages["validation"] & Pick<Messages["planner"], "schemaEndAfterStart" | "schemaTaskLink">;
  },
): BuildBlockInputResult {
  const MISSING_START = options.missingStart ?? "Choose a start date and time.";
  const MISSING_END = options.missingEnd ?? "Choose an end date and time.";
  const MISSING_TASK = options.missingTask ?? "Choose the task this block is for.";
  const schema = options.v
    ? createBlockFormSchemas({
        titleRequired: options.v.titleRequired,
        titleTooLong: options.v.titleTooLong,
        isoDateTime: options.v.isoDateTime,
        validTask: options.v.validTask,
        endAfterStart: options.v.schemaEndAfterStart,
        taskLink: options.v.schemaTaskLink,
      }).createBlockSchema
    : createBlockSchema;
  const errors: BlockFormErrors = {};
  const startTime = wallTimeToIso(values.startLocal, options.timeZone);
  const endTime = wallTimeToIso(values.endLocal, options.timeZone);

  if (startTime === null) {
    errors.startTime = MISSING_START;
  }

  if (endTime === null) {
    errors.endTime = MISSING_END;
  }

  if (startTime === null || endTime === null) {
    return { ok: false, errors };
  }

  const taskId = values.blockType === "task" ? values.taskId.trim() : "";
  const parsed = schema.safeParse({
    title: resolveBlockTitle(values, options.tasks),
    startTime,
    endTime,
    blockType: values.blockType,
    taskId: taskId === "" ? null : taskId,
  });

  if (parsed.success) {
    return { ok: true, input: parsed.data };
  }

  for (const issue of parsed.error.issues) {
    const field = issue.path[0];

    if (field === "taskId") {
      errors.taskId ??= MISSING_TASK;
      continue;
    }

    // A task block with no resolvable task fails on the derived title.
    if (field === "title" && values.blockType === "task") {
      errors.taskId ??= MISSING_TASK;
      continue;
    }

    if (field === "title" || field === "startTime" || field === "endTime") {
      errors[field] ??= issue.message;
    }
  }

  return { ok: false, errors };
}