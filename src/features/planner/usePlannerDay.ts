import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  getPreferences,
  getProfile,
  preferencesQueryKey,
  profileQueryKey,
} from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { tasks } from "@/features/tasks/queryKeys";
import { localDateTimeToIso } from "@/lib/dates";
import {
  computeFreeWindows,
  findConflicts,
  type BlockConflict,
  type DayInterval,
  type DayKey,
  type WeeklyAvailability,
} from "@/lib/planner";
import type { BlockType, TimeBlock } from "@/types/domain";

import { useBlocks } from "./hooks";

/**
 * Day view model (iteration 4, unit 5). The pure part — `buildPlannerDay` —
 * turns one day's blocks into everything the screen renders: the time scale
 * in the user's time zone, busy/free intervals, conflicts (through
 * `findConflicts`, never a second overlap implementation), per-type
 * durations and the empty flag. It takes `now`, the time zone and the
 * preferences as explicit inputs, so it is testable without React and
 * without a network.
 *
 * Decisions baked in here:
 * - Д1: free time is derived (`computeFreeWindows`), never stored.
 * - Д2: the day view marks the hard conflicts a reader can act on — `overlap`
 *   and `sleep`. `work` is the scheduler's soft warning, and `past` is
 *   dropped from the markers because on any past date every block is "past",
 *   which is noise rather than signal. Both stay in `conflicts`.
 * - Д4: a task block is named by its linked task; `title` is the fallback.
 * - Missing waking hours never invent a sleep conflict: without them only
 *   overlaps are reported and no free windows are claimed.
 */

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_KEYS: readonly DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_DAY = 1440;

/** Whole awake day: used only to suppress invented sleep conflicts, never shown. */
const FALLBACK_WAKE_UP = "00:00";
const FALLBACK_SLEEP = "23:59";

const BLOCK_TYPE_FALLBACK_TITLE: Record<BlockType, string> = {
  task: "Task block",
  break: "Break",
  personal: "Personal time",
};
/** One block as the day view draws it: local labels, clipped to the day. */
export interface PlannerDayBlock {
  id: string;
  blockType: BlockType;
  /** Linked task title, block title as fallback (Д4). */
  title: string;
  taskId: string | null;
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  /** Minutes of this day covered by the block (clipped at midnight). */
  durationMinutes: number;
  /** True when another block covers the same time. */
  overlaps: boolean;
  /** True when the block reaches outside the waking hours. */
  crossesSleep: boolean;
}

/** Interval inside the selected day, in minutes from its local midnight. */
export interface PlannerDayInterval {
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  startLabel: string;
  endLabel: string;
}

export interface PlannerDayScale {
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
}

export interface PlannerDayTotals {
  task: number;
  break: number;
  personal: number;
  scheduled: number;
  free: number;
}

export interface PlannerDay {
  dateKey: string;
  timeZone: string;
  blocks: PlannerDayBlock[];
  /** Merged occupied intervals, clipped to the day. */
  busy: PlannerDayInterval[];
  /** Planning windows left (Д1); empty when waking hours are unknown. */
  free: PlannerDayInterval[];
  conflicts: BlockConflict[];
  totals: PlannerDayTotals;
  overlappingBlocks: number;
  sleepBlocks: number;
  hasConflicts: boolean;
  hasWakingHours: boolean;
  scale: PlannerDayScale;
  isEmpty: boolean;
}

export interface BuildPlannerDayInput {
  blocks: readonly TimeBlock[];
  dateKey: string;
  timeZone: string;
  now: Date;
  /** Null when the user has no preferences row: free time stays unknown. */
  wakeUpTime: string | null;
  sleepTime: string | null;
  workingHours?: WeeklyAvailability;
  studyHours?: WeeklyAvailability;
  taskTitleById?: ReadonlyMap<string, string>;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "HH:MM" from minutes after local midnight; 1440 renders as "24:00". */
export function minutesToLabel(minutes: number): string {
  const clamped = Math.max(0, Math.min(Math.round(minutes), MINUTES_PER_DAY));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/** "45 min", "1 h", "1 h 30 min" — a duration never appears as a bare number. */
export function formatDurationMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (hours === 0) {
    return `${rest} min`;
  }

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
export function isValidDateKey(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  const match = DATE_KEY_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Calendar-day arithmetic on a date key; throws on a malformed key. */
export function shiftDateKey(dateKey: string, days: number): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const match = DATE_KEY_PATTERN.exec(dateKey) as RegExpExecArray;
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + days * MS_PER_DAY,
  );

  return shifted.toISOString().slice(0, 10);
}

/** `[local midnight, next local midnight)` of one day in `timeZone`, as ISO. */
export function plannerDayBounds(
  dateKey: string,
  timeZone: string,
): { start: string; end: string } {
  return {
    start: localDateTimeToIso(`${dateKey}T00:00`, timeZone),
    end: localDateTimeToIso(`${shiftDateKey(dateKey, 1)}T00:00`, timeZone),
  };
}

/**
 * Reads the `working_hours` / `study_hours` jsonb as `WeeklyAvailability`.
 * Unknown days, non-array values and malformed `HH:MM` entries are dropped
 * instead of reaching the planning math; `{}` means "not set".
 */
export function parseWeeklyAvailability(value: unknown): WeeklyAvailability {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const availability: WeeklyAvailability = {};

  for (const day of DAY_KEYS) {
    const raw = source[day];

    if (!Array.isArray(raw)) {
      continue;
    }

    const intervals: DayInterval[] = [];

    for (const item of raw) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const { start, end } = item as { start?: unknown; end?: unknown };

      if (typeof start !== "string" || typeof end !== "string") {
        continue;
      }

      if (!WALL_TIME_PATTERN.test(start) || !WALL_TIME_PATTERN.test(end)) {
        continue;
      }

      intervals.push({ start, end });
    }

    if (intervals.length > 0) {
      availability[day] = intervals;
    }
  }

