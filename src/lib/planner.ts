import { isoToLocalDateTime, isTaskOverdue, localDateTimeToIso, toDateKey, toWallTime } from "@/lib/dates";
import type {
  AvailabilityWindow,
  AvailabilityWindows,
  Priority,
  Task,
  Weekday,
} from "@/types/domain";

/**
 * Pure planning library (iteration 4, unit 2). No React, no Supabase client,
 * no database access. All math operates on ISO instants and wall-clock
 * strings; the caller's time zone is always an explicit parameter and every
 * conversion goes through `localDateTimeToIso` / `Intl`, never through
 * hardcoded offsets. `now` is always passed in — no `new Date()` inside.
 *
 * Decisions from docs/plan.md baked in here:
 * - Д1: free time and rest are derived, never stored; no new columns. Free
 *   windows exclude working and study hours (Д1); a MANUAL block over them
 *   is allowed with a warning (Д2).
 * - Д2: a manual block over working/study hours is a soft `work` warning
 *   plus a score penalty, never a hard conflict or a refusal. Hard conflicts are overlap, sleep-intersection and past.
 * - Д3: no splitting — one task fills one window slot, the remainder goes to
 *   `doesNotFit` with a reason.
 * - Д6: overdue tasks are boosted candidates, never hidden.
 * - Д7: tasks without `estimatedDurationMinutes` go to `needsEstimate`;
 *   no default duration is invented.
 */

export type DayKey = Weekday;

/** Wall-clock interval within one day, "HH:MM" (24-hour). */
export type DayInterval = AvailabilityWindow;

/**
 * Shape of the `working_hours` / `study_hours` preference objects:
 * weekday key to that day's intervals. `{}` (or a missing day) means
 * "not set". Intervals shrink auto-planning windows (Д1) but never cause
 * a hard conflict for a MANUAL block (Д2) — they feed the soft `work`
 * warning and the score penalty instead.
 */
export type WeeklyAvailability = AvailabilityWindows;

/** Absolute interval between two UTC ISO instants. */
export interface TimeRange {
  start: string;
  end: string;
}

export interface BlockConflict {
  blockId: string;
  kind: "overlap" | "sleep" | "past" | "work";
  otherId?: string;
  /** ISO instant where the conflict was detected (overlap start, block end…). */
  at?: string;
}

/** Minimal block shape the planner needs; `TimeBlock` satisfies it. */
export interface PlanBlock {
  id: string;
  startTime: string;
  endTime: string;
  /**
   * Set for `task` blocks (Д4: `block_type = 'task'` ⇔ `task_id NOT NULL`).
   * `planDay` uses it to recognise tasks that already own a block on the
   * planned day (B1) — free-window math ignores it, every block still cuts.
   */
  taskId?: string | null;
}

export interface ComputeFreeWindowsInput {
  dateKey: string;
  timeZone: string;
  wakeUpTime: string;
  sleepTime: string;
  workingHours: WeeklyAvailability;
  studyHours: WeeklyAvailability;
  blocks: readonly PlanBlock[];
}

export interface FindConflictsInput {
  now: Date;
  timeZone: string;
  wakeUpTime: string;
  sleepTime: string;
  workingHours: WeeklyAvailability;
  studyHours: WeeklyAvailability;
}

export interface ScoreContext {
  now: Date;
  timeZone: string;
  preferredPeriods?: WeeklyAvailability;
  workingHours?: WeeklyAvailability;
  studyHours?: WeeklyAvailability;
}

export interface Candidate {
  task: Task;
  score: number;
  overdue: boolean;
}

export interface SelectCandidatesInput {
  tasks: readonly Task[];
  now: Date;
  timeZone: string;
}

export interface SelectCandidatesResult {
  candidates: Candidate[];
  needsEstimate: Task[];
  excluded: Task[];
}

export interface PlannedSlot {
  taskId: string;
  start: string;
  end: string;
  score: number;
  reason: string;
}

export interface DoesNotFit {
  taskId: string;
  reason: "no-window" | "too-long";
}

/**
 * A task that already owns a `task` block overlapping the planned day: it
 * is reported, never re-planned (B1). `start`/`end` are the stored ISO
 * instants of the earliest overlapping block — the ones the preview shows
 * in the user's zone.
 */
