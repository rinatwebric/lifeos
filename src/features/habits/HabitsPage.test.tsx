import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCreateHabit, useDeleteHabit, useHabitsWithStats, useLogHabit, useSetHabitStatus, useUpdateHabit } from "@/features/habits/hooks";
import { getProfile } from "@/features/settings/api";
import type { Habit } from "@/types/domain";

import { HabitsPage } from "./HabitsPage";

vi.mock("@/features/habits/hooks", () => ({
  useHabitsWithStats: vi.fn(),
  useSetHabitStatus: vi.fn(),
  useCreateHabit: vi.fn(),
  useUpdateHabit: vi.fn(),
  useDeleteHabit: vi.fn(),
  useLogHabit: vi.fn(),
}));

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
}));

const mockedStats = vi.mocked(useHabitsWithStats);
const mockedSetStatus = vi.mocked(useSetHabitStatus);
const mockedGetProfile = vi.mocked(getProfile);
const mockedCreateHabit = vi.mocked(useCreateHabit);
const mockedUpdateHabit = vi.mocked(useUpdateHabit);
const mockedDeleteHabit = vi.mocked(useDeleteHabit);
const mockedLogHabit = vi.mocked(useLogHabit);

const HABIT: Habit = {
  id: "h1",
  userId: "u1",
  title: "Read 20 minutes",
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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function statsQuery(data: unknown, flags: object = {}) {
  return { data, refetch: vi.fn(), ...flags };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetProfile.mockResolvedValue({
    id: "u1",
    fullName: null,
    avatarUrl: null,
    timezone: "UTC",
    language: "en",
    theme: "light",
    onboardedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });
  mockedSetStatus.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  } as never);
  const idleMutation = { mutateAsync: vi.fn(), isPending: false, isError: false };
  mockedCreateHabit.mockReturnValue(idleMutation as never);
  mockedUpdateHabit.mockReturnValue(idleMutation as never);
  mockedDeleteHabit.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockedLogHabit.mockReturnValue(idleMutation as never);
});

describe("HabitsPage", () => {
  it("shows a loading state while habits, logs or versions load", () => {
    mockedStats.mockReturnValue({
      habitsQuery: statsQuery(undefined, { isLoading: true, isError: false }),
      logsQuery: statsQuery(undefined, { isLoading: false, isError: false }),
      versionsQuery: statsQuery(undefined, { isLoading: false, isError: false }),
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(<HabitsPage />, { wrapper });

    expect(screen.getByLabelText("Loading habits")).toBeInTheDocument();
  });

  it("shows an error state with a retry that refetches all three queries", () => {
    const refetchHabits = vi.fn();
    const refetchLogs = vi.fn();
    const refetchVersions = vi.fn();
    mockedStats.mockReturnValue({
      habitsQuery: { data: undefined, isLoading: false, isError: true, refetch: refetchHabits },
      logsQuery: { data: undefined, isLoading: false, isError: false, refetch: refetchLogs },
      versionsQuery: { data: undefined, isLoading: false, isError: false, refetch: refetchVersions },
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(<HabitsPage />, { wrapper });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load habits");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchHabits).toHaveBeenCalled();
    expect(refetchLogs).toHaveBeenCalled();
    expect(refetchVersions).toHaveBeenCalled();
  });

  it("shows an empty state that explains the next step", () => {
    mockedStats.mockReturnValue({
      habitsQuery: statsQuery([], { isLoading: false, isError: false }),
      logsQuery: statsQuery([], { isLoading: false, isError: false }),
      versionsQuery: statsQuery([], { isLoading: false, isError: false }),
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(<HabitsPage />, { wrapper });

    expect(screen.getByText("No habits yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first habit" })).toBeInTheDocument();
  });

  it("renders rows with streak and completion from version-aware stats", () => {
    mockedStats.mockReturnValue({
      habitsQuery: statsQuery([HABIT], { isLoading: false, isError: false }),
      logsQuery: statsQuery([], { isLoading: false, isError: false }),
      versionsQuery: statsQuery([], { isLoading: false, isError: false }),
      rows: [
        {
          habit: HABIT,
          stats: { planned: 4, completed: 3, missed: 1, completionRate: 75, currentStreak: 3, bestStreak: 3 },
        },
      ],
      todayKey: "2026-11-05",
    } as never);

    render(<HabitsPage />, { wrapper });

    expect(screen.getByText("Read 20 minutes")).toBeInTheDocument();
    expect(screen.getByText("3-days streak · best 3")).toBeInTheDocument();
    expect(screen.getByText("75% completion")).toBeInTheDocument();
  });

  it("pauses an active habit through the status hook", () => {
    const mutate = vi.fn();
    mockedSetStatus.mockReturnValue({ mutate, isPending: false, isError: false } as never);
    mockedStats.mockReturnValue({
      habitsQuery: statsQuery([HABIT], { isLoading: false, isError: false }),
      logsQuery: statsQuery([], { isLoading: false, isError: false }),
      versionsQuery: statsQuery([], { isLoading: false, isError: false }),
      rows: [
        {
          habit: HABIT,
          stats: { planned: 0, completed: 0, missed: 0, completionRate: null, currentStreak: 0, bestStreak: 0 },
        },
      ],
      todayKey: "2026-11-05",
    } as never);

    render(<HabitsPage />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Pause Read 20 minutes" }));
    expect(mutate).toHaveBeenCalledWith({ id: "h1", status: "paused" });
  });
});
