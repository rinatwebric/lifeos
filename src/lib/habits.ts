import type { Habit, HabitLog, HabitScheduleVersion } from "@/types/domain";

/**
 * Pure habit calculations over the schedule history (Phase 5 step 2,
 * semantics in docs/plan-phase-5.md §3).
 *
 * Every date is judged by the schedule version that was effective THEN
 * (`habit_schedule_versions`), never by the current row: pauses and
 * unscheduled days are skipped (they are not failures), an unfinished
 * today / current week is not a miss yet, periods with no obligations
 * report `completionRate: null` (empty state, not 0%), and real zeros
 * stay zeros. Overfulfilment (`completed > target`) is preserved in the
 * day status; the rate itself is capped at 100%.
 *
 * Units: one obligation is a DAY for `daily`/`weekdays` versions and a
 * whole ISO WEEK (Monday–Sunday) for `weekly` versions. A habit that
 * changed frequency mid-life mixes both unit kinds chronologically —
 * the streak counts consecutive met obligations, whatever their kind.
 *
 * Purity: no `Date.now()` inside. The caller passes `todayKey`
 * (already derived in the profile timezone via `toDateKey`); weekday
 * math runs on the calendar key itself, so it is timezone-independent.
 */

export interface HabitStatsInput {
  habit: Habit;
  versions: HabitScheduleVersion[];
  logs: HabitLog[];
  /** Calendar date (YYYY-MM-DD) in the user's timezone. Future dates are ignored. */
  todayKey: string;
}

export interface HabitStats {
  planned: number;
  completed: number;
  missed: number;
  /** Null when nothing was planned (empty state, not a failure). */
  completionRate: number | null;
  currentStreak: number;
  bestStreak: number;
}

export interface HabitDayStatus {
  date: string;
  scheduled: boolean;
  done: boolean;
  completed: number;
  target: number;
  paused: boolean;
  versionFound: boolean;
}

export interface HabitObligationUnit {
  key: string;
  from: string;
  to: string;
  kind: "day" | "week";
  done: boolean;
  completed: number;
  target: number;
}

function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function keyToMs(key: string): number {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d, 12);
}

function msToKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(key: string, n: number): string {
  return msToKey(keyToMs(key) + n * 86_400_000);
}

/** 0 = Sunday .. 6 = Saturday, from the calendar key itself (no timezone involved). */
function weekdayOf(key: string): number {
  return new Date(keyToMs(key)).getUTCDay();
}

/** Monday (ISO) of the week containing `key`. */
function weekMondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/**
 * The version covering `dateKey`, or null for the unknown past
 * (no version = no obligations, never a fake miss).
 */
export function getVersionForDate(
  versions: HabitScheduleVersion[],
  dateKey: string,
): HabitScheduleVersion | null {
  let best: HabitScheduleVersion | null = null;

  for (const v of versions) {
    if (v.effectiveFrom <= dateKey && (v.effectiveTo === null || dateKey <= v.effectiveTo)) {
      if (best === null || v.effectiveFrom > best.effectiveFrom) {
        best = v;
      }
    }
  }

  return best;
}

function effectiveVersions(
  habit: Habit,
  versions: HabitScheduleVersion[],
): HabitScheduleVersion[] {
  if (versions.length > 0) {
    return versions;
  }

  // Fallback for callers without history (the service always loads
  // versions): the current row stands in from its start date.
  return [
    {
      id: `fallback-${habit.id}`,
      userId: habit.userId,
      habitId: habit.id,
      effectiveFrom: habit.startDate,
      effectiveTo: null,
      frequency: habit.frequency,
      weekdays: habit.weekdays,
      targetCount: habit.targetCount,
      startDate: habit.startDate,
      status: habit.status,
      createdAt: habit.createdAt,
      updatedAt: habit.updatedAt,
    },
  ];
}

function logsByDate(logs: HabitLog[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const entry of logs) {
    map.set(entry.logDate, (map.get(entry.logDate) ?? 0) + entry.completedCount);
  }

  return map;
}

function isDayScheduled(version: HabitScheduleVersion, dateKey: string): boolean {
  if (version.status !== "active" || dateKey < version.startDate) {
    return false;
  }

  if (version.frequency === "daily") {
    return true;
  }

  if (version.frequency === "weekdays") {
    return version.weekdays.includes(weekdayOf(dateKey));
  }

  // Weekly versions have no per-day obligation, but every active day
  // belongs to its week — the week unit decides done/missed.
  return true;
}

