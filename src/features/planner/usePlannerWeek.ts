import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  getPreferences,
  getProfile,
  preferencesQueryKey,
  profileQueryKey,
} from "@/features/settings/api";
import { localDateTimeToIso, toDateKey } from "@/lib/dates";
import type { WeeklyAvailability } from "@/lib/planner";
import type { TimeBlock, Weekday } from "@/types/domain";

import { useBlocks } from "./hooks";
import {
  buildPlannerDay,
  isValidDateKey,
  parseWeeklyAvailability,
  readWallTime,
  shiftDateKey,
  type PlannerDay,
} from "./usePlannerDay";

/**
 * Week view model (iteration 4, unit 6). The pure part — `buildPlannerWeek` —
 * turns one week of blocks into the seven-day grid the screen renders: per
 * day the block count, the minutes per block type, the conflict flag and the
 * empty flag, plus the week totals. One blocks request covers the whole
 * range; the seven days are grouped on the client.
 *
 * Decisions baked in here:
 * - The week starts on Monday, whatever the user's locale. Weeks are calendar
 *   arithmetic on date keys, so a week never shifts when the browser zone
 *   differs from the profile zone.
 * - Day math is never re-implemented: every day is a `buildPlannerDay` result,
 *   so the week and the day view can not disagree about a total or a conflict.
 * - Д2: a day is marked when a block shares time or reaches outside the waking
 *   hours. A block that merely ended in the past is not a conflict here —
 *   every past day would light up and the flag would stop meaning anything
 *   (the day view keeps `past` in its own conflict list).
 * - No task titles: the grid shows counts and minutes, so the week view never
 *   needs the tasks list and never issues a second request.
 */

export const WEEK_LENGTH = 7;

const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface PlannerWeekDayTotals {
  task: number;
  break: number;
  personal: number;
  scheduled: number;
}

export interface PlannerWeekDay {
  dateKey: string;
  weekday: Weekday;
  /** "Mon" — the column heading. */
  weekdayShort: string;
  /** "Monday" — the accessible name of the day link. */
  weekdayLong: string;
  /** "Nov 2". */
  dateLabel: string;
  blockCount: number;
  totals: PlannerWeekDayTotals;
  /** Blocks sharing time or reaching outside the waking hours. */
  conflictBlocks: number;
  hasConflict: boolean;
  isEmpty: boolean;
  isToday: boolean;
  /** The full day model, already computed for this date. */
  day: PlannerDay;
}

export interface PlannerWeek {
  startDateKey: string;
  endDateKey: string;
  /** "November 2 – 8, 2026" — the page title in week mode. */
  label: string;
  timeZone: string;
  days: PlannerWeekDay[];
  totals: PlannerWeekDayTotals;
  blockCount: number;
  /** Days with at least one conflict. */
  conflictDays: number;
  /** Days holding at least one block. */
  plannedDays: number;
  isEmpty: boolean;
}

export interface BuildPlannerWeekInput {
  blocks: readonly TimeBlock[];
  /** Any date inside the wanted week. */
  dateKey: string;
  timeZone: string;
  now: Date;
  /** Null when the user has no preferences row: no sleep conflicts, no free time. */
  wakeUpTime: string | null;
  sleepTime: string | null;
  workingHours?: WeeklyAvailability;
  studyHours?: WeeklyAvailability;
}

/** "3 blocks" / "1 block" — a count never appears as a bare number. */
export function formatBlockCount(count: number): string {
  return `${count} ${count === 1 ? "block" : "blocks"}`;
}

function formatPart(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
}

/** Noon probe: the calendar date rendered in `timeZone`, never shifted by DST. */
function noonProbe(dateKey: string, timeZone: string): Date {
  return new Date(localDateTimeToIso(`${dateKey}T12:00`, timeZone));
}

/**
 * Calendar weekday of a date key. The key already carries the user's zone, so
 * the weekday is plain UTC arithmetic — no zone conversion, no DST trap.
 */
function calendarWeekday(dateKey: string): Weekday {
  const [year, month, day] = dateKey.split("-").map(Number);
  const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return WEEKDAYS[(sundayBased + 6) % 7];
}