export interface AlreadyPlanned {
  taskId: string;
  blockId: string;
  start: string;
  end: string;
}

export interface PlanDayInput {
  dateKey: string;
  timeZone: string;
  now: Date;
  wakeUpTime: string;
  sleepTime: string;
  workingHours: WeeklyAvailability;
  studyHours: WeeklyAvailability;
  blocks: readonly PlanBlock[];
  tasks: readonly Task[];
}

export interface PlanDayResult {
  slots: PlannedSlot[];
  doesNotFit: DoesNotFit[];
  needsEstimate: Task[];
  alreadyPlanned: AlreadyPlanned[];
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * Priority weights for the default ordering (critical first). Hand-written
 * map, mirroring the semantics of `PRIORITY_RANK` in
 * `src/features/tasks/api.ts` (which cannot be imported here — layer rule
 * AGENTS.md §4). Multiplied by `PRIORITY_STEP` so that priority strictly
 * outranks every other scoring factor combined.
 */
const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const PRIORITY_STEP = 200;
const DEADLINE_PROXIMITY_DAYS = 30;
const DEADLINE_PROXIMITY_PER_DAY = 2;
const OVERDUE_BOOST = 50;
const GOAL_LINK_BOOST = 20;
const PREFERRED_PERIOD_BOOST = 10;
/** Д2: placing over working/study hours is allowed, but scores lower (soft, not a ban). */
const WORK_OVERLAP_PENALTY = 15;

interface RangeMs {
  start: number;
  end: number;
}

function parseDateKeyParts(dateKey: string): { year: number; month: number; day: number } {
  const match = DATE_KEY_PATTERN.exec(dateKey);

  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addDays(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);

  return shifted.toISOString().slice(0, 10);
}

const SHORT_WEEKDAY_TO_DAY_KEY: Record<string, DayKey> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

/** Weekday of a calendar date as seen in `timeZone` (noon probe avoids DST edges). */
function weekdayOf(dateKey: string, timeZone: string): DayKey {
  const noonIso = localDateTimeToIso(`${dateKey}T12:00`, timeZone);
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
    new Date(noonIso),
  );
  const key = SHORT_WEEKDAY_TO_DAY_KEY[short];

  if (!key) {
    throw new Error(`Cannot resolve weekday for ${dateKey} in ${timeZone}`);
  }

  return key;
}

function assertWallTime(value: string, field: string): void {
  if (toWallTime(value) === null) {
    throw new Error(`Invalid wall-clock time for ${field}: ${value}`);
  }
}

/**
 * Wake window for one calendar date as an absolute range. Sleep past midnight
 * (sleep <= wake) ends on the next calendar date. Equal wake/sleep times are
 * rejected upstream (settings schema) and yield no window here.
 */
function wakeWindowMs(
  dateKey: string,
  timeZone: string,
  wakeUpTime: string,
  sleepTime: string,
): RangeMs | null {
  assertWallTime(wakeUpTime, "wakeUpTime");
  assertWallTime(sleepTime, "sleepTime");

  const wake = toWallTime(wakeUpTime) as string;
  const sleep = toWallTime(sleepTime) as string;

  if (wake === sleep) {
    return null;
  }

  const endDateKey = sleep <= wake ? addDays(dateKey, 1) : dateKey;
  const start = Date.parse(localDateTimeToIso(`${dateKey}T${wake}`, timeZone));
  const end = Date.parse(localDateTimeToIso(`${endDateKey}T${sleep}`, timeZone));

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return { start, end };
}

/**
 * Busy intervals of one availability object for one calendar date, as
 * absolute ranges. An interval with end <= start is read as crossing midnight
 * (ends the next day). Malformed entries are skipped, never thrown on.
 */
function availabilityRangesMs(
  day: DayKey,
  dateKey: string,
  timeZone: string,
  availability: WeeklyAvailability | undefined,
): RangeMs[] {
  const intervals = availability?.[day] ?? [];
  const ranges: RangeMs[] = [];

  for (const interval of intervals) {
    const startWall = toWallTime(interval.start);
    const endWall = toWallTime(interval.end);

    if (startWall === null || endWall === null) {
      continue;
    }

    const endDateKey = endWall <= startWall ? addDays(dateKey, 1) : dateKey;
    const start = Date.parse(localDateTimeToIso(`${dateKey}T${startWall}`, timeZone));
    const end = Date.parse(localDateTimeToIso(`${endDateKey}T${endWall}`, timeZone));

    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      ranges.push({ start, end });
    }
  }

  return ranges;
}