export function getHabitDayStatus(
  habit: Habit,
  versions: HabitScheduleVersion[],
  logs: HabitLog[],
  dateKey: string,
): HabitDayStatus {
  const list = effectiveVersions(habit, versions);
  const found = getVersionForDate(list, dateKey);
  const completed = logsByDate(logs).get(dateKey) ?? 0;

  if (found === null) {
    return {
      date: dateKey,
      scheduled: false,
      done: false,
      completed,
      target: habit.targetCount,
      paused: false,
      versionFound: false,
    };
  }

  const scheduled = isDayScheduled(found, dateKey);

  if (!scheduled) {
    return {
      date: dateKey,
      scheduled: false,
      done: false,
      completed,
      target: found.targetCount,
      paused: found.status === "paused",
      versionFound: true,
    };
  }

  if (found.frequency === "weekly") {
    // A weekly day inherits its week's outcome — but only from days up to
    // and including the status date itself. Summing past the date would
    // judge the day with hindsight (e.g. a future-dated log inflating a
    // past day), disagreeing with buildHabitUnits, which never looks past
    // today.
    const monday = weekMondayOf(dateKey);
    const counts = logsByDate(logs);
    let sum = 0;

    for (let i = 0; i < 7; i += 1) {
      const day = addDays(monday, i);

      if (day > dateKey) {
        break;
      }

      const dayVersion = getVersionForDate(list, day);

      if (dayVersion !== null && isDayScheduled(dayVersion, day)) {
        sum += counts.get(day) ?? 0;
      }
    }

    return {
      date: dateKey,
      scheduled: true,
      done: sum >= found.targetCount,
      completed,
      target: found.targetCount,
      paused: false,
      versionFound: true,
    };
  }

  return {
    date: dateKey,
    scheduled: true,
    done: completed >= found.targetCount,
    completed,
    target: found.targetCount,
    paused: false,
    versionFound: true,
  };
}

/**
 * Obligation units in chronological order, closed periods only plus
 * done current ones: a pending today / current week produces no unit
 * (not a miss yet). Unknown past, pauses, unscheduled days and future
 * dates produce no units either.
 */
export function buildHabitUnits(input: HabitStatsInput): HabitObligationUnit[] {
  const { habit, todayKey } = input;
  const list = effectiveVersions(habit, input.versions);
  const counts = logsByDate(input.logs);
  const units: HabitObligationUnit[] = [];

  let cursor = list.reduce(
    (min, v) => (v.effectiveFrom < min ? v.effectiveFrom : min),
    list[0].effectiveFrom,
  );

  let openWeek: { monday: string; sum: number; target: number; activeDays: number } | null = null;

  const flushWeek = (monday: string, endKey: string): void => {
    if (openWeek === null || openWeek.monday !== monday) {
      return;
    }

    const { sum, target, activeDays } = openWeek;
    openWeek = null;

    if (activeDays === 0) {
      return;
    }

    const isCurrentWeek = weekMondayOf(todayKey) === monday;

    if (isCurrentWeek && sum < target) {
      return;
    }

    units.push({
      key: `week:${monday}`,
      from: monday,
      to: endKey,
      kind: "week",
      done: sum >= target,
      completed: sum,
      target,
    });
  };

  while (cursor <= todayKey) {
    const version = getVersionForDate(list, cursor);

    if (version === null) {
      cursor = addDays(cursor, 1);
      continue;
    }

    if (version.frequency === "weekly") {
      const monday = weekMondayOf(cursor);

      if (openWeek === null || openWeek.monday !== monday) {
        if (openWeek !== null) {
          flushWeek(openWeek.monday, addDays(openWeek.monday, 6));
        }

        openWeek = { monday, sum: 0, target: version.targetCount, activeDays: 0 };
      }

      if (version.status === "active" && cursor >= version.startDate) {
        openWeek.activeDays += 1;
        openWeek.sum += counts.get(cursor) ?? 0;
        // The week's target follows its latest day (a mid-week target
        // change governs the whole week containing the change).
        openWeek.target = version.targetCount;
      }

      if (cursor === todayKey || weekMondayOf(addDays(cursor, 1)) !== monday) {
        flushWeek(monday, cursor);
      }

      cursor = addDays(cursor, 1);
      continue;
    }

    if (openWeek !== null) {
      // The weekly unit ends where the schedule changes: the unit's `to`
      // is the day before the switch, not the calendar Sunday.
      flushWeek(openWeek.monday, addDays(cursor, -1));
    }

    const scheduled = isDayScheduled(version, cursor);

    if (!scheduled) {
      cursor = addDays(cursor, 1);
      continue;
    }

    const completed = counts.get(cursor) ?? 0;
    const isToday = cursor === todayKey;

    if (isToday && completed < version.targetCount) {
      cursor = addDays(cursor, 1);
      continue;
    }

    units.push({
      key: `day:${cursor}`,
      from: cursor,
      to: cursor,
      kind: "day",
      done: completed >= version.targetCount,
      completed,
      target: version.targetCount,
    });

    cursor = addDays(cursor, 1);
  }

  if (openWeek !== null) {
    flushWeek(openWeek.monday, todayKey < addDays(openWeek.monday, 6) ? todayKey : addDays(openWeek.monday, 6));
  }

  return units;
}

export function calculateHabitStats(input: HabitStatsInput): HabitStats {
  const units = buildHabitUnits(input);
  const planned = units.length;
  const completed = units.filter((u) => u.done).length;
  const missed = planned - completed;

  let currentStreak = 0;
  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (!units[i].done) {
      break;
    }

    currentStreak += 1;
  }

  let bestStreak = 0;
  let run = 0;
  for (const unit of units) {
    run = unit.done ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  return {
    planned,
    completed,
    missed,
    completionRate: planned === 0 ? null : Math.min(100, Math.round((completed / planned) * 100)),
    currentStreak,
    bestStreak,
  };
}
