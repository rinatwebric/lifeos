import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGoals } from "@/features/goals/hooks";
import { useHabitsWithStats } from "@/features/habits/hooks";
import { getProfile } from "@/features/settings/api";
import { useTasks } from "@/features/tasks/hooks";

import { AnalyticsPage } from "./AnalyticsPage";

vi.mock("@/features/tasks/hooks", () => ({ useTasks: vi.fn() }));
vi.mock("@/features/goals/hooks", () => ({ useGoals: vi.fn() }));
vi.mock("@/features/habits/hooks", () => ({ useHabitsWithStats: vi.fn() }));
vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
}));

const mockedTasks = vi.mocked(useTasks);
const mockedGoals = vi.mocked(useGoals);
const mockedHabits = vi.mocked(useHabitsWithStats);
const mockedGetProfile = vi.mocked(getProfile);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function idle(data: unknown, flags: object = {}) {
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
});

describe("AnalyticsPage", () => {
  it("shows a loading state", () => {
    mockedTasks.mockReturnValue(idle(undefined, { isLoading: true, isError: false }) as never);
    mockedGoals.mockReturnValue(idle(undefined, { isLoading: false, isError: false }) as never);
    mockedHabits.mockReturnValue({
      habitsQuery: idle(undefined, { isLoading: false, isError: false }),
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(<AnalyticsPage />, { wrapper });

    expect(screen.getByLabelText("Loading analytics")).toBeInTheDocument();
  });

  it("shows empty states instead of zeros when there is nothing to measure", () => {
    mockedTasks.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedGoals.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedHabits.mockReturnValue({
      habitsQuery: idle([], { isLoading: false, isError: false }),
      logsQuery: idle([], {}),
      versionsQuery: idle([], {}),
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(<AnalyticsPage />, { wrapper });

    expect(screen.getByText("No tasks yet — create one to see completion here.")).toBeInTheDocument();
    expect(screen.getByText("No data to chart yet")).toBeInTheDocument();
    expect(screen.queryByText(/0% completion/)).not.toBeInTheDocument();
  });

  it("renders real aggregates, charts and a deterministic weekly review", () => {
    mockedTasks.mockReturnValue(
      idle(
        [
          {
            id: "t1",
            userId: "u1",
            goalId: "g1",
            milestoneId: null,
            title: "Ship it",
            description: null,
            priority: "high",
            status: "completed",
            dueDate: "2026-11-03",
            scheduledStart: null,
            scheduledEnd: null,
            estimatedDurationMinutes: null,
            completedAt: "2026-11-03T10:00:00.000Z",
            recurrenceRuleId: null,
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-03T10:00:00.000Z",
          },
        ],
        { isLoading: false, isError: false },
      ) as never,
    );
    mockedGoals.mockReturnValue(
      idle(
        [
          {
            id: "g1",
            userId: "u1",
            title: "Career",
            description: null,
            category: "career",
            priority: "high",
            status: "active",
            startDate: "2026-11-01",
            targetDate: null,
            progress: 50,
            progressMode: "manual",
            completedAt: null,
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
        ],
        { isLoading: false, isError: false },
      ) as never,
    );
    mockedHabits.mockReturnValue({
      habitsQuery: idle([], { isLoading: false, isError: false }),
      logsQuery: idle([], {}),
      versionsQuery: idle([], {}),
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(<AnalyticsPage />, { wrapper });

    expect(screen.getByText("1 of 1 due")).toBeInTheDocument();
    expect(screen.getByText("Completed tasks")).toBeInTheDocument();
    expect(screen.getByText("Tasks by goal category")).toBeInTheDocument();
    expect(screen.getByText("Goal progress")).toBeInTheDocument();
    expect(screen.getByText("Weekly review")).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 tasks due this week done/)).toBeInTheDocument();
  });
});
