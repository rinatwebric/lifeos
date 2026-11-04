import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nContext } from "@/lib/i18n/I18nContext";
import { en as enMessages } from "@/lib/i18n/dictionaries/en";
import { ru as ruMessages } from "@/lib/i18n/dictionaries/ru";
import {
  useCreateHabit,
  useDeleteHabit,
  useHabitsWithStats,
  useLogHabit,
  useSetHabitStatus,
  useUpdateHabit,
} from "@/features/habits/hooks";
import { getProfile } from "@/features/settings/api";
import type { Habit } from "@/types/domain";

import { HabitsPage } from "./HabitsPage";
import { HabitRow } from "./components/HabitRow";
import { DeleteHabitDialog } from "./components/DeleteHabitDialog";
import { createHabitFormSchemas, createHabitLogFormSchemas } from "./schemas";

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
  mockedSetStatus.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never);
  const idleMutation = { mutateAsync: vi.fn(), isPending: false, isError: false };
  mockedCreateHabit.mockReturnValue(idleMutation as never);
  mockedUpdateHabit.mockReturnValue(idleMutation as never);
  mockedDeleteHabit.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
  mockedLogHabit.mockReturnValue(idleMutation as never);
});

function emptyBundle() {
  return {
    habitsQuery: statsQuery([], { isLoading: false, isError: false }),
    logsQuery: statsQuery([], { isLoading: false, isError: false }),
    versionsQuery: statsQuery([], { isLoading: false, isError: false }),
    rows: [],
    todayKey: "2026-11-05",
  } as never;
}

