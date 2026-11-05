import { findConflicts, type PlanBlock, type WeeklyAvailability } from "@/lib/planner";

import { BlockServiceError, type BlockErrorCode } from "./errors";
import type { Messages } from "@/lib/i18n/I18nContext";
import { pluralCategory, tmpl } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/types";

/**
 * User-facing copy for the manual-block dialogs (plan.md Unit 7).
 *
 * Two jobs, both pure:
 * - `collectBlockWarnings` turns a draft block into the warnings the user must
 *   consciously accept before saving (PRD §18: "no conflicting time blocks
 *   without an explicit user decision"). It never blocks the write itself —
 *   the dialog asks for confirmation instead of silently refusing.
 * - `describeBlockError` maps an error *code* to human text. Codes come from
 *   `errors.ts`; raw Postgres text never reaches the screen (it stays in
 *   `details` for logs).
 *
 * Conflict math is not re-implemented here: everything goes through
 * `findConflicts` from `@/lib/planner` (Д2), the same function the day view
 * uses for its "Overlaps" / "Outside waking hours" badges.
 */

/** Minimal block shape the warnings need: it only compares instants. */
export interface BlockWindow {
  id: string;
  start: string;
  end: string;
}

export type BlockWarningKind = "overlap" | "sleep" | "past";

export interface BlockWarning {
  kind: BlockWarningKind;
  message: string;
}

export interface BlockWarningsInput {
  /** Draft block, full ISO instants (already converted from wall time). */
  startTime: string;
  endTime: string;
  /** Blocks already scheduled around the draft, in any range covering it. */
  blocks: readonly BlockWindow[];
  /** The block being edited: its stored row must not conflict with itself. */
  editedBlockId?: string | null;
  now: Date;
  timeZone: string;
  /** Null when the user has no preferences row: waking hours stay unknown. */
  wakeUpTime: string | null;
  sleepTime: string | null;
  workingHours?: WeeklyAvailability;
  studyHours?: WeeklyAvailability;
}

/** Pseudo id for the draft: `findConflicts` reports conflicts by block id. */
const DRAFT_BLOCK_ID = "__draft__";
/** Same fallbacks as the day view: used only to suppress invented sleep warnings. */
const FALLBACK_WAKE_UP = "00:00";
const FALLBACK_SLEEP = "23:59";

function overlapMessage(
  count: number,
  t: Messages["planner"],
  locale: Locale,
): string {
  if (count === 1) return t.overlapWarning;
  const cat = pluralCategory(locale, count);
  void cat;
  return tmpl(t.overlapWarningMany, { count });
}

function sleepMessage(wakeUpTime: string, sleepTime: string, t: Messages["planner"]): string {
  return tmpl(t.outsideWarning, { start: wakeUpTime, end: sleepTime });
}

function pastMessage(t: Messages["planner"]): string {
  return t.pastWarning;
}

/**
 * Warnings for one draft block, in a stable order: overlap, then waking hours,
 * then past. An invalid interval (empty, reversed, unparseable) produces no
 * warnings — the form reports that as a field error instead of guessing.
 */
export function collectBlockWarnings(
  input: BlockWarningsInput,
  t?: Messages["planner"],
  locale?: Locale,
): BlockWarning[] {
  const startMs = Date.parse(input.startTime);
  const endMs = Date.parse(input.endTime);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  const hasWakingHours = input.wakeUpTime !== null && input.sleepTime !== null;
  const draft: PlanBlock = {
    id: DRAFT_BLOCK_ID,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  const others: PlanBlock[] = input.blocks
    .filter((block) => block.id !== input.editedBlockId)
    .map((block) => ({ id: block.id, startTime: block.start, endTime: block.end }));

  const conflicts = findConflicts([...others, draft], {
    now: input.now,
    timeZone: input.timeZone,
    wakeUpTime: input.wakeUpTime ?? FALLBACK_WAKE_UP,
    sleepTime: input.sleepTime ?? FALLBACK_SLEEP,
    workingHours: input.workingHours ?? {},
    studyHours: input.studyHours ?? {},
  }).filter((conflict) => conflict.kind !== "work" && (hasWakingHours || conflict.kind !== "sleep"));

  let overlapCount = 0;
  let crossesSleep = false;
  let inPast = false;

  for (const conflict of conflicts) {
    if (
      conflict.kind === "overlap" &&
      (conflict.blockId === DRAFT_BLOCK_ID || conflict.otherId === DRAFT_BLOCK_ID)
    ) {
      overlapCount += 1;
      continue;
    }

    if (conflict.blockId !== DRAFT_BLOCK_ID) {
      continue;
    }

    if (conflict.kind === "sleep") {
      crossesSleep = true;
    }

    if (conflict.kind === "past") {
      inPast = true;
    }
  }

  const warnings: BlockWarning[] = [];

  if (overlapCount > 0) {
    warnings.push({
      kind: "overlap",
      message: t && locale ? overlapMessage(overlapCount, t, locale) : overlapMessage(overlapCount, {
        overlapWarning: "This block shares its time with another block. Both stay in your plan and are marked as overlapping.",
        overlapWarningMany: "This block shares its time with {count} other blocks. They all stay in your plan and are marked as overlapping.",
      } as Messages["planner"], "en"),
    });
  }

  if (crossesSleep && input.wakeUpTime !== null && input.sleepTime !== null) {
    warnings.push({
      kind: "sleep",
      message: t
        ? sleepMessage(input.wakeUpTime, input.sleepTime, t)
        : `This block runs outside your waking hours (${input.wakeUpTime}–${input.sleepTime}). The planner never puts tasks there on its own; a block you add stays where you put it.`,
    });
  }

  if (inPast) {
    warnings.push({
      kind: "past",
      message: t ? pastMessage(t) : "This block is in the past. Nothing new is planned there, so it stays as a record of what already happened.",
    });
  }

  return warnings;
}

/**
 * Human copy per error code, written for someone changing a block rather than
 * for a developer reading a stack trace.
 */
const BLOCK_ERROR_UI_COPY: Record<BlockErrorCode, string> = {
  validation:
    "This block could not be saved. Check the times and the linked task, then try again.",
  not_found: "This block is no longer there. It may have been deleted in another tab.",
  forbidden: "You do not have access to change this block. Sign in again and retry.",
  conflict:
    "This time overlaps a block that is already there. Adjust the times, or confirm the overlap and accept again.",
  network: "The connection dropped before the block was saved. Check your connection and retry.",
  unknown: "The block could not be saved. Try again in a moment.",
};

export function describeBlockError(error: unknown, t?: Messages["planner"]): string {
  const copy: Record<BlockErrorCode, string> = t
    ? {
        validation: t.blockSaveError,
        not_found: t.blockGoneError,
        forbidden: t.blockAccessError,
        conflict: t.blockOverlapError,
        network: t.blockNetworkError,
        unknown: t.blockUnknownError,
      }
    : BLOCK_ERROR_UI_COPY;

  if (error instanceof BlockServiceError) {
    return copy[error.code];
  }

  return copy.unknown;
}