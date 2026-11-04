import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences, getProfile } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import type { Profile, Task, UserPreferences } from "@/types/domain";

import { createBlock, deleteBlock, listBlocks, updateBlock } from "./api";
import { usePlanPreview } from "./usePlanPreview";

vi.mock("./api", () => ({
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  getBlock: vi.fn(),
  listBlocks: vi.fn(),
  updateBlock: vi.fn(),
}));

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  getPreferences: vi.fn(),
  profileQueryKey: ["profile"],
  preferencesQueryKey: ["preferences"],
}));

vi.mock("@/features/tasks/api", () => ({
  listTasks: vi.fn(),
}));

const TIME_ZONE = "Europe/Berlin";
const DATE_KEY = "2026-11-04";
const NOW = new Date("2026-11-04T05:00:00.000Z");

const PROFILE: Profile = {
  id: "user-1",
  fullName: null,
  avatarUrl: null,
  timezone: TIME_ZONE,
  language: "en",
  theme: "light",
  onboardedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

const PREFERENCES: UserPreferences = {
  id: "pref-1",
  userId: "user-1",
  wakeUpTime: "07:00",
  sleepTime: "23:00",
  workingHours: {},
  studyHours: {},
  preferredWorkPeriods: {},
  notificationPreferences: {},
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

const TASK: Task = {
  id: "t1",
  userId: "user-1",
  goalId: null,
  milestoneId: null,
  title: "Write the report",
  description: null,
  priority: "high",
  status: "todo",
  dueDate: null,
  scheduledStart: null,
  scheduledEnd: null,
  estimatedDurationMinutes: 45,
  completedAt: null,
  recurrenceRuleId: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue(PROFILE);
  vi.mocked(getPreferences).mockResolvedValue(PREFERENCES);
  vi.mocked(listBlocks).mockResolvedValue([]);
  vi.mocked(listTasks).mockResolvedValue([TASK]);
});

describe("usePlanPreview", () => {
  it("builds the proposal from reads and writes nothing", async () => {
    const queryClient = createClient();
    const setQueryData = vi.spyOn(queryClient, "setQueryData");

    const { result } = renderHook(() => usePlanPreview({ dateKey: DATE_KEY, now: NOW }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.timeZone).toBe(TIME_ZONE);
    expect(result.current.preview.slots).toHaveLength(1);
    expect(result.current.preview.slots[0]).toMatchObject({
      taskId: "t1",
      taskTitle: "Write the report",
      startLabel: "07:00",
      endLabel: "07:45",
    });

    expect(setQueryData).not.toHaveBeenCalled();
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
    expect(deleteBlock).not.toHaveBeenCalled();
  });

  it("stays idle until it is enabled and then performs one read per source", async () => {
    const queryClient = createClient();

    const disabled = renderHook(
      () => usePlanPreview({ dateKey: DATE_KEY, now: NOW, enabled: false }),
      { wrapper: createWrapper(queryClient) },
    );

    expect(disabled.result.current.isLoading).toBe(false);
    expect(disabled.result.current.preview.slots).toEqual([]);
    expect(listBlocks).not.toHaveBeenCalled();
    expect(listTasks).not.toHaveBeenCalled();
    expect(getProfile).not.toHaveBeenCalled();
    expect(getPreferences).not.toHaveBeenCalled();

    const enabled = renderHook(() => usePlanPreview({ dateKey: DATE_KEY, now: NOW }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(enabled.result.current.isLoading).toBe(false));

    expect(listBlocks).toHaveBeenCalledTimes(1);
    expect(listTasks).toHaveBeenCalledTimes(1);
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(getPreferences).toHaveBeenCalledTimes(1);
  });

  it("reports a failed read instead of an empty plan", async () => {
    vi.mocked(listTasks).mockRejectedValue(new Error("offline"));
    const queryClient = createClient();

    const { result } = renderHook(() => usePlanPreview({ dateKey: DATE_KEY, now: NOW }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.preview.canAccept).toBe(false);
  });
});
