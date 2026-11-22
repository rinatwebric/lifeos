/**
 * Client clocks can run behind the database clock. Focus sessions are stamped
 * with server `now()` on insert, so a pause/finish sent immediately can
 * otherwise violate `paused_at/ended_at >= started_at`.
 */
export function notBefore(value: string, floor: string): string {
  const valueMs = Date.parse(value);
  const floorMs = Date.parse(floor);
  if (!Number.isFinite(valueMs) || !Number.isFinite(floorMs) || valueMs >= floorMs) {
    return value;
  }
  return floor;
}