function parseBlockRange(block: PlanBlock): RangeMs | null {
  const start = Date.parse(block.startTime);
  const end = Date.parse(block.endTime);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return { start, end };
}

function intersect(a: RangeMs, b: RangeMs): RangeMs | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);

  return end > start ? { start, end } : null;
}

function mergeRanges(ranges: RangeMs[]): RangeMs[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: RangeMs[] = [];

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

/** Subtracts every cut from the base ranges. Touching edges are kept (no zero-width output). */
function subtractRanges(base: RangeMs[], cuts: RangeMs[]): RangeMs[] {
  const orderedCuts = mergeRanges(cuts.filter((cut) => cut.end > cut.start));
  const result: RangeMs[] = [];

  for (const window of base) {
    let cursor = window.start;

    for (const cut of orderedCuts) {
      if (cut.end <= cursor || cut.start >= window.end) {
        continue;
      }

      if (cut.start > cursor) {
        result.push({ start: cursor, end: Math.min(cut.start, window.end) });
      }

      cursor = Math.max(cursor, cut.end);

      if (cursor >= window.end) {
        break;
      }
    }

    if (cursor < window.end) {
      result.push({ start: cursor, end: window.end });
    }
  }

  return result.filter((range) => range.end > range.start);
}

function toTimeRange(range: RangeMs): TimeRange {
  return { start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() };
}

/**
 * Free windows for one day: the wake window minus working/study hours of
 * the same day clipped to it, minus every busy block clipped to it.
 * Sorted, non-overlapping, zero-length windows dropped. Sleep crossing
 * midnight is handled by `wakeWindowMs` (Д1).
 *
 * Free windows exclude working and study hours (Д1); a MANUAL block over
 * them is allowed with a warning (Д2).
 */
export function computeFreeWindows(input: ComputeFreeWindowsInput): TimeRange[] {
  const wake = wakeWindowMs(input.dateKey, input.timeZone, input.wakeUpTime, input.sleepTime);

  if (!wake) {
    return [];
  }

  const cuts: RangeMs[] = [];
  const day = weekdayOf(input.dateKey, input.timeZone);

  for (const availability of [input.workingHours, input.studyHours]) {
    for (const range of availabilityRangesMs(day, input.dateKey, input.timeZone, availability)) {
      const clipped = intersect(range, wake);

      if (clipped) {
        cuts.push(clipped);
      }
    }
  }

  for (const block of input.blocks) {
    const range = parseBlockRange(block);
    const clipped = range ? intersect(range, wake) : null;

    if (clipped) {
      cuts.push(clipped);
    }
  }

  return subtractRanges([wake], cuts)
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map(toTimeRange);
}

/** Whole days between today (in `timeZone`) and a YYYY-MM-DD due date. Null without a due date. */
function daysUntilDue(dueDate: string | null, now: Date, timeZone: string): number | null {
  if (!dueDate) {
    return null;
  }

  const due = parseDateKeyParts(dueDate);
  const today = parseDateKeyParts(toDateKey(now, timeZone));

  const dueMs = Date.UTC(due.year, due.month - 1, due.day);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);

  if (!Number.isFinite(dueMs) || !Number.isFinite(todayMs)) {
    return null;
  }

  return Math.round((dueMs - todayMs) / MS_PER_DAY);
}

/**
 * True when the slot's absolute interval touches a preferred period of the
 * slot's own weekday (overnight slots also check the next day's periods).
 * Soft boost only — never a placement requirement.
 */
