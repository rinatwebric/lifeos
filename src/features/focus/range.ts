import { localDateTimeToIso } from "@/lib/dates";

function nextDateKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
  return next.toISOString().slice(0, 10);
}

/** Local calendar period [fromKey, toKey] as UTC ISO bounds for PostgREST. */
export function focusRangeIso(
  fromKey: string,
  toKey: string,
  timeZone: string,
): { from: string; to: string } {
  return {
    from: localDateTimeToIso(`${fromKey}T00:00`, timeZone),
    to: localDateTimeToIso(`${nextDateKey(toKey)}T00:00`, timeZone),
  };
}
