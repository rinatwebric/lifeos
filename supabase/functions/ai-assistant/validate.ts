/**
 * Server-side per-action validation (iteration 5, step 5; PRD sections 6.5, 16).
 *
 * Pure pre-apply check: reads only, never writes. Every proposed action is
 * verified against the caller's own rows through the user-scoped client
 * (RLS stays the enforcement point — no `user_id` argument is accepted, so a
 * forged id reads as missing, never as someone else's row). The first
 * failing action (lowest index) rejects the batch with a §16 code; storage
 * errors fail closed as `forbidden`, never as trusted.
 *
 * Schedule math has a single source of truth: overlap / sleep / past come
 * from `findConflicts` in `src/lib/planner.ts` (touching edges are not
 * conflicts there, so they are not conflicts here either). The Deno runtime
 * resolves the `@/lib/*` specifiers through `deno.json`; Vitest resolves
 * them through the Vite `@` alias.
 *
 * The caller passes everything time-like in (`now`, `timeZone`,
 * `wakeUpTime`, `sleepTime`, `workingHours`, `studyHours`) — this module
 * never calls `new Date()`, so tests pin time exactly.
 */

import type { ProposalAction } from "@/lib/aiProposals";
import { toDateKey, toWallTime } from "@/lib/dates";
import { findConflicts } from "@/lib/planner";
import {
  GOAL_CATEGORIES,
  PRIORITIES,
  PROFILE_LANGUAGES,
  PROFILE_THEMES,
  isTaskClosed,
  type AvailabilityWindows,
  type TaskStatus,
} from "@/types/domain";

export const VALIDATE_ERROR_CODES = [
  "missing_goal",
  "missing_milestone",
  "missing_task",
  "wrong_status",
  "invalid_date",
  "inverted_interval",
  "conflict",
  "past",
  "no_time",
  "forbidden",
] as const;
export type ValidateErrorCode = (typeof VALIDATE_ERROR_CODES)[number];