function matchesPreferredPeriod(slot: TimeRange, context: ScoreContext): boolean {
  const availability = context.preferredPeriods;

  if (!availability) {
    return false;
  }

  const startMs = Date.parse(slot.start);
  const endMs = Date.parse(slot.end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return false;
  }

  const slotRange: RangeMs = { start: startMs, end: endMs };
  const startKey = toDateKey(new Date(startMs), context.timeZone);
  const dates = new Set([startKey, toDateKey(new Date(endMs - 1), context.timeZone)]);

  for (const dateKey of dates) {
    const ranges = availabilityRangesMs(
      weekdayOf(dateKey, context.timeZone),
      dateKey,
      context.timeZone,
      availability,
    );

    if (ranges.some((range) => intersect(range, slotRange) !== null)) {
      return true;
    }
  }

  return false;
}

/**
 * True when the slot's absolute interval touches working/study hours on the
 * slot's own local date(s). Powers Д2's soft penalty (never a hard conflict).
 */
function overlapsWorkOrStudy(slot: TimeRange, context: ScoreContext): boolean {
  if (!context.workingHours && !context.studyHours) {
    return false;
  }

  const startMs = Date.parse(slot.start);
  const endMs = Date.parse(slot.end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return false;
  }

  const slotRange: RangeMs = { start: startMs, end: endMs };
  const dates = new Set([
    toDateKey(new Date(startMs), context.timeZone),
    toDateKey(new Date(endMs - 1), context.timeZone),
  ]);

  for (const dateKey of dates) {
    const day = weekdayOf(dateKey, context.timeZone);
    const busy = [
      ...availabilityRangesMs(day, dateKey, context.timeZone, context.workingHours),
      ...availabilityRangesMs(day, dateKey, context.timeZone, context.studyHours),
    ];

    if (busy.some((range) => intersect(range, slotRange) !== null)) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministic task score. Weight order: priority (strictly dominant) →
 * deadline proximity → overdue boost (Д6) → goal/milestone link →
 * preferred-period fit (soft, only with a slot) → work/study overlap penalty
 * (Д2, soft, only with a slot). Duration is intentionally not a scoring
 * factor: it constrains placement in `planDay` instead.
 */
export function scoreTask(task: Task, context: ScoreContext, slot?: TimeRange): number {
  let score = PRIORITY_WEIGHT[task.priority] * PRIORITY_STEP;

  const daysUntil = daysUntilDue(task.dueDate, context.now, context.timeZone);

  if (daysUntil !== null) {
    const clamped = Math.max(0, Math.min(DEADLINE_PROXIMITY_DAYS, daysUntil));
    score += (DEADLINE_PROXIMITY_DAYS - clamped) * DEADLINE_PROXIMITY_PER_DAY;
  }

  if (isTaskOverdue(task, context.now, context.timeZone)) {
    score += OVERDUE_BOOST;
  }

  if (task.goalId !== null || task.milestoneId !== null) {
    score += GOAL_LINK_BOOST;
  }

  if (slot && matchesPreferredPeriod(slot, context)) {
    score += PREFERRED_PERIOD_BOOST;
  }

  if (slot && overlapsWorkOrStudy(slot, context)) {
    score -= WORK_OVERLAP_PENALTY;
  }

  return score;
}

function localParts(iso: string, timeZone: string): { date: string; time: string } {
  const local = isoToLocalDateTime(iso, timeZone);

  return { date: local.slice(0, 10), time: local.slice(11) };
}

/**
 * Stable structured slot reason for i18n rendering (no English comparison).
 * `explainSlot` stays the English fallback; UI prefers these parts with
 * dictionary templates so RU/EN switch re-renders without reload.
 */
export interface SlotReasonParts {
  title: string;
  date: string;
  timeRange: string;
  minutes: number;
  priority: Priority;
  dueState: "overdue" | "due" | "none";
  dueDate: string | null;
  linked: boolean;
  preferred: boolean;
  workOverlap: boolean;
}

export function explainSlotParts(task: Task, slot: TimeRange, context: ScoreContext): SlotReasonParts {
  const startMs = Date.parse(slot.start);
  const endMs = Date.parse(slot.end);
  const minutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
  const startLocal = localParts(slot.start, context.timeZone);
  const endLocal = localParts(slot.end, context.timeZone);
  const timeRange =
    startLocal.date === endLocal.date
      ? `${startLocal.time}–${endLocal.time}`
      : `${startLocal.time}–${endLocal.date} ${endLocal.time}`;

  const dueState: SlotReasonParts["dueState"] =
    task.dueDate === null
      ? "none"
      : isTaskOverdue(task, context.now, context.timeZone)
        ? "overdue"
        : "due";

  return {
    title: task.title,
    date: startLocal.date,
    timeRange,
    minutes,
    priority: task.priority,
    dueState,
    dueDate: task.dueDate,
    linked: task.goalId !== null || task.milestoneId !== null,
    preferred: matchesPreferredPeriod(slot, context),
    workOverlap: overlapsWorkOrStudy(slot, context),
  };
}

/**
 * Human-readable slot explanation covering the five PRD §4.3 result fields:
 * which task, which day, what time, how long, and why this time.
 */
export function explainSlot(task: Task, slot: TimeRange, context: ScoreContext): string {
  const startMs = Date.parse(slot.start);
  const endMs = Date.parse(slot.end);
  const minutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
  const startLocal = localParts(slot.start, context.timeZone);
  const endLocal = localParts(slot.end, context.timeZone);
  const time =
    startLocal.date === endLocal.date
      ? `${startLocal.time}–${endLocal.time}`
      : `${startLocal.time}–${endLocal.date} ${endLocal.time}`;

  const reasons: string[] = [`${task.priority} priority`];

  if (task.dueDate) {
    reasons.push(
      isTaskOverdue(task, context.now, context.timeZone)
        ? `due ${task.dueDate} (overdue)`
        : `due ${task.dueDate}`,
    );
  } else {
    reasons.push("no due date");
  }

  if (task.goalId !== null || task.milestoneId !== null) {
    reasons.push("linked to a goal");
  }

  if (matchesPreferredPeriod(slot, context)) {
    reasons.push("fits your preferred hours");
  }

  if (overlapsWorkOrStudy(slot, context)) {
    reasons.push("overlaps your working hours");
  }

  return `"${task.title}" — planned ${startLocal.date}, ${time} (${minutes} min). ${reasons.join(", ")}.`;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  if (a.task.dueDate !== b.task.dueDate) {
    if (a.task.dueDate === null) {
      return 1;
    }
    if (b.task.dueDate === null) {
      return -1;
    }
    if (a.task.dueDate < b.task.dueDate) {
      return -1;
    }
    return 1;
  }

  return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
}

function hasUsableEstimate(task: Task): task is Task & { estimatedDurationMinutes: number } {
  return (
    typeof task.estimatedDurationMinutes === "number" &&
    Number.isFinite(task.estimatedDurationMinutes) &&
    task.estimatedDurationMinutes > 0
  );
}

/**
 * Splits open tasks into schedulable candidates (scored, overdue-flagged,
 * sorted by score → due date → id), tasks needing an estimate (Д7) and closed
 * tasks (Д6: completed/cancelled are excluded, never planned).
 */
export function selectCandidates(input: SelectCandidatesInput): SelectCandidatesResult {
  const candidates: Candidate[] = [];
  const needsEstimate: Task[] = [];
  const excluded: Task[] = [];

  for (const task of input.tasks) {
    if (task.status === "completed" || task.status === "cancelled") {
      excluded.push(task);
      continue;
    }

    if (!hasUsableEstimate(task)) {
      needsEstimate.push(task);
      continue;
    }

    candidates.push({
      task,
      score: scoreTask(task, { now: input.now, timeZone: input.timeZone }),
      overdue: isTaskOverdue(task, input.now, input.timeZone),
    });
  }

  candidates.sort(compareCandidates);

  return { candidates, needsEstimate, excluded };
}

function validRanges(blocks: readonly PlanBlock[]): { block: PlanBlock; range: RangeMs }[] {
  const parsed: { block: PlanBlock; range: RangeMs }[] = [];

  for (const block of blocks) {
    const range = parseBlockRange(block);

    if (range) {
      parsed.push({ block, range });
    }
  }

  return parsed;
}

/**
 * Hard conflicts (Д2): nonzero block overlap (touching edges are fine),
 * intersection with the sleep window (midnight crossing handled per local
 * date), and blocks ending in the past (`end <= now`). Intersections with
 * working/study hours are soft `work` warnings, never hard conflicts.
 */
export function findConflicts(
  blocks: readonly PlanBlock[],
  input: FindConflictsInput,
): BlockConflict[] {
  const parsed = validRanges(blocks).sort(
    (a, b) =>
      a.range.start - b.range.start ||
      a.range.end - b.range.end ||
      (a.block.id < b.block.id ? -1 : a.block.id > b.block.id ? 1 : 0),
  );
  const conflicts: BlockConflict[] = [];
  const nowMs = input.now.getTime();

  for (const { block, range } of parsed) {
    if (range.end <= nowMs) {
      conflicts.push({ blockId: block.id, kind: "past", at: block.endTime });
    }
  }

  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const earlier = parsed[i];
      const later = parsed[j];

      if (later.range.start >= earlier.range.end) {
        break;
      }

      if (earlier.range.start < later.range.end && later.range.start < earlier.range.end) {
        conflicts.push({
          blockId: later.block.id,
          kind: "overlap",
          otherId: earlier.block.id,
          at: new Date(Math.max(earlier.range.start, later.range.start)).toISOString(),
        });
      }
    }
  }

  for (const { block, range } of parsed) {
    const sleepAt = firstUncoveredByWake(range, input);

    if (sleepAt !== null) {
      conflicts.push({ blockId: block.id, kind: "sleep", at: new Date(sleepAt).toISOString() });
    }

    const workAt = firstWorkOverlap(range, input);

    if (workAt !== null) {
      conflicts.push({ blockId: block.id, kind: "work", at: new Date(workAt).toISOString() });
    }
  }

  conflicts.sort((a, b) =>
    a.blockId < b.blockId ? -1 : a.blockId > b.blockId ? 1 : a.kind < b.kind ? -1 : 1,
  );

  return conflicts;
}

