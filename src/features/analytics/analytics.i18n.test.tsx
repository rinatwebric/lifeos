import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nContext } from "@/lib/i18n/I18nContext";
import { en as enMessages } from "@/lib/i18n/dictionaries/en";
import { ru as ruMessages } from "@/lib/i18n/dictionaries/ru";
import { useGoals } from "@/features/goals/hooks";
import { useHabitsWithStats } from "@/features/habits/hooks";
import { getProfile } from "@/features/settings/api";
import { useTasks } from "@/features/tasks/hooks";
import type { Goal, Habit, Task } from "@/types/domain";

import { AnalyticsPage } from "./AnalyticsPage";
import { buildWeeklyReview } from "./summary";

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

function enProvider(children: ReactNode) {
  return (
    <I18nContext.Provider
      value={{
        locale: "en",
        intlLocale: "en-US",
        messages: enMessages,
        isKyFallback: false,
        setLocale: () => {},
        syncStatus: "idle",
        syncError: null,
        retrySync: () => {},
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

function ruProvider(children: ReactNode) {
  return (
    <I18nContext.Provider
      value={{
        locale: "ru",
        intlLocale: "ru-RU",
        messages: ruMessages,
        isKyFallback: false,
        setLocale: () => {},
        syncStatus: "idle",
        syncError: null,
        retrySync: () => {},
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function idle(data: unknown, flags: object = {}) {
  return { data, refetch: vi.fn(), ...flags };
}

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    userId: "u1",
    goalId: null,
    milestoneId: null,
    title: "Task",
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
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function emptyHabitsBundle() {
  return {
    habitsQuery: idle([], { isLoading: false, isError: false }),
    logsQuery: idle([], {}),
    versionsQuery: idle([], {}),
    rows: [],
    todayKey: "2026-11-05",
  } as never;
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

describe("buildWeeklyReview RU", () => {
  const habit = (id: string): Habit => ({
    id,
    userId: "u1",
    title: id,
    description: null,
    frequency: "daily",
    weekdays: [],
    targetCount: 1,
    reminderTime: null,
    startDate: "2026-11-02",
    status: "active",
    createdAt: "2026-11-02T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
  });

  it("renders Russian lines with 1/2/5 overdue and goal plurals", () => {
    const tasks = [
      task({ id: "done", status: "completed", completedAt: "2026-11-03T10:00:00.000Z", dueDate: "2026-11-03" }),
      task({ id: "open", status: "todo", dueDate: "2026-11-06" }),
      task({ id: "late", status: "todo", dueDate: "2026-10-30" }),
    ];
    const goals: Goal[] = [1, 2].map((n) => ({
      id: `g${n}`,
      userId: "u1",
      title: `Goal ${n}`,
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
    }));

    const lines = buildWeeklyReview(
      {
        tasks,
        goals,
        habitRows: [
          {
            habit: habit("h1"),
            stats: { planned: 3, completed: 2, missed: 1, completionRate: 67, currentStreak: 1, bestStreak: 2 },
          },
        ],
        weekFrom: "2026-11-02",
        todayKey: "2026-11-05",
        timeZone: "UTC",
      },
      "ru",
      ruMessages.weeklyReview,
    ).join("\n");

    expect(lines).toContain("Выполнено 1 из 2 задач недели.");
    expect(lines).toContain("1 просроченная задача ждёт новую дату");
    expect(lines).toContain("привычки: выполнено 2 из 3 запланированных дней.");
    expect(lines).toContain("2 активные цели, средний прогресс 50%.");
  });

  it("uses 5-form plurals in Russian", () => {
    const late = Array.from({ length: 5 }, (_, i) =>
      task({ id: `late${i}`, status: "todo", dueDate: "2026-10-30" }),
    );
    const lines = buildWeeklyReview(
      {
        tasks: late,
        goals: [],
        habitRows: [],
        weekFrom: "2026-11-02",
        todayKey: "2026-11-05",
        timeZone: "UTC",
      },
      "ru",
      ruMessages.weeklyReview,
    ).join("\n");

    expect(lines).toContain("5 просроченных задач ждут новую дату");
    expect(lines).toContain("На неделю задач к сроку пока нет");
  });

  it("keeps English byte-identical without a dictionary (existing contract)", () => {
    const lines = buildWeeklyReview({
      tasks: [
        task({ id: "done", status: "completed", completedAt: "2026-11-03T10:00:00.000Z", dueDate: "2026-11-03" }),
        task({ id: "open", status: "todo", dueDate: "2026-11-06" }),
      ],
      goals: [],
      habitRows: [],
      weekFrom: "2026-11-02",
      todayKey: "2026-11-05",
      timeZone: "UTC",
    }).join("\n");

    expect(lines).toContain("1 of 2 tasks due this week done.");
  });
});

describe("AnalyticsPage RU", () => {
  it("renders headings, periods, empty states and the review in Russian", () => {
    mockedTasks.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedGoals.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedHabits.mockReturnValue(emptyHabitsBundle());

    render(ruProvider(<AnalyticsPage />), { wrapper });

    expect(screen.getByRole("heading", { name: "Аналитика" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Период аналитики" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Месяц" })).toBeInTheDocument();
    expect(screen.getByText("Задач пока нет — создайте одну, чтобы увидеть выполнение.")).toBeInTheDocument();
    expect(screen.getByText("Пока нечего показать на графике")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Обзор недели" })).toBeInTheDocument();
    expect(
      screen.getByText("На неделю задач к сроку пока нет — добавьте сроки, чтобы увидеть прогресс."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Обязательств по привычкам на неделю пока нет."),
    ).toBeInTheDocument();
  });

  it("shows loading and error states in Russian", () => {
    mockedTasks.mockReturnValue(idle(undefined, { isLoading: true, isError: false }) as never);
    mockedGoals.mockReturnValue(idle(undefined, { isLoading: false, isError: false }) as never);
    mockedHabits.mockReturnValue({
      habitsQuery: idle(undefined, { isLoading: false, isError: false }),
      rows: [],
      todayKey: "2026-11-05",
    } as never);

    render(ruProvider(<AnalyticsPage />), { wrapper });

    expect(screen.getByLabelText("Загрузка аналитики")).toBeInTheDocument();
  });

  it("switches an already open page EN → RU without reload", () => {
    mockedTasks.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedGoals.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedHabits.mockReturnValue(emptyHabitsBundle());

    const { rerender } = render(enProvider(<AnalyticsPage />), { wrapper });
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();

    mockedTasks.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedGoals.mockReturnValue(idle([], { isLoading: false, isError: false }) as never);
    mockedHabits.mockReturnValue(emptyHabitsBundle());
    rerender(ruProvider(<AnalyticsPage />));

    expect(screen.getByRole("heading", { name: "Аналитика" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Analytics" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Обзор недели" })).toBeInTheDocument();
  });

  it("translates goal categories through the enums dictionary", () => {
    mockedTasks.mockReturnValue(
      idle(
        [task({ id: "t1", goalId: "g1", status: "completed", completedAt: "2026-11-05T10:00:00.000Z", dueDate: "2026-11-05" })],
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
    mockedHabits.mockReturnValue(emptyHabitsBundle());

    render(ruProvider(<AnalyticsPage />), { wrapper });

    expect(screen.getByText("Задачи по категориям целей")).toBeInTheDocument();
    expect(screen.getByText("Выполненные задачи")).toBeInTheDocument();
    expect(screen.getByText("Прогресс целей")).toBeInTheDocument();
  });
});
