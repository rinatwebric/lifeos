import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { listBlocks } from "@/features/planner/api";
import { getProfile, profileQueryKey } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { localDateTimeToIso } from "@/lib/dates";
import type { Profile, Task, TimeBlock } from "@/types/domain";

import { useDashboardSchedule } from "./useDashboardSchedule";

/**
 * The hook always reads blocks through the planner's `useBlocks`, so mocking
 * the planner service (not the hook) counts the real requests: one per day
 * range, never one per block.
 */
vi.mock("@/features/planner/api", () => ({
  listBlocks: vi.fn(),
  createBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
  getPreferences: vi.fn(),
  preferencesQueryKey: ["preferences"],
}));

vi.mock("@/features/tasks/api", () => ({
  listTasks: vi.fn(),
}));

const TIME_ZONE = "Asia/Bishkek";
const DATE_KEY = "2026-11-04";

function at(wallTime: string): string {
  return localDateTimeToIso(`${DATE_KEY}T${wallTime}`, TIME_ZONE);
}

const now = new Date(at("12:00"));

function makeProfile(): Profile {
  return {
    id: "u1",
    fullName: "Alex",
    avatarUrl: null,
    timezone: TIME_ZONE,
    language: "en",
    theme: "light",
    onboardedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

function makeBlock(
  startWall: string,
  endWall: string,
  overrides: Partial<TimeBlock> = {},
): TimeBlock {
  return {
    id: `block-${startWall}`,
    userId: "u1",
    taskId: null,
    title: `Block ${startWall}`,
    blockType: "task",
    startTime: at(startWall),
    endTime: at(endWall),
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeTask(id: string, title: string): Task {
  return {
    id,
    userId: "u1",
    goalId: null,
    milestoneId: null,
    title,
    description: null,
    priority: "medium",
    status: "todo",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedDurationMinutes: null,
    completedAt: null,
    recurrenceRuleId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
}

/** Profile already in the cache, as it is on a rendered Dashboard. */
function makeClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(profileQueryKey, makeProfile());
  return client;
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useDashboardSchedule", () => {
  it("fetches today's blocks once for the whole card", async () => {
    vi.mocked(listBlocks).mockResolvedValue([
      makeBlock("09:00", "10:00", { taskId: "task-1" }),
      makeBlock("13:00", "14:00", { taskId: "task-1" }),
      makeBlock("15:00", "15:15", { blockType: "break" }),
    ]);
    vi.mocked(listTasks).mockResolvedValue([makeTask("task-1", "Write the report")]);

    const { result } = renderHook(() => useDashboardSchedule({ now }), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.schedule.blocks).toHaveLength(2));

    expect(vi.mocked(listBlocks)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listBlocks)).toHaveBeenCalledWith({
      from: localDateTimeToIso(`${DATE_KEY}T00:00`, TIME_ZONE),
      to: localDateTimeToIso("2026-11-05T00:00", TIME_ZONE),
    });
    // One shared task list for the linked titles, not one lookup per block.
    expect(vi.mocked(listTasks)).toHaveBeenCalledTimes(1);
    expect(result.current.schedule.blocks.map((block) => block.title)).toEqual([
      "Write the report",
      "Block 15:00",
    ]);
    expect(result.current.timeZone).toBe(TIME_ZONE);
    expect(result.current.dateKey).toBe(DATE_KEY);
  });

  it("reports a failed blocks read instead of an empty day", async () => {
    vi.mocked(listBlocks).mockRejectedValue(new Error("blocks down"));
    vi.mocked(listTasks).mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardSchedule({ now }), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it("skips the task list when the day has no task block", async () => {
    vi.mocked(listBlocks).mockResolvedValue([
      makeBlock("13:00", "13:30", { blockType: "personal", title: "Walk" }),
    ]);
    vi.mocked(listTasks).mockResolvedValue([makeTask("task-1", "Write the report")]);

    const { result } = renderHook(() => useDashboardSchedule({ now }), {
      wrapper: wrapperFor(makeClient()),
    });

    await waitFor(() => expect(result.current.schedule.blocks).toHaveLength(1));

    expect(vi.mocked(listTasks)).not.toHaveBeenCalled();
    expect(result.current.schedule.blocks[0].title).toBe("Walk");
    expect(vi.mocked(getProfile)).not.toHaveBeenCalled();
  });
});
