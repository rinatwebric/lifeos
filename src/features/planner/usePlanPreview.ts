import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  getPreferences,
  getProfile,
  preferencesQueryKey,
  profileQueryKey,
} from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { tasks as taskQueryKeys } from "@/features/tasks/queryKeys";
import { isTaskOverdue, isoToLocalDateTime } from "@/lib/dates";
import {
  computeFreeWindows,
  explainSlot,
  explainSlotParts,
  planDay,
  selectCandidates,
  type PlanBlock,
  type ScoreContext,
  type SlotReasonParts,
  type WeeklyAvailability,
} from "@/lib/planner";
import type { Priority, Task } from "@/types/domain";

import { listBlocks, type BlockRange } from "./api";
import { planner } from "./queryKeys";
import { parseWeeklyAvailability, plannerDayBounds, readWallTime } from "./usePlannerDay";

/**
 * Plan preview model (iteration 4, unit 8). `buildPlanPreview` is pure: it
 * takes tasks, the existing blocks, the availability preferences, the waking
 * hours, the day, the time zone and `now` as explicit inputs and returns what
 * a proposal *would* look like. It writes nothing — no Supabase client, no
 * cache, no `new Date()` inside. `usePlanPreview` only reads (profile,
 * preferences, blocks of the day, tasks) and feeds the pure function.
 *
 * Decisions baked in here:
 * - Д3: placement, ordering and the no-splitting rule come from `planDay`;
 *   this module never re-implements the scheduler.
 * - Д6: closed tasks never appear (they are dropped inside `selectCandidates`).
 * - Д7: a task without an estimate never gets a default duration; it goes to
 *   `needsEstimate` with copy that asks for an estimate.
 * - Д1/Д2: free time is derived through `computeFreeWindows`, and working /
 *   study hours shrink the windows instead of banning a slot.
 * - PRD §4.3: every slot carries the human explanation from `explainSlot`
 *   (task, day, time, duration, why). `preferredWorkPeriods` is passed here
 *   because `planDay` needs it for scoring only, never for placement.
 * - Nothing is persisted: Accept is unit 9's job, so a preview can be
 *   regenerated or cancelled without a trace.
 */

const MS_PER_MINUTE = 60_000;

/** Why a task is missing from the proposal: `DoesNotFit` plus Д7. */
export type PlanPreviewIssueReason = "no-window" | "too-long" | "needs-estimate";

export interface PlanPreviewSlot {
  taskId: string;
  taskTitle: string;
  priority: Priority;
  overdue: boolean;
  /** ISO instants — what Accept (unit 9) would write, nothing more. */
  start: string;
  end: string;
  /** Local wall-clock time in the user's zone ("HH:MM"). */
  startLabel: string;
  endLabel: string;
  crossesMidnight: boolean;
  durationMinutes: number;
  /** Human sentence from `explainSlot`: which task, when, how long, why. */
  reason: string;
  /**
   * Structured reason parts for locale rendering (stable keys, no English
   * comparison). Optional for backward compat — UI falls back to `reason`.
   */
  reasonParts?: SlotReasonParts;
}

export interface PlanPreviewIssue {
  taskId: string;
  taskTitle: string;
  priority: Priority;
  /** Null only for `needs-estimate`. */
  estimatedDurationMinutes: number | null;
  reason: PlanPreviewIssueReason;
  /** Product copy: what happened and what to do next. */
  explanation: string;
}

/**
 * A task that already owns a block on the previewed day (B1): the plan
 * leaves it untouched and says so instead of proposing a second block.
 * Labels are the block's local wall-clock time in the user's zone.
 */
export interface PlanPreviewAlreadyPlanned {
  taskId: string;
  taskTitle: string;
  priority: Priority;
  estimatedDurationMinutes: number | null;
  blockId: string;
  /** Stored ISO instants of the existing block — never written, only shown. */
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  crossesMidnight: boolean;
  explanation: string;
}

export interface PlanPreviewSummary {
  /** Open tasks with a usable estimate the planner tried to place. */
  candidateCount: number;
  slotCount: number;
  plannedMinutes: number;
  /** Tasks with an estimate that found no room on this day. */
  unplacedCount: number;
  /** Known estimate of those tasks — the time still looking for a home. */
  unplacedMinutes: number;
  needsEstimateCount: number;
  /** Tasks that already own a block on this day (B1, left untouched). */
  alreadyPlannedCount: number;
  hasWakingHours: boolean;
  hasFreeWindows: boolean;
}

export interface PlanPreview {
  dateKey: string;
  timeZone: string;
  slots: PlanPreviewSlot[];
  doesNotFit: PlanPreviewIssue[];
  needsEstimate: PlanPreviewIssue[];
  alreadyPlanned: PlanPreviewAlreadyPlanned[];
  summary: PlanPreviewSummary;
  /** True when there is at least one slot to accept. */
  canAccept: boolean;
}

