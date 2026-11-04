import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Habit, HabitLog, HabitScheduleVersion } from "@/types/domain";

import { useCreateHabit, useHabitsWithStats, useLogHabit } from "./hooks";

vi.mock("./api", () => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  setHabitStatus: vi.fn(),
  deleteHabit: vi.fn(),
  getHabit: vi.fn(),
  listHabits: vi.fn(),
  listHabitLogs: vi.fn(),
  listHabitLogsRange: vi.fn(),
  getHabitLog: vi.fn(),
  logHabit: vi.fn(),
  updateHabitLog: vi.fn(),
  deleteHabitLog: vi.fn(),
  listHabitVersions: vi.fn(),
  listAllHabitVersions: vi.fn(),
}));

import {
  createHabit,
  listAllHabitVersions,
  listHabitLogsRange,
  listHabits,
  logHabit,
} from "./api";

const mockedCreateHabit = vi.mocked(createHabit);
const mockedLogHabit = vi.mocked(logHabit);
const mockedListHabits = vi.mocked(listHabits);
const mockedListLogsRange = vi.mocked(listHabitLogsRange);
const mockedListVersions = vi.mocked(listAllHabitVersions);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return { Wrapper, client };
}

const HABIT: Habit = {
  id: "h1",
  userId: "u1",
  title: "Read",
  description: null,
  frequency: "daily",
  weekdays: [],
  targetCount: 1,
  reminderTime: null,
  startDate: "2026-11-01",
  status: "active",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("habit mutation hooks", () => {
  it("invalidates only habits.* after create", async () => {
    mockedCreateHabit.mockResolvedValue(HABIT);
    const { Wrapper, client } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateHabit(), { wrapper: Wrapper });
    result.current.mutate({
      title: "Read",
      description: null,
      frequency: "daily",
      weekdays: [],
      targetCount: 1,
      reminderTime: null,
      startDate: "2026-11-01",
      status: "active",
    });

    await waitFor(() => expect(mockedCreateHabit).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["habits"] });
    expect(spy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["goals"]) }),
    );
  });

  it("invalidates only habits.* after logging", async () => {
    const entry: HabitLog = {
      id: "l1",
      userId: "u1",
      habitId: "h1",
      logDate: "2026-11-04",
      completedCount: 1,
      note: null,
      createdAt: "2026-11-04T08:00:00.000Z",
      updatedAt: "2026-11-04T08:00:00.000Z",
    };
    mockedLogHabit.mockResolvedValue(entry);
    const { Wrapper, client } = wrapper();
    const spy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useLogHabit(), { wrapper: Wrapper });
    result.current.mutate({
      habitId: "123e4567-e89b-12d3-a456-426614174000",
      logDate: "2026-11-04",
      completedCount: 1,
    });

    await waitFor(() => expect(mockedLogHabit).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith({ queryKey: ["habits"] });
  });
});

describe("useHabitsWithStats", () => {
  it("reads three queries once and groups client-side (no N+1)", async () => {
    const snapshot: HabitScheduleVersion = {
      id: "v1",
      userId: "u1",
      habitId: "h1",
      effectiveFrom: "2026-11-01",
      effectiveTo: null,
      frequency: "daily",
      weekdays: [],
      targetCount: 1,
      startDate: "2026-11-01",
      status: "active",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    mockedListHabits.mockResolvedValue([HABIT]);
    mockedListLogsRange.mockResolvedValue([]);
    mockedListVersions.mockResolvedValue([snapshot]);

    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => useHabitsWithStats({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-05"),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(mockedListHabits).toHaveBeenCalledTimes(1);
    expect(mockedListLogsRange).toHaveBeenCalledTimes(1);
    expect(mockedListVersions).toHaveBeenCalledTimes(1);
    expect(result.current.rows[0].stats.planned).toBe(4);
    expect(result.current.rows[0].stats.missed).toBe(4);
  });
});