export interface ValidateQueryBuilder {
  select(columns: string): ValidateQueryBuilder;
  eq(column: string, value: string): ValidateQueryBuilder;
  in(column: string, values: string[]): ValidateQueryBuilder;
  gt(column: string, value: string): ValidateQueryBuilder;
  lt(column: string, value: string): ValidateQueryBuilder;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

/**
 * Minimal surface needed from a user-scoped Supabase client. The client
 * always carries the caller's JWT, so RLS holds and no `user_id` argument
 * is ever accepted from the caller.
 */
export interface ValidateClient {
  from(table: string): ValidateQueryBuilder;
}

export interface ValidateContext {
  client: ValidateClient;
  now: Date;
  timeZone: string;
  wakeUpTime: string;
  sleepTime: string;
  workingHours: AvailabilityWindows;
  studyHours: AvailabilityWindows;
}

export type ValidateActionsResult =
  | { ok: true }
  | { ok: false; index: number; code: ValidateErrorCode; message: string };

interface PendingFailure {
  index: number;
  code: ValidateErrorCode;
  message: string;
}

function fail(index: number, code: ValidateErrorCode, message: string): PendingFailure {
  return { index, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

/**
 * Strict ISO 8601 date (`2026-11-05`) or instant; returns epoch ms or null.
 * Mirrors `parseProposal` in `src/lib/aiProposals.ts` (kept local so this
 * module stays free of the Zod runtime).
 */
function parseIsoInstant(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Date-only values compare against the local today key; instants against `now`. */
function isPastValue(value: string, ms: number, context: ValidateContext): boolean {
  if (DATE_ONLY_PATTERN.test(value)) {
    return value < toDateKey(context.now, context.timeZone);
  }
  return ms < context.now.getTime();
}

function isValidTimezone(timezone: string, now: Date): boolean {
  if (timezone.trim() === "") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(now);
    return true;
  } catch {
    return false;
  }
}

interface EntityRefs {
  byId: Map<string, Record<string, unknown>>;
  error: unknown;
}

/** One query per entity over the full id set — never one query per action. */
async function loadRefs(
  client: ValidateClient,
  table: string,
  ids: string[],
  columns: string,
): Promise<EntityRefs> {
  if (ids.length === 0) {
    return { byId: new Map(), error: null };
  }
  try {
    const result = await client.from(table).select(columns).in("id", ids);
    if (result.error) {
      return { byId: new Map(), error: result.error };
    }
    const byId = new Map<string, Record<string, unknown>>();
    if (Array.isArray(result.data)) {
      for (const row of result.data) {
        if (isRecord(row)) {
          const id = readString(row, "id");
          if (id !== null) {
            byId.set(id, row);
          }
        }
      }
    }
    return { byId, error: null };
  } catch (error) {
    return { byId: new Map(), error };
  }
}

interface ScheduleDraft {
  index: number;
  id: string;
  start: string;
  end: string;
}

interface CollectedRefs {
  goals: EntityRefs;
  milestones: EntityRefs;
  tasks: EntityRefs;
}

function checkGoalRefs(
  action: Extract<ProposalAction, { type: "create_milestone" }> | Extract<ProposalAction, { type: "create_task" }>,
  index: number,
  refs: CollectedRefs,
): PendingFailure | null {
  const goalId = action.goalId;
  if (action.type === "create_task" && goalId === null && action.milestoneId !== null) {
    return fail(index, "missing_goal", "A goal is required when a milestone is set.");
  }
  if (goalId === null) {
    return null;
  }
  if (refs.goals.error) {
    return fail(index, "forbidden", "Could not verify the goal. Please try again.");
  }
  if (!refs.goals.byId.has(goalId)) {
    return fail(index, "missing_goal", `Goal ${goalId} was not found.`);
  }
  return null;
}

function checkTaskRef(
  taskId: string,
  index: number,
  refs: CollectedRefs,
): { status: string } | PendingFailure {
  if (refs.tasks.error) {
    return fail(index, "forbidden", "Could not verify the task. Please try again.");
  }
  const row = refs.tasks.byId.get(taskId);
  const status = row ? readString(row, "status") : null;
  if (row === undefined || status === null) {
    return fail(index, "missing_task", `Task ${taskId} was not found.`);
  }
  if (isTaskClosed(status as TaskStatus)) {
    return fail(index, "wrong_status", `Task ${taskId} is already ${status}.`);
  }
  return { status };
}

function checkCreateGoal(action: Extract<ProposalAction, { type: "create_goal" }>, index: number): PendingFailure | null {
  if (action.title.trim().length < 1 || action.title.length > 200) {
    return fail(index, "forbidden", "Goal title must be 1–200 characters.");
  }
  if (action.category !== null && !(GOAL_CATEGORIES as readonly string[]).includes(action.category)) {
    return fail(index, "forbidden", `Goal category ${action.category} is not supported.`);
  }
  if (action.priority !== null && !(PRIORITIES as readonly string[]).includes(action.priority)) {
    return fail(index, "forbidden", `Goal priority ${action.priority} is not supported.`);
  }
  if (action.targetDate !== null && parseIsoInstant(action.targetDate) === null) {
    return fail(index, "invalid_date", `Goal target date ${action.targetDate} is not a valid ISO date.`);
  }
  return null;
}

function checkCreateMilestone(
  action: Extract<ProposalAction, { type: "create_milestone" }>,
  index: number,
  refs: CollectedRefs,
): PendingFailure | null {
  const goalFailure = checkGoalRefs(action, index, refs);
  if (goalFailure !== null) {
    return goalFailure;
  }
  if (action.targetDate !== null && parseIsoInstant(action.targetDate) === null) {
    return fail(index, "invalid_date", `Milestone target date ${action.targetDate} is not a valid ISO date.`);
  }
  return null;
}

function checkCompleteMilestone(
  action: Extract<ProposalAction, { type: "complete_milestone" }>,
  index: number,
  refs: CollectedRefs,
): PendingFailure | null {
  if (refs.milestones.error) {
    return fail(index, "forbidden", "Could not verify the milestone. Please try again.");
  }
  const row = refs.milestones.byId.get(action.milestoneId);
  const status = row ? readString(row, "status") : null;
  if (row === undefined || status === null) {
    return fail(index, "missing_milestone", `Milestone ${action.milestoneId} was not found.`);
  }
  if (status !== "pending") {
    return fail(index, "wrong_status", `Milestone ${action.milestoneId} is already ${status}.`);
  }
  return null;
}

function checkCreateTask(
  action: Extract<ProposalAction, { type: "create_task" }>,
  index: number,
  refs: CollectedRefs,
): PendingFailure | null {
  const goalFailure = checkGoalRefs(action, index, refs);
  if (goalFailure !== null) {
    return goalFailure;
  }
  if (action.milestoneId !== null) {
    if (refs.milestones.error) {
      return fail(index, "forbidden", "Could not verify the milestone. Please try again.");
    }
    const row = refs.milestones.byId.get(action.milestoneId);
    if (row === undefined) {
      return fail(index, "missing_milestone", `Milestone ${action.milestoneId} was not found.`);
    }
    if (action.goalId !== null && readString(row, "goal_id") !== action.goalId) {
      return fail(index, "missing_milestone", `Milestone ${action.milestoneId} does not belong to goal ${action.goalId}.`);
    }
  }
  if (action.dueDate !== null && parseIsoInstant(action.dueDate) === null) {
    return fail(index, "invalid_date", `Task due date ${action.dueDate} is not a valid ISO date.`);
  }
  if (action.estimatedDurationMinutes !== null && !(action.estimatedDurationMinutes > 0)) {
    return fail(index, "no_time", "Estimated duration must be longer than zero minutes.");
  }
  return null;
}

function checkRescheduleTask(
  action: Extract<ProposalAction, { type: "reschedule_task" }>,
  index: number,
  refs: CollectedRefs,
  context: ValidateContext,
): PendingFailure | null {
  const task = checkTaskRef(action.taskId, index, refs);
  if ("code" in task) {
    return task;
  }
  const ms = parseIsoInstant(action.newDate);
  if (ms === null) {
    return fail(index, "invalid_date", `New date ${action.newDate} is not a valid ISO date.`);
  }
  if (isPastValue(action.newDate, ms, context)) {
    return fail(index, "past", `New date ${action.newDate} is in the past.`);
  }
  return null;
}

function checkScheduleBlocksShallow(
  action: Extract<ProposalAction, { type: "schedule_blocks" }>,
  index: number,
  refs: CollectedRefs,
): PendingFailure | ScheduleDraft | null {
  const task = checkTaskRef(action.taskId, index, refs);
  if ("code" in task) {
    return task;
  }
  const startMs = parseIsoInstant(action.startTime);
  if (startMs === null) {
    return fail(index, "invalid_date", `Start time ${action.startTime} is not a valid ISO instant.`);
  }
  const endMs = parseIsoInstant(action.endTime);
  if (endMs === null) {
    return fail(index, "invalid_date", `End time ${action.endTime} is not a valid ISO instant.`);
  }
  if (endMs <= startMs) {
    return fail(index, "inverted_interval", "End time must be after start time.");
  }
  return { index, id: `draft:${index}`, start: action.startTime, end: action.endTime };
}

function checkUpdatePreferences(
  action: Extract<ProposalAction, { type: "update_preferences" }>,
  index: number,
  context: ValidateContext,
): PendingFailure | null {
  if (action.wakeUpTime !== null && toWallTime(action.wakeUpTime) === null) {
    return fail(index, "invalid_date", `Wake-up time ${action.wakeUpTime} must be HH:MM (24-hour).`);
  }
  if (action.sleepTime !== null && toWallTime(action.sleepTime) === null) {
    return fail(index, "invalid_date", `Sleep time ${action.sleepTime} must be HH:MM (24-hour).`);
  }
  const effectiveWake = action.wakeUpTime ?? context.wakeUpTime;
  const effectiveSleep = action.sleepTime ?? context.sleepTime;
  if (
    effectiveWake !== null &&
    effectiveSleep !== null &&
    toWallTime(effectiveWake) === toWallTime(effectiveSleep)
  ) {
    return fail(index, "inverted_interval", "Wake-up and sleep times must differ.");
  }
  if (action.timezone !== null && !isValidTimezone(action.timezone, context.now)) {
    return fail(index, "invalid_date", `Timezone ${action.timezone} is not a valid IANA timezone.`);
  }
  if (action.language !== null && !(PROFILE_LANGUAGES as readonly string[]).includes(action.language)) {
    return fail(index, "forbidden", `Language ${action.language} is not supported.`);
  }
  if (action.theme !== null && !(PROFILE_THEMES as readonly string[]).includes(action.theme)) {
    return fail(index, "forbidden", `Theme ${action.theme} is not supported.`);
  }
  return null;
}

async function loadExistingBlocks(
  client: ValidateClient,
  drafts: ScheduleDraft[],
): Promise<{ blocks: Array<{ id: string; startTime: string; endTime: string }>; error: unknown }> {
  const starts = drafts.map((draft) => draft.start).sort();
  const ends = drafts.map((draft) => draft.end).sort();
  const minStart = starts[0];
  const maxEnd = ends[ends.length - 1];
  try {
    // One query over the union span of all drafts (half-open, like listBlocks).
    const result = await client
      .from("time_blocks")
      .select("id,start_time,end_time")
      .gt("end_time", minStart)
      .lt("start_time", maxEnd);
    if (result.error) {
      return { blocks: [], error: result.error };
    }
    const blocks: Array<{ id: string; startTime: string; endTime: string }> = [];
    if (Array.isArray(result.data)) {
      for (const row of result.data) {
        if (!isRecord(row)) {
          continue;
        }
        const id = readString(row, "id");
        const startTime = readString(row, "start_time");
        const endTime = readString(row, "end_time");
        if (id !== null && startTime !== null && endTime !== null) {
          blocks.push({ id, startTime, endTime });
        }
      }
    }
    return { blocks, error: null };
  } catch (error) {
    return { blocks: [], error };
  }
}

/**
 * Validate every action before anything is applied. Returns the lowest-index
 * failure, or ok when the whole batch is safe to propose for approval.
 */
export async function validateActions(
  actions: readonly ProposalAction[],
  context: ValidateContext,
): Promise<ValidateActionsResult> {
  const goalIds = [...new Set(
    actions.flatMap((action) => {
      if (action.type === "create_milestone") {
        return [action.goalId];
      }
      if (action.type === "create_task" && action.goalId !== null) {
        return [action.goalId];
      }
      return [];
    }),
  )];
  const milestoneIds = [...new Set(
    actions.flatMap((action) =>
      action.type === "complete_milestone"
        ? [action.milestoneId]
        : action.type === "create_task" && action.milestoneId !== null
          ? [action.milestoneId]
          : [],
    ),
  )];
  const taskIds = [...new Set(
    actions.flatMap((action) =>
      action.type === "reschedule_task" || action.type === "schedule_blocks" ? [action.taskId] : [],
    ),
  )];

  const [goals, milestones, tasks] = await Promise.all([
    loadRefs(context.client, "goals", goalIds, "id"),
    loadRefs(context.client, "milestones", milestoneIds, "id,goal_id,status"),
    loadRefs(context.client, "tasks", taskIds, "id,status"),
  ]);
  const refs: CollectedRefs = { goals, milestones, tasks };

  const failures: PendingFailure[] = [];
  const drafts: ScheduleDraft[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    let failure: PendingFailure | null = null;
    switch (action.type) {
      case "create_goal":
        failure = checkCreateGoal(action, index);
        break;
      case "create_milestone":
        failure = checkCreateMilestone(action, index, refs);
        break;
      case "complete_milestone":
        failure = checkCompleteMilestone(action, index, refs);
        break;
      case "create_task":
        failure = checkCreateTask(action, index, refs);
        break;
      case "reschedule_task":
        failure = checkRescheduleTask(action, index, refs, context);
        break;
      case "schedule_blocks": {
        const shallow = checkScheduleBlocksShallow(action, index, refs);
        if (shallow !== null && "id" in shallow) {
          drafts.push(shallow);
        } else {
          failure = shallow;
        }
        break;
      }
      case "update_preferences":
        failure = checkUpdatePreferences(action, index, context);
        break;
    }
    if (failure !== null) {
      failures.push(failure);
    }
  }

  if (drafts.length > 0) {
    const failedIndexes = new Set(failures.map((failure) => failure.index));
    const existing = await loadExistingBlocks(context.client, drafts);
    if (existing.error) {
      const firstDraft = [...drafts].sort((a, b) => a.index - b.index)[0];
      if (!failedIndexes.has(firstDraft.index)) {
        failures.push(fail(firstDraft.index, "forbidden", "Could not verify the schedule. Please try again."));
      }
    } else {
      let draftConflicts: ReturnType<typeof findConflicts> = [];
      try {
        draftConflicts = findConflicts(
          [
            ...existing.blocks.map((block) => ({ id: block.id, startTime: block.startTime, endTime: block.endTime })),
            ...drafts.map((draft) => ({ id: draft.id, startTime: draft.start, endTime: draft.end })),
          ],
          {
            now: context.now,
            timeZone: context.timeZone,
            wakeUpTime: context.wakeUpTime,
            sleepTime: context.sleepTime,
            workingHours: context.workingHours,
            studyHours: context.studyHours,
          },
        );
      } catch {
        const firstDraft = [...drafts].sort((a, b) => a.index - b.index)[0];
        if (!failedIndexes.has(firstDraft.index)) {
          failures.push(fail(firstDraft.index, "forbidden", "Could not verify the schedule. Please try again."));
        }
      }
      const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
      const seen = new Map<string, ValidateErrorCode>();
      for (const conflict of draftConflicts) {
        if (conflict.kind === "work") {
          continue;
        }
        const code: ValidateErrorCode = conflict.kind === "past" ? "past" : "conflict";
        for (const id of [conflict.blockId, conflict.otherId]) {
          if (id === undefined || !draftById.has(id)) {
            continue;
          }
          const previous = seen.get(id);
          if (previous === undefined || (previous === "conflict" && code === "past")) {
            seen.set(id, code);
          }
        }
      }
      for (const [id, code] of seen) {
        const draft = draftById.get(id);
        if (draft && !failedIndexes.has(draft.index)) {
          failures.push(
            code === "past"
              ? fail(draft.index, "past", "Proposed time is in the past.")
              : fail(draft.index, "conflict", "Proposed time overlaps an existing block or sleep."),
          );
          failedIndexes.add(draft.index);
        }
      }
    }
  }

  if (failures.length === 0) {
    return { ok: true };
  }
  const first = failures.sort((a, b) => a.index - b.index)[0];
  return { ok: false, index: first.index, code: first.code, message: first.message };
}