export interface PlanPreviewInput {
  tasks: readonly Task[];
  blocks: readonly PlanBlock[];
  dateKey: string;
  timeZone: string;
  now: Date;
  /** Null when the user has no preferences row: no free time is claimed. */
  wakeUpTime: string | null;
  sleepTime: string | null;
  workingHours?: WeeklyAvailability;
  studyHours?: WeeklyAvailability;
  preferredWorkPeriods?: WeeklyAvailability;
}

const ISSUE_EXPLANATION: Record<"no-window" | "too-long", string> = {
  "too-long":
    "The estimate is longer than the longest free window on this day. Shorten the estimate or free up a longer stretch.",
  "no-window":
    "The free time on this day ran out before this task could be placed. Move it to another day or free up time.",
};

const NO_FREE_TIME_EXPLANATION =
  "No free time is left on this day, so nothing can be placed. Free up time or choose another day.";

const NEEDS_ESTIMATE_EXPLANATION =
  "This task has no time estimate. Add one so the planner knows how much time to reserve.";

function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const local = isoToLocalDateTime(iso, timeZone);

  return { date: local.slice(0, 10), time: local.slice(11) };
}

function toNeedsEstimateIssue(task: Task): PlanPreviewIssue {
  return {
    taskId: task.id,
    taskTitle: task.title,
    priority: task.priority,
    estimatedDurationMinutes: null,
    reason: "needs-estimate",
    explanation: NEEDS_ESTIMATE_EXPLANATION,
  };
}

/**
 * Read-only proposal for one day: slots in chronological order, the tasks that
 * did not fit, the tasks that need an estimate, and a summary of planned vs
 * remaining time. Deterministic — the same input always yields the same plan.
 */
export function buildPlanPreview(input: PlanPreviewInput): PlanPreview {
  const workingHours = input.workingHours ?? {};
  const studyHours = input.studyHours ?? {};
  const preferredPeriods = input.preferredWorkPeriods ?? {};
  const taskById = new Map<string, Task>(input.tasks.map((task) => [task.id, task] as const));
  const { wakeUpTime, sleepTime } = input;

  if (wakeUpTime === null || sleepTime === null) {
    const { needsEstimate } = selectCandidates({
      tasks: input.tasks,
      now: input.now,
      timeZone: input.timeZone,
    });
    const issues = needsEstimate.map(toNeedsEstimateIssue);

    return {
      dateKey: input.dateKey,
      timeZone: input.timeZone,
      slots: [],
      doesNotFit: [],
      needsEstimate: issues,
      alreadyPlanned: [],
      summary: {
        candidateCount: 0,
        slotCount: 0,
        plannedMinutes: 0,
        unplacedCount: 0,
        unplacedMinutes: 0,
        needsEstimateCount: issues.length,
        alreadyPlannedCount: 0,
        hasWakingHours: false,
        hasFreeWindows: false,
      },
      canAccept: false,
    };
  }

  const context: ScoreContext = {
    now: input.now,
    timeZone: input.timeZone,
    workingHours,
    studyHours,
    preferredPeriods,
  };

  const hasFreeWindows =
    computeFreeWindows({
      dateKey: input.dateKey,
      timeZone: input.timeZone,
      wakeUpTime,
      sleepTime,
      workingHours,
      studyHours,
      blocks: input.blocks,
    }).length > 0;

  const plan = planDay({
    dateKey: input.dateKey,
    timeZone: input.timeZone,
    now: input.now,
    wakeUpTime,
    sleepTime,
    workingHours,
    studyHours,
    blocks: input.blocks,
    tasks: input.tasks,
  });

  const slots: PlanPreviewSlot[] = [];

  for (const planned of plan.slots) {
    const task = taskById.get(planned.taskId);

    if (!task) {
      continue;
    }

    const range = { start: planned.start, end: planned.end };
    const start = localParts(planned.start, input.timeZone);
    const end = localParts(planned.end, input.timeZone);

    slots.push({
      taskId: task.id,
      taskTitle: task.title,
      priority: task.priority,
      overdue: isTaskOverdue(task, input.now, input.timeZone),
      start: planned.start,
      end: planned.end,
      startLabel: start.time,
      endLabel: end.time,
      crossesMidnight: start.date !== end.date,
      durationMinutes: Math.max(
        0,
        Math.round((Date.parse(planned.end) - Date.parse(planned.start)) / MS_PER_MINUTE),
      ),
      reason: explainSlot(task, range, context),
      reasonParts: explainSlotParts(task, range, context),
    });
  }

  const doesNotFit: PlanPreviewIssue[] = [];

  for (const entry of plan.doesNotFit) {
    const task = taskById.get(entry.taskId);

    if (!task) {
      continue;
    }

    doesNotFit.push({
      taskId: task.id,
      taskTitle: task.title,
      priority: task.priority,
      estimatedDurationMinutes: task.estimatedDurationMinutes ?? null,
      reason: entry.reason,
      explanation: hasFreeWindows ? ISSUE_EXPLANATION[entry.reason] : NO_FREE_TIME_EXPLANATION,
    });
  }

  const needsEstimate = plan.needsEstimate.map(toNeedsEstimateIssue);

  // B1: the plan leaves these alone — the preview names the existing block's
  // local time so the reader knows nothing new will be added for them.
  const alreadyPlanned: PlanPreviewAlreadyPlanned[] = [];

  for (const entry of plan.alreadyPlanned) {
    const task = taskById.get(entry.taskId);

    if (!task) {
      continue;
    }

    const start = localParts(entry.start, input.timeZone);
    const end = localParts(entry.end, input.timeZone);

    alreadyPlanned.push({
      taskId: task.id,
      taskTitle: task.title,
      priority: task.priority,
      estimatedDurationMinutes: task.estimatedDurationMinutes ?? null,
      blockId: entry.blockId,
      start: entry.start,
      end: entry.end,
      startLabel: start.time,
      endLabel: end.time,
      crossesMidnight: start.date !== end.date,
      explanation: `Already in your plan on this day, ${start.time}–${end.time}. Accepting the plan leaves this block untouched.`,
    });
  }

  const plannedMinutes = slots.reduce((total, slot) => total + slot.durationMinutes, 0);
  const unplacedMinutes = doesNotFit.reduce(
    (total, issue) => total + (issue.estimatedDurationMinutes ?? 0),
    0,
  );

  return {
    dateKey: input.dateKey,
    timeZone: input.timeZone,
    slots,
    doesNotFit,
    needsEstimate,
    alreadyPlanned,
    summary: {
      candidateCount: slots.length + doesNotFit.length,
      slotCount: slots.length,
      plannedMinutes,
      unplacedCount: doesNotFit.length,
      unplacedMinutes,
      needsEstimateCount: needsEstimate.length,
      alreadyPlannedCount: alreadyPlanned.length,
      hasWakingHours: true,
      hasFreeWindows,
    },
    canAccept: slots.length > 0,
  };
}

