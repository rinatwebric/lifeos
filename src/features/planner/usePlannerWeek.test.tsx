import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { getPreferences, getProfile } from "@/features/settings/api";
import { localDateTimeToIso } from "@/lib/dates";
import type { TimeBlock } from "@/types/domain";

import { useBlocks } from "./hooks";
import {
  buildPlannerWeek,
  formatBlockCount,
  plannerWeekBounds,
  plannerWeekLabel,
  startOfWeekKey,
  usePlannerWeek,
  type BuildPlannerWeekInput,
} from "./usePlannerWeek";

vi.mock("./hooks", () => ({ useBlocks: vi.fn() }));

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
  getPreferences: vi.fn(),
  preferencesQueryKey: ["preferences"],
}));

const TIME_ZONE = "Europe/Berlin";
/** Wednesday — the week around it starts on Monday 2026-11-02. */
const WEEK_DATE = "2026-11-04";
/** 06:00 Berlin: nothing later on this day is in the past yet. */
const NOW = new Date("2026-11-04T05:00:00.000Z");
const TASK_ID = "123e4567-e89b-12d3-a456-426614174000";

function at(local: string, dateKey = WEEK_DATE): string {
  return localDateTimeToIso(`${dateKey}T${local}`, TIME_ZONE);
}

function makeBlock(
  overrides: Partial<TimeBlock> & Pick<TimeBlock, "id" | "startTime" | "endTime">,
): TimeBlock {
  return {
    userId: "user-1",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    taskId: null,
    title: "Block",
    blockType: "personal",
    ...overrides,
  };
}

function build(overrides: Partial<BuildPlannerWeekInput> = {}) {
  return buildPlannerWeek({
    blocks: [],
    dateKey: WEEK_DATE,
    timeZone: TIME_ZONE,
    now: NOW,
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
    ...overrides,
  });
}

describe("buildPlannerWeek", () => {
  it("models an empty week as seven empty days starting on Monday", () => {
    const week = build();

    expect(week.startDateKey).toBe("2026-11-02");
    expect(week.endDateKey).toBe("2026-11-08");
    expect(week.days.map((day) => day.dateKey)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(week.days.map((day) => day.weekday)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
    ]);
    expect(week.days[0].weekdayShort).toBe("Mon");
    expect(week.days[0].weekdayLong).toBe("Monday");
    expect(week.days[0].dateLabel).toBe("Nov 2");
    expect(week.days.every((day) => day.isEmpty && day.blockCount === 0)).toBe(true);
    expect(week.days.every((day) => day.hasConflict)).toBe(false);
    expect(week.totals).toEqual({ task: 0, break: 0, personal: 0, scheduled: 0 });
    expect(week.blockCount).toBe(0);
    expect(week.plannedDays).toBe(0);
    expect(week.conflictDays).toBe(0);
    expect(week.isEmpty).toBe(true);
    expect(week.label).toBe("November 2 – 8, 2026");
    expect(week.days.filter((day) => day.isToday).map((day) => day.dateKey)).toEqual([
      "2026-11-04",
    ]);
  });

  it("groups blocks into their days and totals every block type", () => {
    const week = build({
      blocks: [
        makeBlock({
          id: "task-1",
          blockType: "task",
          taskId: TASK_ID,
          startTime: at("09:00", "2026-11-02"),
          endTime: at("10:30", "2026-11-02"),
        }),
        makeBlock({
          id: "break-1",
          blockType: "break",
          title: "Coffee",
          startTime: at("10:00"),
          endTime: at("10:15"),
        }),
        makeBlock({
          id: "personal-1",
          title: "Walk",
          startTime: at("14:00"),
          endTime: at("15:00"),
        }),
        makeBlock({
          id: "personal-2",
          title: "Reading",
          startTime: at("12:00", "2026-11-06"),
          endTime: at("13:00", "2026-11-06"),
        }),
      ],
    });

    expect(week.days[0].blockCount).toBe(1);
    expect(week.days[0].totals).toEqual({ task: 90, break: 0, personal: 0, scheduled: 90 });
    // Two blocks on Wednesday land in Wednesday, not in a neighbour.
    expect(week.days[2].blockCount).toBe(2);
    expect(week.days[2].totals).toEqual({ task: 0, break: 15, personal: 60, scheduled: 75 });
    expect(week.days[4].blockCount).toBe(1);
    expect(week.days[4].totals).toEqual({ task: 0, break: 0, personal: 60, scheduled: 60 });
    expect(week.days[1].isEmpty).toBe(true);

    expect(week.totals).toEqual({ task: 90, break: 15, personal: 120, scheduled: 225 });
    expect(week.blockCount).toBe(4);
    expect(week.plannedDays).toBe(3);
    expect(week.isEmpty).toBe(false);
    // A block that merely ended in the past is not a conflict for the week grid.
    expect(week.conflictDays).toBe(0);
    expect(week.days[0].hasConflict).toBe(false);
  });

  it("marks only the day that holds a conflicting block", () => {
    const week = build({
      blocks: [
        makeBlock({
          id: "free",
          startTime: at("09:00", "2026-11-02"),
          endTime: at("10:00", "2026-11-02"),
        }),
        makeBlock({ id: "long", startTime: at("09:00"), endTime: at("10:30") }),
        makeBlock({
          id: "inside",
          blockType: "break",
          startTime: at("10:00"),
          endTime: at("10:15"),
        }),
        makeBlock({
          id: "late",
          startTime: at("23:30", "2026-11-06"),
          endTime: at("23:45", "2026-11-06"),
        }),
      ],
    });

    expect(week.days[2].hasConflict).toBe(true);
    expect(week.days[2].conflictBlocks).toBe(2);
    expect(week.days[0].hasConflict).toBe(false);
    // A block reaching past sleep time counts for its own day only.
    expect(week.days[4].hasConflict).toBe(true);
    expect(week.days[4].conflictBlocks).toBe(1);
    expect(week.conflictDays).toBe(2);
  });

  it("keeps a week that crosses the month boundary in one model", () => {
    const week = build({
      dateKey: "2026-10-28",
      blocks: [
        makeBlock({
          id: "october",
          startTime: at("09:00", "2026-10-31"),
          endTime: at("10:00", "2026-10-31"),
        }),
        makeBlock({
          id: "november",
          startTime: at("09:00", "2026-11-01"),
          endTime: at("10:00", "2026-11-01"),
        }),
      ],
    });

    expect(week.startDateKey).toBe("2026-10-26");
    expect(week.endDateKey).toBe("2026-11-01");
    expect(week.label).toBe("October 26 – November 1, 2026");
    expect(week.days[5].dateKey).toBe("2026-10-31");
    expect(week.days[5].blockCount).toBe(1);
    expect(week.days[6].dateKey).toBe("2026-11-01");
    expect(week.days[6].blockCount).toBe(1);
    expect(week.days[4].isEmpty).toBe(true);
    expect(week.blockCount).toBe(2);
    // Sunday belongs to the week that started on the previous Monday.
    expect(startOfWeekKey("2026-11-01")).toBe("2026-10-26");
  });

  it("rejects a malformed date instead of inventing a week", () => {
    expect(() => build({ dateKey: "2026-02-30" })).toThrow(/Invalid date key/);
    expect(() => startOfWeekKey("not-a-date")).toThrow(/Invalid date key/);
  });
});

