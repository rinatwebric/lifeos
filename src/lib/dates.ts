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