export interface PlanPreviewOptions {
  dateKey: string;
  now?: Date;
  /** Keep the reads idle until the preview is actually opened (unit 9). */
  enabled?: boolean;
}

export interface PlanPreviewViewModel {
  preview: PlanPreview;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

/**
 * Reads what the preview needs and nothing else: one profile read, one
 * preferences read, one blocks query for the day range and one tasks list.
 * No mutation, no `setQueryData`, no cache write of its own — a preview that
 * is cancelled leaves the application state untouched.
 */
export function usePlanPreview({
  dateKey,
  now = new Date(),
  enabled = true,
}: PlanPreviewOptions): PlanPreviewViewModel {
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
    enabled,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const nowMs = now.getTime();

  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    staleTime: 60_000,
    enabled,
  });

  const bounds = useMemo(() => plannerDayBounds(dateKey, timeZone), [dateKey, timeZone]);
  const range = useMemo<BlockRange>(
    () => ({ from: bounds.start, to: bounds.end }),
    [bounds.start, bounds.end],
  );

  // The day range depends on the profile time zone: until it is known the key
  // would be the UTC variant, so the read waits instead of fetching the day
  // twice. `useBlocks` (hooks.ts) has no `enabled` switch and stays untouched
  // in this unit, so the read is declared here on the same `planner.range` key:
  // one request per range, cache shared with the day view.
  const blocksQuery = useQuery({
    queryKey: planner.range(range),
    queryFn: () => listBlocks(range),
    enabled: enabled && profileQuery.isSuccess,
  });

  const tasksQuery = useQuery({
    queryKey: taskQueryKeys.list(),
    queryFn: () => listTasks(),
    staleTime: 60_000,
    enabled,
  });

  const preferences = preferencesQuery.data;
  const wakeUpTime = readWallTime(preferences?.wakeUpTime);
  const sleepTime = readWallTime(preferences?.sleepTime);
  const workingHours = useMemo(
    () => parseWeeklyAvailability(preferences?.workingHours),
    [preferences],
  );
  const studyHours = useMemo(() => parseWeeklyAvailability(preferences?.studyHours), [preferences]);
  const preferredWorkPeriods = useMemo(
    () => parseWeeklyAvailability(preferences?.preferredWorkPeriods),
    [preferences],
  );
  const blockList = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);
  const taskList = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  const preview = useMemo(
    () =>
      buildPlanPreview({
        tasks: taskList,
        blocks: blockList,
        dateKey,
        timeZone,
        now: new Date(nowMs),
        wakeUpTime,
        sleepTime,
        workingHours,
        studyHours,
        preferredWorkPeriods,
      }),
    [
      taskList,
      blockList,
      dateKey,
      timeZone,
      nowMs,
      wakeUpTime,
      sleepTime,
      workingHours,
      studyHours,
      preferredWorkPeriods,
    ],
  );

  return {
    preview,
    timeZone,
    isLoading:
      enabled &&
      (profileQuery.isLoading ||
        preferencesQuery.isLoading ||
        blocksQuery.isLoading ||
        tasksQuery.isLoading),
    isError:
      profileQuery.isError || preferencesQuery.isError || blocksQuery.isError || tasksQuery.isError,
    retry: () => {
      void profileQuery.refetch();
      void preferencesQuery.refetch();
      void blocksQuery.refetch();
      void tasksQuery.refetch();
    },
  };
}