describe("planner week helpers", () => {
  it("finds the Monday of the current week", () => {
    expect(startOfWeekKey("2026-11-02")).toBe("2026-11-02");
    expect(startOfWeekKey("2026-11-04")).toBe("2026-11-02");
    expect(startOfWeekKey("2026-11-08")).toBe("2026-11-02");
  });

  it("returns local midnights around the week", () => {
    expect(plannerWeekBounds(WEEK_DATE, TIME_ZONE)).toEqual({
      start: "2026-11-01T23:00:00.000Z",
      end: "2026-11-08T23:00:00.000Z",
    });
  });

  it("labels a week across a year boundary", () => {
    expect(plannerWeekLabel("2026-11-04", TIME_ZONE)).toBe("November 2 – 8, 2026");
    expect(plannerWeekLabel("2026-12-30", TIME_ZONE)).toBe("December 28, 2026 – January 3, 2027");
  });

  it("counts blocks with a unit", () => {
    expect(formatBlockCount(0)).toBe("0 blocks");
    expect(formatBlockCount(1)).toBe("1 block");
    expect(formatBlockCount(3)).toBe("3 blocks");
  });
});

describe("usePlannerWeek", () => {
  function createWrapper() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  it("reads the seven days with one blocks request for the whole range", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      timezone: TIME_ZONE,
    } as unknown as Awaited<ReturnType<typeof getProfile>>);
    vi.mocked(getPreferences).mockResolvedValue({
      wakeUpTime: "07:00",
      sleepTime: "23:00",
      workingHours: {},
      studyHours: {},
    } as unknown as Awaited<ReturnType<typeof getPreferences>>);

    const blocks = [
      makeBlock({
        id: "monday",
        startTime: at("09:00", "2026-11-02"),
        endTime: at("10:00", "2026-11-02"),
      }),
      makeBlock({
        id: "friday",
        startTime: at("09:00", "2026-11-06"),
        endTime: at("10:00", "2026-11-06"),
      }),
    ];
    vi.mocked(useBlocks).mockReturnValue({
      data: blocks,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBlocks>);

    const { result } = renderHook(() => usePlannerWeek({ dateKey: WEEK_DATE, now: NOW }), {
      wrapper: createWrapper(),
    });

    // One range for the whole week — never one request per day.
    await waitFor(() => {
      expect(vi.mocked(useBlocks).mock.lastCall?.[0]).toEqual({
        from: "2026-11-01T23:00:00.000Z",
        to: "2026-11-08T23:00:00.000Z",
      });
    });
    expect(vi.mocked(useBlocks).mock.calls.length).toBeLessThanOrEqual(2);

    await waitFor(() => {
      expect(result.current.week.days).toHaveLength(7);
    });
    expect(result.current.timeZone).toBe(TIME_ZONE);
    expect(result.current.week.blockCount).toBe(2);
    expect(result.current.week.days[0].blockCount).toBe(1);
    expect(result.current.week.days[4].blockCount).toBe(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("surfaces a failed blocks read and offers a retry", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      timezone: TIME_ZONE,
    } as unknown as Awaited<ReturnType<typeof getProfile>>);
    vi.mocked(getPreferences).mockResolvedValue({
      wakeUpTime: null,
      sleepTime: null,
      workingHours: {},
      studyHours: {},
    } as unknown as Awaited<ReturnType<typeof getPreferences>>);
    const refetch = vi.fn();
    vi.mocked(useBlocks).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useBlocks>);

    const { result } = renderHook(() => usePlannerWeek({ dateKey: WEEK_DATE, now: NOW }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    result.current.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