/** Local calendar dates (in `timeZone`) touched by an absolute range. */
function spannedDateKeys(range: RangeMs, timeZone: string): string[] {
  const keys: string[] = [];
  let current = toDateKey(new Date(range.start), timeZone);
  const last = toDateKey(new Date(range.end - 1), timeZone);

  for (let guard = 0; guard < 400; guard += 1) {
    keys.push(current);

    if (current >= last) {
      return keys;
    }

    current = addDays(current, 1);
  }

  return keys;
}

/**
 * First instant of `range` not covered by any wake window of the spanned
 * local dates, or null when fully awake. A day with no usable wake window
 * counts as fully asleep.
 */
function firstUncoveredByWake(range: RangeMs, input: FindConflictsInput): number | null {
  const awake = mergeRanges(
    spannedDateKeys(range, input.timeZone).flatMap((dateKey) => {
      const wake = wakeWindowMs(dateKey, input.timeZone, input.wakeUpTime, input.sleepTime);
      const clipped = wake ? intersect(wake, range) : null;

      return clipped ? [clipped] : [];
    }),
  );

  let cursor = range.start;

  for (const segment of awake) {
    if (segment.start > cursor) {
      return cursor;
    }

    cursor = Math.max(cursor, segment.end);
  }

  return cursor < range.end ? cursor : null;
}