  return availability;
}

/** A stored `HH:MM` preference, or null when it is missing or malformed. */
export function readWallTime(value: unknown): string | null {
  return typeof value === "string" && WALL_TIME_PATTERN.test(value) ? value : null;
}
function wallTimeToMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function resolveBlockTitle(
  block: TimeBlock,
  taskTitleById: ReadonlyMap<string, string> | undefined,
): string {
  if (block.taskId) {
    const taskTitle = taskTitleById?.get(block.taskId)?.trim();

    if (taskTitle) {
      return taskTitle;
    }
  }

  const ownTitle = block.title.trim();
  return ownTitle.length > 0 ? ownTitle : BLOCK_TYPE_FALLBACK_TITLE[block.blockType];
}

interface MinuteRange {
  start: number;
  end: number;
}

function mergeMinuteRanges(ranges: readonly MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MinuteRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

function toInterval(range: MinuteRange): PlannerDayInterval {
  const start = Math.max(0, Math.min(Math.round(range.start), MINUTES_PER_DAY));
  const end = Math.max(start, Math.min(Math.round(range.end), MINUTES_PER_DAY));

  return {
    startMinutes: start,
    endMinutes: end,
    durationMinutes: end - start,
    startLabel: minutesToLabel(start),
    endLabel: minutesToLabel(end),
  };
}

function sumDuration(intervals: readonly PlannerDayInterval[]): number {
  return intervals.reduce((total, interval) => total + interval.durationMinutes, 0);
}

function buildScale(
  wakeUpTime: string,
  sleepTime: string,
  hasWakingHours: boolean,
): PlannerDayScale {
  if (!hasWakingHours) {
    return {
      startMinutes: 0,
      endMinutes: MINUTES_PER_DAY,
      startLabel: minutesToLabel(0),
      endLabel: minutesToLabel(MINUTES_PER_DAY),
    };
  }

  const startMinutes = wallTimeToMinutes(wakeUpTime);
  const sleepMinutes = wallTimeToMinutes(sleepTime);
  // Sleep at or before wake-up crosses midnight: the scale runs to the day edge.
  const endMinutes = sleepMinutes <= startMinutes ? MINUTES_PER_DAY : sleepMinutes;

  return {
    startMinutes,
    endMinutes,
    startLabel: minutesToLabel(startMinutes),
    endLabel: minutesToLabel(endMinutes),
  };
}

export function buildPlannerDay(input: BuildPlannerDayInput): PlannerDay {
  const { dateKey, timeZone } = input;
  const bounds = plannerDayBounds(dateKey, timeZone);
  const dayStartMs = Date.parse(bounds.start);
  const dayEndMs = Date.parse(bounds.end);

  const hasWakingHours =
    input.wakeUpTime !== null && input.sleepTime !== null && input.wakeUpTime !== input.sleepTime;
  const wakeUpTime = input.wakeUpTime ?? FALLBACK_WAKE_UP;
  const sleepTime = input.sleepTime ?? FALLBACK_SLEEP;
  const workingHours = input.workingHours ?? {};
  const studyHours = input.studyHours ?? {};

  const dayBlocks = input.blocks.filter((block) => {
    const start = Date.parse(block.startTime);
    const end = Date.parse(block.endTime);

    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      end > dayStartMs &&
      start < dayEndMs
    );
  });

  const conflicts = findConflicts(dayBlocks, {
    now: input.now,
    timeZone,
    wakeUpTime,
    sleepTime,
    workingHours,
    studyHours,
  }).filter((conflict) => hasWakingHours || conflict.kind === "overlap");

  const overlapIds = new Set<string>();
  const sleepIds = new Set<string>();

  for (const conflict of conflicts) {
    if (conflict.kind === "overlap") {
      overlapIds.add(conflict.blockId);

      if (conflict.otherId) {
        overlapIds.add(conflict.otherId);
      }
    }

    if (conflict.kind === "sleep") {
      sleepIds.add(conflict.blockId);
    }
  }

  const blocks: PlannerDayBlock[] = dayBlocks
    .map((block) => {
      const startMs = Math.max(Date.parse(block.startTime), dayStartMs);
      const endMs = Math.min(Date.parse(block.endTime), dayEndMs);
      const startMinutes = Math.round((startMs - dayStartMs) / MS_PER_MINUTE);
      const endMinutes = Math.round((endMs - dayStartMs) / MS_PER_MINUTE);

      return {
        id: block.id,
        blockType: block.blockType,
        title: resolveBlockTitle(block, input.taskTitleById),
        taskId: block.taskId,
        start: block.startTime,
        end: block.endTime,
        startLabel: minutesToLabel(startMinutes),
        endLabel: minutesToLabel(endMinutes),
        durationMinutes: endMinutes - startMinutes,
        overlaps: overlapIds.has(block.id),
        crossesSleep: sleepIds.has(block.id),
      };
    })
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start < b.start ? -1 : 1;
      }

      if (a.end !== b.end) {
        return a.end < b.end ? -1 : 1;
      }

      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const busy = mergeMinuteRanges(
    blocks.map((block) => ({
      start: (Date.parse(block.start) - dayStartMs) / MS_PER_MINUTE,
      end: (Date.parse(block.end) - dayStartMs) / MS_PER_MINUTE,
    })),
  ).map(toInterval);

  const free = hasWakingHours
    ? computeFreeWindows({
        dateKey,
        timeZone,
        wakeUpTime,
        sleepTime,
        workingHours,
        studyHours,
        blocks: dayBlocks,
      })
        .map((window) =>
          toInterval({
            start: (Date.parse(window.start) - dayStartMs) / MS_PER_MINUTE,
            end: (Date.parse(window.end) - dayStartMs) / MS_PER_MINUTE,
          }),
        )
        .filter((interval) => interval.durationMinutes > 0)
    : [];

  const totals: PlannerDayTotals = {
    task: 0,
    break: 0,
    personal: 0,
    scheduled: 0,
    free: sumDuration(free),
  };

  for (const block of blocks) {
    totals[block.blockType] += block.durationMinutes;
  }

  totals.scheduled = totals.task + totals.break + totals.personal;

  const overlappingBlocks = blocks.filter((block) => block.overlaps).length;
  const sleepBlocks = blocks.filter((block) => block.crossesSleep).length;

  return {
    dateKey,
    timeZone,
    blocks,
    busy,
    free,
    conflicts,
    totals,
    overlappingBlocks,
    sleepBlocks,
    hasConflicts: overlappingBlocks > 0 || sleepBlocks > 0,
    hasWakingHours,
    scale: buildScale(wakeUpTime, sleepTime, hasWakingHours),
    isEmpty: blocks.length === 0,
  };
}

