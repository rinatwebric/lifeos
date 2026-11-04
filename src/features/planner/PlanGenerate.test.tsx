import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences, getProfile } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import type { Task } from "@/types/domain";

import { applyPlan, createBlock, deleteBlock, listBlocks, updateBlock } from "./api";
import { PlannerPage } from "./PlannerPage";
import { buildPlannerDay, usePlannerDay } from "./usePlannerDay";
import type * as PlannerDayModule from "./usePlannerDay";
import { buildPlannerWeek, usePlannerWeek } from "./usePlannerWeek";
import type * as PlannerWeekModule from "./usePlannerWeek";

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
  getPreferences: vi.fn(),
  preferencesQueryKey: ["preferences"],
}));

vi.mock("./api", () => ({
  applyPlan: vi.fn(),
  listBlocks: vi.fn(),
  createBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

vi.mock("@/features/tasks/api", () => ({ listTasks: vi.fn() }));

vi.mock("./usePlannerDay", async (importOriginal) => {
  const actual = await importOriginal<typeof PlannerDayModule>();

  return { ...actual, usePlannerDay: vi.fn() };
});

vi.mock("./usePlannerWeek", async (importOriginal) => {
  const actual = await importOriginal<typeof PlannerWeekModule>();

  return { ...actual, usePlannerWeek: vi.fn() };
});

const TIME_ZONE = "UTC";
const DATE_KEY = "2026-11-04";
const NOW = new Date("2026-11-04T08:00:00.000Z");

const TASK = {
  id: "11111111-1111-4111-8111-111111111111",
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
  estimatedDurationMinutes: 60,
  completedAt: null,
  recurrenceRuleId: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
} as unknown as Task;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/planner?view=day&date=${DATE_KEY}`]}>
        <PlannerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listBlocks).mockResolvedValue([]);
  vi.mocked(listTasks).mockResolvedValue([TASK]);
  vi.mocked(getPreferences).mockResolvedValue({
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
    preferredWorkPeriods: {},
    notificationPreferences: {},
  } as never);
  vi.mocked(getProfile).mockResolvedValue({ timezone: TIME_ZONE } as never);
  const day = buildPlannerDay({
    blocks: [],
    dateKey: DATE_KEY,
    timeZone: TIME_ZONE,
    now: NOW,
    wakeUpTime: "07:00",
    sleepTime: "23:00",
  });
  vi.mocked(usePlannerDay).mockReturnValue({
    day,
    timeZone: TIME_ZONE,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  });
  vi.mocked(usePlannerWeek).mockReturnValue({
    week: buildPlannerWeek({
      blocks: [],
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      now: NOW,
      wakeUpTime: "07:00",
      sleepTime: "23:00",
    }),
    timeZone: TIME_ZONE,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  });
});

describe("PlannerPage plan generation", () => {
  it("opens the preview panel from Generate plan and closes it on Cancel without writing", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByText("Plan preview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate plan" }));

    expect(await screen.findByText("Plan preview")).toBeInTheDocument();
    expect(screen.getByText("Nothing is saved until you accept.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Plan preview")).not.toBeInTheDocument();
    expect(applyPlan).not.toHaveBeenCalled();
    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
    expect(deleteBlock).not.toHaveBeenCalled();
  });
});