/** Start of the first working/study overlap, or null when the block avoids both. */
function firstWorkOverlap(range: RangeMs, input: FindConflictsInput): number | null {
  const busy = mergeRanges(
    spannedDateKeys(range, input.timeZone).flatMap((dateKey) => {
      const day = weekdayOf(dateKey, input.timeZone);
      const work = availabilityRangesMs(day, dateKey, input.timeZone, input.workingHours);
      const study = availabilityRangesMs(day, dateKey, input.timeZone, input.studyHours);

      return [...work, ...study]
        .map((busyRange) => intersect(busyRange, range))
        .filter((clipped): clipped is RangeMs => clipped !== null);
    }),
  );

  return busy.length > 0 ? busy[0].start : null;
}

/**
 * Greedy deterministic day plan: candidates (score → due date → id) each take
 * the first free window that fits them whole (Д3: no splitting). A task longer
 * than every initial window is `too-long`; one that fit in principle but lost
 * the remaining space is `no-window`. Past portions of today are unplannable
 * (PRD §4.3: never plan in the past). Slots never overlap and never enter
 * sleep or working/study hours, because they are carved out of the free
 * windows (Д1).
 *
 * B1: a task that already owns a `task` block overlapping the planned day
 * (day bounds are the user's local midnight, the same edges
 * `plannerDayBounds` reads — never a UTC calendar date) is reported in
 * `alreadyPlanned` with the earliest overlapping block and takes no slot.
 * Its block still cuts the free windows, so no other task is placed into it.
 */