export interface PlannerDayOptions {
  dateKey: string;
  now?: Date;
}

export interface PlannerDayViewModel {
  day: PlannerDay;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

/**
 * Reads one day of blocks plus the profile time zone and the day preferences.
 * Requests never fan out: one blocks query per day range, one shared tasks
 * list for the linked titles (skipped when no block links a task), one
 * cached profile and one cached preferences read.
 */
export function usePlannerDay({
  dateKey,
  now = new Date(),
}: PlannerDayOptions): PlannerDayViewModel {
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const nowMs = now.getTime();

  const bounds = useMemo(() => plannerDayBounds(dateKey, timeZone), [dateKey, timeZone]);

  const blocksQuery = useBlocks({ from: bounds.start, to: bounds.end });

  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    staleTime: 60_000,
  });
  const preferences = preferencesQuery.data;

  const blockList = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);

  const taskIds = useMemo(() => {
    const ids = new Set<string>();

    for (const block of blockList) {
      if (block.taskId) {
        ids.add(block.taskId);
      }
    }

    return [...ids].sort();
  }, [blockList]);

  const tasksQuery = useQuery({
    queryKey: tasks.list(),
    queryFn: () => listTasks(),
    enabled: taskIds.length > 0,
    staleTime: 60_000,
  });

  const taskTitleById = useMemo(() => {
    const titles = new Map<string, string>();

    for (const task of tasksQuery.data ?? []) {
      titles.set(task.id, task.title);
    }

    return titles;
  }, [tasksQuery.data]);

  const wakeUpTime = readWallTime(preferences?.wakeUpTime);
  const sleepTime = readWallTime(preferences?.sleepTime);
  const workingHours = useMemo(
    () => parseWeeklyAvailability(preferences?.workingHours),
    [preferences],
  );
  const studyHours = useMemo(() => parseWeeklyAvailability(preferences?.studyHours), [preferences]);

  const day = useMemo(
    () =>
      buildPlannerDay({
        blocks: blockList,
        dateKey,
        timeZone,
        now: new Date(nowMs),
        wakeUpTime,
        sleepTime,
        workingHours,
        studyHours,
        taskTitleById,
      }),
    [
      blockList,
      dateKey,
      timeZone,
      nowMs,
      wakeUpTime,
      sleepTime,
      workingHours,
      studyHours,
      taskTitleById,
    ],
  );

  return {
    day,
    timeZone,
    // Every label depends on the time zone, so the day is not drawn before it is known.
    isLoading: profileQuery.isLoading || blocksQuery.isLoading,
    isError: blocksQuery.isError,
    retry: () => {
      void blocksQuery.refetch();
    },
  };
}