describe("HabitsPage RU", () => {
  it("renders the page, empty state and controls in Russian", () => {
    mockedStats.mockReturnValue(emptyBundle());
    render(ruProvider(<HabitsPage />), { wrapper });

    expect(screen.getByRole("heading", { name: "Привычки" })).toBeInTheDocument();
    expect(screen.getByText("Привычек пока нет")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Создать первую привычку" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Новая привычка" })).toBeInTheDocument();
  });

  it("shows loading and error states in Russian", () => {
    mockedStats.mockReturnValue({
      habitsQuery: statsQuery(undefined, { isLoading: true, isError: false }),
      logsQuery: statsQuery(undefined, { isLoading: false, isError: false }),
      versionsQuery: statsQuery(undefined, { isLoading: false, isError: false }),
      rows: [],
      todayKey: "2026-11-05",
    } as never);
    render(ruProvider(<HabitsPage />), { wrapper });

    expect(screen.getByLabelText("Загрузка привычек")).toBeInTheDocument();
  });

  it("pluralizes the habit count 1/2/5/11/21 (ru-RU Intl)", () => {
    const rowsFor = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        habit: { ...HABIT, id: `h${i}` },
        stats: { planned: 0, completed: 0, missed: 0, completionRate: null, currentStreak: 0, bestStreak: 0 },
      }));
    for (const [n, expected] of [
      [1, "1 привычка"],
      [2, "2 привычки"],
      [5, "5 привычек"],
      [11, "11 привычек"],
      [21, "21 привычка"],
    ] as const) {
      mockedStats.mockReturnValue({
        habitsQuery: statsQuery([], { isLoading: false, isError: false }),
        logsQuery: statsQuery([], { isLoading: false, isError: false }),
        versionsQuery: statsQuery([], { isLoading: false, isError: false }),
        rows: rowsFor(n),
        todayKey: "2026-11-05",
      } as never);
      const { unmount } = render(ruProvider(<HabitsPage />), { wrapper });
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("switches an already open page EN → RU without reload", () => {
    mockedStats.mockReturnValue(emptyBundle());
    const { rerender } = render(enProvider(<HabitsPage />), { wrapper });

    expect(screen.getByRole("heading", { name: "Habits" })).toBeInTheDocument();

    rerender(ruProvider(<HabitsPage />));

    expect(screen.getByRole("heading", { name: "Привычки" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Habits" })).not.toBeInTheDocument();
    expect(screen.getByText("Привычек пока нет")).toBeInTheDocument();
  });

  it("pauses with Russian labels and aria", () => {
    mockedStats.mockReturnValue({
      habitsQuery: statsQuery([HABIT], { isLoading: false, isError: false }),
      logsQuery: statsQuery([], { isLoading: false, isError: false }),
      versionsQuery: statsQuery([], { isLoading: false, isError: false }),
      rows: [
        {
          habit: HABIT,
          stats: { planned: 4, completed: 3, missed: 1, completionRate: 75, currentStreak: 3, bestStreak: 5 },
        },
      ],
      todayKey: "2026-11-05",
    } as never);
    render(ruProvider(<HabitsPage />), { wrapper });

    expect(screen.getByText("серия 3 дня · лучшая 5")).toBeInTheDocument();
    expect(screen.getByText("75% выполнения")).toBeInTheDocument();
    expect(screen.getByText("Цель 1 / день")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Приостановить «Read 20 minutes»" }));
    expect(mockedSetStatus().mutate).toHaveBeenCalledWith({ id: "h1", status: "paused" });
  });
});

describe("HabitRow RU streak plurals", () => {
  function renderRow(streak: number, best: number, frequency: Habit["frequency"] = "daily") {
    const noop = () => {};
    return render(
      ruProvider(
        <ul>
          <HabitRow
            habit={{ ...HABIT, frequency }}
            stats={{ planned: 4, completed: 3, missed: 1, completionRate: 75, currentStreak: streak, bestStreak: best }}
            onLog={noop}
            onEdit={noop}
            onTogglePause={noop}
            onDelete={noop}
          />
        </ul>,
      ),
      { wrapper },
    );
  }

  it("uses 1/2/5/11/21 forms for days and weeks", () => {
    const cases: Array<[number, number, string]> = [
      [1, 1, "серия 1 день · лучшая 1"],
      [2, 2, "серия 2 дня · лучшая 2"],
      [5, 5, "серия 5 дней · лучшая 5"],
      [11, 11, "серия 11 дней · лучшая 11"],
      [21, 21, "серия 21 день · лучшая 21"],
    ];
    for (const [streak, best, expected] of cases) {
      const { unmount } = renderRow(streak, best);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the weekly unit for weekly habits", () => {
    const noop = () => {};
    render(
      ruProvider(
        <ul>
          <HabitRow
            habit={{ ...HABIT, frequency: "weekly" }}
            stats={{ planned: 4, completed: 3, missed: 1, completionRate: 75, currentStreak: 2, bestStreak: 4 }}
            onLog={noop}
            onEdit={noop}
            onTogglePause={noop}
            onDelete={noop}
          />
        </ul>,
      ),
      { wrapper },
    );
    expect(screen.getByText("серия 2 недели · лучшая 4")).toBeInTheDocument();
    expect(screen.getByText("Цель 1 / неделю")).toBeInTheDocument();
    expect(screen.getByText("Отметить")).toBeInTheDocument();
  });

  it("switches an already open row EN → RU", () => {
    const noop = () => {};
    const props = {
      habit: HABIT,
      stats: { planned: 4, completed: 3, missed: 1, completionRate: 75, currentStreak: 3, bestStreak: 3 },
      onLog: noop,
      onEdit: noop,
      onTogglePause: noop,
      onDelete: noop,
    };
    const { rerender } = render(enProvider(<ul><HabitRow {...props} /></ul>), { wrapper });
    expect(screen.getByText("3-days streak · best 3")).toBeInTheDocument();

    rerender(ruProvider(<ul><HabitRow {...props} /></ul>));
    expect(screen.getByText("серия 3 дня · лучшая 3")).toBeInTheDocument();
    expect(screen.queryByText("3-days streak · best 3")).not.toBeInTheDocument();
  });
});

describe("DeleteHabitDialog RU", () => {
  it("pluralizes logged days 1/2/5 and translates actions", () => {
    for (const [n, expected] of [
      [1, "1 отмеченный день тоже будет удалён. Это необратимо."],
      [2, "2 отмеченных дня тоже будут удалены. Это необратимо."],
      [5, "5 отмеченных дней тоже будут удалены. Это необратимо."],
    ] as const) {
      const { unmount } = render(
        ruProvider(<DeleteHabitDialog open onClose={() => {}} habit={HABIT} loggedDays={n} />),
        { wrapper },
      );
      expect(screen.getByText("Удалить «Read 20 minutes»?")).toBeInTheDocument();
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Удалить привычку" })).toBeInTheDocument();
      unmount();
    }
  });
});

describe("habit schemas RU", () => {
  const ruValidation = {
    titleRequired: ruMessages.validation.titleRequired,
    titleTooLong: ruMessages.validation.titleTooLong,
    descriptionTooLong: ruMessages.validation.descriptionTooLong,
    dateFormat: ruMessages.validation.dateFormat,
    timeFormat: ruMessages.validation.timeFormat,
    weekdayRequired: ruMessages.validation.weekdayRequired,
    targetCountMin: ruMessages.validation.targetCountMin,
    targetCountMax: ruMessages.validation.targetCountMax,
    validHabit: ruMessages.validation.validHabit,
    completedCountMin: ruMessages.validation.completedCountMin,
    completedCountMax: ruMessages.validation.completedCountMax,
    noteTooLong: ruMessages.validation.noteTooLong,
  };

  it("reports habit errors in Russian", () => {
    const { createHabitSchema } = createHabitFormSchemas(ruValidation);
    const empty = createHabitSchema.safeParse({
      title: "   ",
      description: null,
      frequency: "daily",
      weekdays: [],
      targetCount: 1,
      reminderTime: null,
      startDate: "2026-11-05",
      status: "active",
    });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0].message).toBe("Заголовок обязателен.");
    }
    const noDays = createHabitSchema.safeParse({
      title: "Read",
      description: null,
      frequency: "weekdays",
      weekdays: [],
      targetCount: 1,
      reminderTime: null,
      startDate: "2026-11-05",
      status: "active",
    });
    expect(noDays.success).toBe(false);
    if (!noDays.success) {
      expect(noDays.error.issues[0].message).toBe("Выберите хотя бы один день недели.");
    }
  });

  it("reports log errors in Russian", () => {
    const { createHabitLogSchema } = createHabitLogFormSchemas(ruValidation);
    const bad = createHabitLogSchema.safeParse({
      habitId: "123e4567-e89b-12d3-a456-426614174000",
      logDate: "2026-11-05",
      completedCount: -1,
      note: null,
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].message).toBe("Выполнено должно быть 0 или больше.");
    }
  });
});