/** Monday of the week containing `dateKey`. Throws on a malformed key. */
export function startOfWeekKey(dateKey: string): string {
  if (!isValidDateKey(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const mondayOffset = WEEKDAYS.indexOf(calendarWeekday(dateKey));

  return shiftDateKey(dateKey, -mondayOffset);
}

/** `[Monday 00:00, next Monday 00:00)` in `timeZone`, as ISO instants. */
export function plannerWeekBounds(
  dateKey: string,
  timeZone: string,
): { start: string; end: string } {
  const startDateKey = startOfWeekKey(dateKey);

  return {
    start: localDateTimeToIso(`${startDateKey}T00:00`, timeZone),
    end: localDateTimeToIso(`${shiftDateKey(startDateKey, WEEK_LENGTH)}T00:00`, timeZone),
  };
}

/**
 * "November 2 – 8, 2026". The month and the year repeat only when the week
 * crosses their boundary, so the label stays short without losing meaning.
 * An en dash marks the range.
 */
export function plannerWeekLabel(dateKey: string, timeZone: string): string {
  const startDateKey = startOfWeekKey(dateKey);
  const endDateKey = shiftDateKey(startDateKey, WEEK_LENGTH - 1);
  const start = noonProbe(startDateKey, timeZone);
  const end = noonProbe(endDateKey, timeZone);

  const startDay = formatPart(start, timeZone, { day: "numeric" });
  const endDay = formatPart(end, timeZone, { day: "numeric" });
  const startMonth = formatPart(start, timeZone, { month: "long" });
  const endMonth = formatPart(end, timeZone, { month: "long" });
  const startYear = formatPart(start, timeZone, { year: "numeric" });
  const endYear = formatPart(end, timeZone, { year: "numeric" });

  if (startYear !== endYear) {
    return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
  }

  if (startMonth !== endMonth) {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`;
  }

  return `${startMonth} ${startDay} – ${endDay}, ${startYear}`;
}

export function buildPlannerWeek(input: BuildPlannerWeekInput): PlannerWeek {
  const { timeZone } = input;
  const startDateKey = startOfWeekKey(input.dateKey);
  const endDateKey = shiftDateKey(startDateKey, WEEK_LENGTH - 1);
  const todayKey = toDateKey(input.now, timeZone);

  const totals: PlannerWeekDayTotals = { task: 0, break: 0, personal: 0, scheduled: 0 };
  const days: PlannerWeekDay[] = [];
  let blockCount = 0;
  let conflictDays = 0;
  let plannedDays = 0;

  for (let index = 0; index < WEEK_LENGTH; index += 1) {
    const dateKey = shiftDateKey(startDateKey, index);
    // `buildPlannerDay` owns the clipping, the totals and the conflict rule,
    // so the week can not drift away from what the day view shows.
    const day = buildPlannerDay({
      blocks: input.blocks,
      dateKey,
      timeZone,
      now: input.now,
      wakeUpTime: input.wakeUpTime,
      sleepTime: input.sleepTime,
      workingHours: input.workingHours,
      studyHours: input.studyHours,
    });

    const conflictBlocks = day.blocks.filter(
      (block) => block.overlaps || block.crossesSleep,
    ).length;

    totals.task += day.totals.task;
    totals.break += day.totals.break;
    totals.personal += day.totals.personal;
    blockCount += day.blocks.length;

    if (conflictBlocks > 0) {
      conflictDays += 1;
    }

    if (!day.isEmpty) {
      plannedDays += 1;
    }

    days.push({
      dateKey,
      weekday: calendarWeekday(dateKey),
      weekdayShort: formatPart(noonProbe(dateKey, timeZone), timeZone, { weekday: "short" }),
      weekdayLong: formatPart(noonProbe(dateKey, timeZone), timeZone, { weekday: "long" }),
      dateLabel: formatPart(noonProbe(dateKey, timeZone), timeZone, {
        month: "short",
        day: "numeric",
      }),
      blockCount: day.blocks.length,
      totals: {
        task: day.totals.task,
        break: day.totals.break,
        personal: day.totals.personal,
        scheduled: day.totals.scheduled,
      },
      conflictBlocks,
      hasConflict: conflictBlocks > 0,
      isEmpty: day.isEmpty,
      isToday: dateKey === todayKey,
      day,
    });
  }

  totals.scheduled = totals.task + totals.break + totals.personal;

  return {
    startDateKey,
    endDateKey,
    label: plannerWeekLabel(input.dateKey, timeZone),
    timeZone,
    days,
    totals,
    blockCount,
    conflictDays,
    plannedDays,
    isEmpty: blockCount === 0,
  };
}

export interface PlannerWeekOptions {
  /** Any date inside the wanted week; the page keeps it in the URL. */
  dateKey: string;
  now?: Date;
}

export interface PlannerWeekViewModel {
  week: PlannerWeek;
  timeZone: string;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

/**
 * Reads one week of blocks plus the profile time zone and the day
 * preferences. Exactly one blocks query covers the seven days, on the same
 * range key the day view uses — so opening a day from the week reuses what is
 * already cached instead of fetching again.
 */
export function usePlannerWeek({
  dateKey,
  now = new Date(),
}: PlannerWeekOptions): PlannerWeekViewModel {
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const nowMs = now.getTime();

  const bounds = useMemo(() => plannerWeekBounds(dateKey, timeZone), [dateKey, timeZone]);

  const blocksQuery = useBlocks({ from: bounds.start, to: bounds.end });

  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: getPreferences,
    staleTime: 60_000,
  });
  const preferences = preferencesQuery.data;

  const blockList = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);

  const wakeUpTime = readWallTime(preferences?.wakeUpTime);
  const sleepTime = readWallTime(preferences?.sleepTime);
  const workingHours = useMemo(
    () => parseWeeklyAvailability(preferences?.workingHours),
    [preferences],
  );
  const studyHours = useMemo(() => parseWeeklyAvailability(preferences?.studyHours), [preferences]);

  const week = useMemo(
    () =>
      buildPlannerWeek({
        blocks: blockList,
        dateKey,
        timeZone,
        now: new Date(nowMs),
        wakeUpTime,
        sleepTime,
        workingHours,
        studyHours,
      }),
    [blockList, dateKey, timeZone, nowMs, wakeUpTime, sleepTime, workingHours, studyHours],
  );

  return {
    week,
    timeZone,
    // Every label depends on the time zone, so the grid waits for it.
    isLoading: profileQuery.isLoading || blocksQuery.isLoading,
    isError: blocksQuery.isError,
    retry: () => {
      void blocksQuery.refetch();
    },
  };
}