export function planDay(input: PlanDayInput): PlanDayResult {
  const initial = computeFreeWindows({
    dateKey: input.dateKey,
    timeZone: input.timeZone,
    wakeUpTime: input.wakeUpTime,
    sleepTime: input.sleepTime,
    workingHours: input.workingHours,
    studyHours: input.studyHours,
    blocks: input.blocks,
  }).map((window) => ({ start: Date.parse(window.start), end: Date.parse(window.end) }));

  const todayKey = toDateKey(input.now, input.timeZone);
  const nowMs = input.now.getTime();
  const remaining =
    input.dateKey === todayKey
      ? subtractRanges(initial, [{ start: Number.NEGATIVE_INFINITY, end: nowMs }])
      : initial;

  const longest = remaining.reduce((max, window) => Math.max(max, window.end - window.start), 0);

  // B1: tasks that already own a block overlapping the planned day never
  // take a second slot. Bounds are the user's local midnight pair — a block
  // touching the day edge belongs to the neighbour, like in `listBlocks`.
  const dayStartMs = Date.parse(localDateTimeToIso(`${input.dateKey}T00:00`, input.timeZone));
  const dayEndMs = Date.parse(
    localDateTimeToIso(`${addDays(input.dateKey, 1)}T00:00`, input.timeZone),
  );
  const plannedByTask = new Map<
    string,
    { blockId: string; start: string; end: string; startMs: number }
  >();

  for (const block of input.blocks) {
    if (block.taskId == null) {
      continue;
    }

    const range = parseBlockRange(block);

    if (!range || range.end <= dayStartMs || range.start >= dayEndMs) {
      continue;
    }

    const current = plannedByTask.get(block.taskId);

    if (!current || range.start < current.startMs) {
      plannedByTask.set(block.taskId, {
        blockId: block.id,
        start: block.startTime,
        end: block.endTime,
        startMs: range.start,
      });
    }
  }

  const { candidates, needsEstimate } = selectCandidates({
    tasks: input.tasks.filter((task) => !plannedByTask.has(task.id)),
    now: input.now,
    timeZone: input.timeZone,
  });
  const slotContext: ScoreContext = {
    now: input.now,
    timeZone: input.timeZone,
    workingHours: input.workingHours,
    studyHours: input.studyHours,
  };

  const slots: PlannedSlot[] = [];
  const doesNotFit: DoesNotFit[] = [];

  for (const candidate of candidates) {
    const durationMs = (candidate.task.estimatedDurationMinutes ?? 0) * MS_PER_MINUTE;

    if (durationMs <= 0 || durationMs > longest) {
      doesNotFit.push({ taskId: candidate.task.id, reason: "too-long" });
      continue;
    }

    const slotIndex = remaining.findIndex((window) => window.end - window.start >= durationMs);

    if (slotIndex === -1) {
      doesNotFit.push({ taskId: candidate.task.id, reason: "no-window" });
      continue;
    }

    const window = remaining[slotIndex];
    const slot: TimeRange = {
      start: new Date(window.start).toISOString(),
      end: new Date(window.start + durationMs).toISOString(),
    };

    slots.push({
      taskId: candidate.task.id,
      start: slot.start,
      end: slot.end,
      score: scoreTask(candidate.task, slotContext, slot),
      reason: explainSlot(candidate.task, slot, slotContext),
    });

    window.start += durationMs;

    if (window.start >= window.end) {
      remaining.splice(slotIndex, 1);
    }
  }

  slots.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  // Input order is the only order here: deterministic for the same input.
  const alreadyPlanned: AlreadyPlanned[] = input.tasks
    .filter((task) => plannedByTask.has(task.id))
    .map((task) => {
      const planned = plannedByTask.get(task.id) as {
        blockId: string;
        start: string;
        end: string;
      };

      return {
        taskId: task.id,
        blockId: planned.blockId,
        start: planned.start,
        end: planned.end,
      };
    });

  return { slots, doesNotFit, needsEstimate, alreadyPlanned };
}
