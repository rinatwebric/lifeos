import { isTaskClosed, type Task } from "@/types/domain";

/**
 * Returns the calendar date (YYYY-MM-DD) for `date` in the given IANA time zone.
 * Comparing such keys lexicographically is equivalent to comparing dates.
 */
export function toDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatLongDate(date: Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

type OverdueCandidate = Pick<Task, "dueDate" | "status">;
/**
 * Overdue is a derived state, never a stored task status. A task is overdue only
 * when its due date is strictly before "today" in the user's time zone, and the
 * task is still open.
 */
export function isTaskOverdue(task: OverdueCandidate, now = new Date(), timeZone = "UTC"): boolean {
  if (!task.dueDate || isTaskClosed(task.status)) {
    return false;
  }

  return task.dueDate < toDateKey(now, timeZone);
}

export function isTaskDueToday(
  task: OverdueCandidate,
  now = new Date(),
  timeZone = "UTC",
): boolean {
  if (!task.dueDate || isTaskClosed(task.status)) {
    return false;
  }

  return task.dueDate === toDateKey(now, timeZone);
}

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readParts(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function zonedParts(date: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: Number(readParts(parts, "year")),
    month: Number(readParts(parts, "month")),
    day: Number(readParts(parts, "day")),
    hour: Number(readParts(parts, "hour")),
    minute: Number(readParts(parts, "minute")),
    second: Number(readParts(parts, "second")),
  };
}

/**
 * Offset of `timeZone` at the given instant: wall-clock-as-UTC minus the
 * instant itself, in milliseconds. Positive east of UTC.
 */
function zonedOffsetMs(instantMs: number, timeZone: string): number {
  const parts = zonedParts(new Date(instantMs), timeZone);
  const asUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtcMs - instantMs;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Interprets a `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`,
 * optional `:ss`) as wall time in `timeZone` and returns the UTC ISO string.
 * The offset is resolved iteratively (two passes) so DST transitions land on
 * the correct side. Throws on malformed input — the form converts through
 * this function instead of `new Date(value).toISOString()`, so a wall time
 * never silently shifts by the browser's local zone.
 */
export function localDateTimeToIso(local: string, timeZone: string): string {
  const match = LOCAL_DATETIME_PATTERN.exec(local);

  if (!match) {
    throw new Error(`Invalid datetime-local value: ${local}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");

  const valid =
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31 &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59;

  if (!valid) {
    throw new Error(`Invalid datetime-local value: ${local}`);
  }

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let pass = 0; pass < 2; pass += 1) {
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - zonedOffsetMs(utcMs, timeZone);
  }

  return new Date(utcMs).toISOString();
}

/**
 * Formats a stored UTC ISO string as a `<input type="datetime-local">` value
 * (`YYYY-MM-DDTHH:mm`) in `timeZone`. The inverse of `localDateTimeToIso`
 * for minute-precision values. Throws on unparseable input.
 */
export function isoToLocalDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date-time value: ${iso}`);
  }

  const parts = zonedParts(date, timeZone);
  return (
    `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` +
    `T${pad2(parts.hour)}:${pad2(parts.minute)}`
  );
}
