import type { RecurrenceRule } from "@/types/domain";

/**
 * Eager horizon for generated instances, in days. Applied on rule save and
 * topped up on app login (service `topUpRecurrenceInstances`, Unit 7).
 */
export const RECURRENCE_HORIZON_DAYS = 30;

type RuleShape = Pick<
  RecurrenceRule,
  "frequency" | "weekdays" | "intervalValue" | "startDate" | "endDate"
>;

/** Parses a YYYY-MM-DD key as UTC midnight. Returns null on garbage input. */
function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return null;
  }

  const date = new Date(`${key}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function diffDaysUTC(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Pure expansion of a recurrence rule into YYYY-MM-DD occurrence keys.
 * Covers `[fromDate, fromDate + days)` intersected with the rule's
 * `[startDate, endDate]`. Weekdays use 0 = Sunday .. 6 = Saturday
 * (matches JS `getDay`, enforced in SQL by a CHECK).
 *
 * No I/O: the Unit 7 service persists these with ON CONFLICT DO NOTHING
 * against `uq_tasks_recurrence_instance`.
 */
export function expandRecurrenceDates(rule: RuleShape, fromDate: string, days: number): string[] {
  const from = parseDateKey(fromDate);
  const start = parseDateKey(rule.startDate);
  const end = rule.endDate ? parseDateKey(rule.endDate) : null;
  const interval = Math.max(1, Math.floor(rule.intervalValue));

  if (!from || !start || days <= 0) {
    return [];
  }

  const weekdays = rule.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const result: string[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const current = new Date(from.getTime() + offset * 86_400_000);
    const key = toDateKeyUTC(current);

    if (current < start) {
      continue;
    }

    if (end && current > end) {
      break;
    }

    const diff = diffDaysUTC(start, current);

    if (rule.frequency === "daily") {
      if (diff % interval === 0) {
        result.push(key);
      }
    } else if (rule.frequency === "weekly") {
      if (diff % (7 * interval) === 0) {
        result.push(key);
      }
    } else if (weekdays.includes(current.getUTCDay())) {
      // "weekdays": named days of the week, repeating every `interval` weeks.
      if (Math.floor(diff / 7) % interval === 0) {
        result.push(key);
      }
    }
  }

  return result;
}
