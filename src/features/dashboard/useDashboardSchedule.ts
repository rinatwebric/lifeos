import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useBlocks } from "@/features/planner/hooks";
import { plannerDayBounds } from "@/features/planner/usePlannerDay";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { tasks } from "@/features/tasks/queryKeys";
import { toDateKey } from "@/lib/dates";
import type { BlockType, TimeBlock } from "@/types/domain";

/**
 * Today's schedule preview for the Dashboard (iteration 4, unit 10).
 *
 * The pure part — `buildDashboardSchedule` — is what the card renders: the
 * next few blocks, the per-type minutes of the whole day and the flags the
 * empty states depend on. It takes `now`, the time zone and the day bounds
 * as explicit inputs, so it is testable without React and without a network.
 *
 * Decisions baked in here:
 * - The list is forward-looking: a block stays in it while its end is not
 *   before `now`. A block that is already over cannot be "next".
 * - The totals cover every block of the day, including finished ones: the
 *   card answers "how loaded is today", not "how much is left".
 * - Times are clipped to the day (`bounds`), so a block that starts before
 *   local midnight neither inflates the totals nor claims a time outside
 *   the day it belongs to (same posture as the Day view).
 * - Д4: a task block is named by its linked task; `title` is the fallback.
 */

const MS_PER_MINUTE = 60_000;

/** How many upcoming blocks the compact card lists. */
export const DASHBOARD_SCHEDULE_LIMIT = 5;

export interface DashboardScheduleBlock {
  id: string;
  blockType: BlockType;
  /** Linked task title, block title as fallback (Д4). */
  title: string;
  taskId: string | null;
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  /** Minutes of this day covered by the block (clipped at the day edges). */
  durationMinutes: number;
}

export interface DashboardScheduleTotals {
  task: number;
  break: number;
  personal: number;
  /** All three types together — the day's scheduled time. */
  scheduled: number;
}

export interface DashboardSchedule {
  /** Upcoming blocks, ordered by start, at most `limit` of them. */
  blocks: DashboardScheduleBlock[];
  totals: DashboardScheduleTotals;
  /** Every block of the day, including the ones that already finished. */
  dayBlockCount: number;
  /** True when the day has no blocks at all. */
  isEmpty: boolean;
  /** True when the day has blocks but every one of them is over. */
  isAllPast: boolean;
}

export interface BuildDashboardScheduleInput {
  blocks: readonly TimeBlock[];
  timeZone: string;
  now: Date;
  /** `[start, end)` of the day in ISO; blocks are clipped to it. */
  bounds: { start: string; end: string };
  limit?: number;
  taskTitleById?: ReadonlyMap<string, string>;
}

/** "09:30" in the user's zone; `hourCycle: h23` keeps midnight "00:00". */
function timeLabel(instantMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instantMs));
}

export function buildDashboardSchedule({
  blocks,
  timeZone,
  now,
  bounds,
  limit = DASHBOARD_SCHEDULE_LIMIT,
  taskTitleById,
}: BuildDashboardScheduleInput): DashboardSchedule {
  const fromMs = Date.parse(bounds.start);
  const toMs = Date.parse(bounds.end);
  const nowMs = now.getTime();

  const totals: DashboardScheduleTotals = { task: 0, break: 0, personal: 0, scheduled: 0 };
  const upcoming: { block: TimeBlock; startMs: number; endMs: number }[] = [];
  let dayBlockCount = 0;

  for (const block of blocks) {
    const rawStart = Date.parse(block.startTime);
    const rawEnd = Date.parse(block.endTime);

    // A row with an unparseable or inverted interval is dropped instead of
    // producing a negative duration; the DB CHECK is the real guard.
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) {
      continue;
    }

    const startMs = Math.max(rawStart, fromMs);
    const endMs = Math.min(rawEnd, toMs);

    if (endMs <= startMs) {
      continue;
    }

    const minutes = Math.round((endMs - startMs) / MS_PER_MINUTE);
    dayBlockCount += 1;
    totals[block.blockType] += minutes;
    totals.scheduled += minutes;

    if (endMs >= nowMs) {
      upcoming.push({ block, startMs, endMs });
    }
  }

  upcoming.sort(
    (a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.block.id.localeCompare(b.block.id),
  );

  const visible = upcoming.slice(0, Math.max(0, limit)).map(({ block, startMs, endMs }) => {
    const linkedTitle = block.taskId ? taskTitleById?.get(block.taskId) : undefined;

    return {
      id: block.id,
      blockType: block.blockType,
      title: linkedTitle ?? block.title,
      taskId: block.taskId,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      startLabel: timeLabel(startMs, timeZone),
      endLabel: timeLabel(endMs, timeZone),
      durationMinutes: Math.round((endMs - startMs) / MS_PER_MINUTE),
    } satisfies DashboardScheduleBlock;
  });

  return {
    blocks: visible,
    totals,
    dayBlockCount,
    isEmpty: dayBlockCount === 0,
    isAllPast: dayBlockCount > 0 && upcoming.length === 0,
  };
}

export interface DashboardScheduleOptions {
  now?: Date;
  limit?: number;
}

export interface DashboardScheduleViewModel {
  dateKey: string;
  timeZone: string;
  schedule: DashboardSchedule;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

/**
 * Reads today's blocks in the user's time zone. Requests never fan out:
 * one blocks query for the day range (the same `planner.range` key the Day
 * view uses, so visiting both screens still costs one request), one shared
 * tasks list for the linked titles — skipped when the day has no task block
 * — and one cached profile read on the key the whole app shares.
 */
export function useDashboardSchedule({
  now = new Date(),
  limit = DASHBOARD_SCHEDULE_LIMIT,
}: DashboardScheduleOptions = {}): DashboardScheduleViewModel {
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getProfile,
    staleTime: 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? "UTC";
  const nowMs = now.getTime();

  const dateKey = toDateKey(new Date(nowMs), timeZone);
  const bounds = useMemo(() => plannerDayBounds(dateKey, timeZone), [dateKey, timeZone]);

  const blocksQuery = useBlocks({ from: bounds.start, to: bounds.end });
  const blockList = useMemo(() => blocksQuery.data ?? [], [blocksQuery.data]);

  const hasTaskBlock = useMemo(() => blockList.some((block) => block.taskId !== null), [blockList]);

  const tasksQuery = useQuery({
    queryKey: tasks.list(),
    queryFn: () => listTasks(),
    enabled: hasTaskBlock,
    staleTime: 60_000,
  });

  const taskTitleById = useMemo(() => {
    const titles = new Map<string, string>();

    for (const task of tasksQuery.data ?? []) {
      titles.set(task.id, task.title);
    }

    return titles;
  }, [tasksQuery.data]);

  const schedule = useMemo(
    () =>
      buildDashboardSchedule({
        blocks: blockList,
        timeZone,
        now: new Date(nowMs),
        limit,
        bounds,
        taskTitleById,
      }),
    [blockList, timeZone, nowMs, limit, bounds, taskTitleById],
  );

  return {
    dateKey,
    timeZone,
    schedule,
    // Every label depends on the time zone, so nothing is drawn before it is known.
    isLoading: profileQuery.isLoading || blocksQuery.isLoading,
    // Titles fall back to the block's own title, so a failed tasks read is not an error.
    isError: blocksQuery.isError,
    retry: () => {
      void blocksQuery.refetch();
    },
  };
}
