import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";
import { useDashboardSchedule, type DashboardSchedule } from "./useDashboardSchedule";
import { listAllMilestones, listGoals } from "@/features/goals/api";
import { getProfile } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import { useSetTaskStatus } from "@/features/tasks/hooks";
import { formatLongDate, toDateKey } from "@/lib/dates";
import type { Goal, Profile, Task } from "@/types/domain";
import type { MilestoneProgressSlice } from "@/features/goals/api";

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
}));

vi.mock("@/features/tasks/api", () => ({
  listTasks: vi.fn(),
  TASK_LIST_LIMIT: 500,
}));

vi.mock("@/features/goals/api", () => ({
  listGoals: vi.fn(),
  listAllMilestones: vi.fn(),
}));

vi.mock("@/features/tasks/hooks", () => ({
  useSetTaskStatus: vi.fn(),
}));

// The schedule card reads its own hook; stubbing it keeps this file on the
// dashboard's own data flow (no blocks request leaves the test).
vi.mock("./useDashboardSchedule", () => ({
  useDashboardSchedule: vi.fn(),
}));

const TIME_ZONE = "Asia/Bishkek";

function todayKey(): string {
  return toDateKey(new Date(), TIME_ZONE);
}

function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day, 12) + deltaDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    fullName: "Alex",
    avatarUrl: null,
    timezone: TIME_ZONE,
    language: "en",
    theme: "light",
    onboardedAt: "2026-11-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

let taskSeq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  taskSeq += 1;
  return {
    id: `task-${taskSeq}`,
    userId: "u1",
    goalId: null,
    milestoneId: null,
    title: `Task ${taskSeq}`,
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
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    userId: "u1",
    title: "Learn piano",
    description: null,
    category: "personal_development",
    priority: "medium",
    status: "active",
    startDate: "2026-11-01",
    targetDate: "2026-12-01",
    progress: 20,
    progressMode: "manual",
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

function makeSlice(overrides: Partial<MilestoneProgressSlice> = {}): MilestoneProgressSlice {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    goalId: "goal-1",
    title: "Milestone",
    status: "pending",
    ...overrides,
  };
}

interface DashboardStub {
  profile?: Profile;
  todayTasks?: Task[];
  todoTasks?: Task[];
  goals?: Goal[];
  slices?: MilestoneProgressSlice[];
  schedule?: DashboardSchedule;
}

function makeSchedule(overrides: Partial<DashboardSchedule> = {}): DashboardSchedule {
  return {
    blocks: [],
    totals: { task: 0, break: 0, personal: 0, scheduled: 0 },
    dayBlockCount: 0,
    isEmpty: true,
    isAllPast: false,
    ...overrides,
  };
}

function stubDashboard(stub: DashboardStub = {}): { setStatusMutate: ReturnType<typeof vi.fn> } {
  const setStatusMutate = vi.fn();
  vi.mocked(getProfile).mockResolvedValue(stub.profile ?? makeProfile());
  vi.mocked(listTasks).mockImplementation((filters) => {
    if (filters?.statuses !== undefined || filters?.status !== undefined) {
      return Promise.resolve(stub.todoTasks ?? []);
    }
    if (filters?.dueAfter !== undefined || filters?.dueBefore !== undefined) {
      return Promise.resolve(stub.todayTasks ?? []);
    }
    return Promise.resolve([]);
  });
  vi.mocked(listGoals).mockResolvedValue(stub.goals ?? []);
  vi.mocked(listAllMilestones).mockResolvedValue(stub.slices ?? []);
  vi.mocked(useSetTaskStatus).mockReturnValue({
    mutate: setStatusMutate,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSetTaskStatus>);
  vi.mocked(useDashboardSchedule).mockReturnValue({
    dateKey: todayKey(),
    timeZone: TIME_ZONE,
    schedule: stub.schedule ?? makeSchedule(),
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  });
  return { setStatusMutate };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  taskSeq = 0;
});

describe("DashboardPage", () => {
  it("greets the user by profile name", async () => {
    stubDashboard();
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Welcome back, Alex" })).toBeInTheDocument();
  });

  it("shows the date in the profile time zone", async () => {
    stubDashboard();
    renderDashboard();

    await screen.findByRole("heading", { name: "Welcome back, Alex" });
    const expected = `${formatLongDate(new Date(), TIME_ZONE)} · times shown in ${TIME_ZONE}`;
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("shows an empty state instead of 0% on an empty day", async () => {
    stubDashboard({ todayTasks: [], todoTasks: [], goals: [], slices: [] });
    renderDashboard();

    expect(
      await screen.findByText("Nothing planned for today — add a task to get started"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("progressbar", { name: "Today's progress" }),
    ).not.toBeInTheDocument();
  });

  it("computes daily progress from completed over total", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [
        makeTask({ id: "t1", title: "One", status: "completed", dueDate: today }),
        makeTask({ id: "t2", title: "Two", status: "todo", dueDate: today }),
        makeTask({ id: "t3", title: "Three", status: "todo", dueDate: today }),
        makeTask({ id: "t4", title: "Four", status: "todo", dueDate: today }),
      ],
      todoTasks: [],
      goals: [],
      slices: [],
    });
    renderDashboard();

    expect(await screen.findAllByText("Completed 1 of 4 tasks today")).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "Today's progress" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
  });

  it("lists only tasks due today in the profile time zone", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [makeTask({ id: "t-today", title: "Today work", dueDate: today })],
      todoTasks: [
        makeTask({ id: "t-tomorrow", title: "Tomorrow work", dueDate: shiftDateKey(today, 1) }),
      ],
      goals: [],
      slices: [],
    });
    renderDashboard();

    expect(await screen.findByText("Today work")).toBeInTheDocument();
    expect(screen.queryByText("Tomorrow work")).not.toBeInTheDocument();
  });

  it("derives active goal progress from milestones with the remainder", async () => {
    stubDashboard({
      todayTasks: [],
      todoTasks: [],
      goals: [makeGoal({ progressMode: "milestones", progress: 5 })],
      slices: [
        makeSlice({ id: "m1", status: "completed" }),
        makeSlice({ id: "m2", status: "pending" }),
        makeSlice({ id: "m3", status: "pending" }),
        makeSlice({ id: "m4", status: "pending" }),
      ],
    });
    renderDashboard();

    const bar = await screen.findByRole("progressbar", { name: "Progress for Learn piano" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText(/3 of 4 milestones remaining/)).toBeInTheDocument();
  });

  it("flags goals without milestones and surfaces them in insights", async () => {
    stubDashboard({
      todayTasks: [],
      todoTasks: [],
      goals: [makeGoal()],
      slices: [],
    });
    renderDashboard();

    expect(await screen.findByText(/No milestones yet/)).toBeInTheDocument();
    expect(await screen.findByText("1 goal has no milestones yet")).toBeInTheDocument();
  });

  it("surfaces an overdue task in insights", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [],
      todoTasks: [makeTask({ id: "t-old", title: "Old work", dueDate: shiftDateKey(today, -2) })],
      goals: [makeGoal()],
      slices: [makeSlice({ status: "completed" })],
    });
    renderDashboard();

    expect(await screen.findByText("1 task is overdue")).toBeInTheDocument();
  });

  it("hides the insights block when there is nothing to report", async () => {
    stubDashboard({
      todayTasks: [],
      todoTasks: [],
      goals: [makeGoal()],
      slices: [makeSlice({ status: "completed" })],
    });
    renderDashboard();

    await screen.findByRole("heading", { name: "Welcome back, Alex" });
    await screen.findByText(/0 of 1 milestones remaining/);
    expect(screen.queryByRole("heading", { name: "Insights" })).not.toBeInTheDocument();
    expect(screen.queryByText("No insights")).not.toBeInTheDocument();
  });

  it("offers the planner from an empty schedule card", async () => {
    stubDashboard();
    renderDashboard();

    const heading = await screen.findByRole("heading", { name: "Schedule" });
    const card = heading.closest("section") as HTMLElement;
    expect(within(card).getByText("Nothing scheduled today")).toBeInTheDocument();
    expect(
      within(card).getByText(/Time blocks you plan for today show up here/),
    ).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Open planner" })).toHaveAttribute(
      "href",
      "/planner",
    );
  });

  it("toggles a dashboard task through setTaskStatus", async () => {
    const today = todayKey();
    const { setStatusMutate } = stubDashboard({
      todayTasks: [makeTask({ id: "t1", title: "Today work", dueDate: today })],
      todoTasks: [],
      goals: [],
      slices: [],
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(
      await screen.findByRole("checkbox", { name: "Mark Today work as completed" }),
    );

    expect(setStatusMutate).toHaveBeenCalledWith({ id: "t1", status: "completed" });
  });

  it("keeps today's tasks visible when the goals request fails", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [makeTask({ id: "t1", title: "Today work", dueDate: today })],
      todoTasks: [],
      goals: [],
      slices: [],
    });
    vi.mocked(listGoals).mockRejectedValue(new Error("goals down"));
    renderDashboard();

    expect(await screen.findByText("Today work")).toBeInTheDocument();
    expect(await screen.findByText("Could not load goals. Please try again.")).toBeInTheDocument();
  });

  it("retries today's tasks after a failure", async () => {
    stubDashboard({ todayTasks: [], todoTasks: [], goals: [], slices: [] });
    vi.mocked(listTasks).mockImplementation((filters) => {
      if (filters?.statuses !== undefined || filters?.status !== undefined) {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error("tasks down"));
    });
    const user = userEvent.setup();
    renderDashboard();

    const alerts = await screen.findAllByText("Could not load today's tasks. Please try again.");
    expect(alerts.length).toBeGreaterThan(0);
    const callsBefore = vi.mocked(listTasks).mock.calls.length;

    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]);

    expect(vi.mocked(listTasks).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("renders the Schedule card with today's next blocks", async () => {
    stubDashboard({
      todayTasks: [],
      todoTasks: [],
      goals: [],
      slices: [],
      schedule: makeSchedule({
        blocks: [
          {
            id: "block-1",
            blockType: "task",
            title: "Deep work",
            taskId: "task-1",
            start: "2026-11-04T07:00:00.000Z",
            end: "2026-11-04T07:30:00.000Z",
            startLabel: "13:00",
            endLabel: "13:30",
            durationMinutes: 30,
          },
        ],
        totals: { task: 30, break: 0, personal: 0, scheduled: 30 },
        dayBlockCount: 1,
        isEmpty: false,
      }),
    });
    renderDashboard();

    expect(await screen.findByText("Deep work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open planner" })).toHaveAttribute("href", "/planner");
    expect(vi.mocked(useDashboardSchedule)).toHaveBeenCalled();
  });

  it("links each active goal to its detail page", async () => {
    stubDashboard({ todayTasks: [], todoTasks: [], goals: [makeGoal()], slices: [] });
    renderDashboard();

    const link = await screen.findByRole("link", { name: "Learn piano" });
    expect(link).toHaveAttribute("href", "/goals/goal-1");
  });

  it("shows priority badges only for high and critical tasks", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [
        makeTask({ id: "t-low", title: "Calm work", priority: "medium", dueDate: today }),
        makeTask({ id: "t-high", title: "Urgent work", priority: "high", dueDate: today }),
      ],
      todoTasks: [],
      goals: [],
      slices: [],
    });
    renderDashboard();

    expect(await screen.findByText("Urgent work")).toBeInTheDocument();
    expect(screen.getByText("High priority")).toBeInTheDocument();
    expect(screen.queryByText("Medium priority")).not.toBeInTheDocument();
  });

  it("counts an overdue in_progress task in insights", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [],
      todoTasks: [
        makeTask({
          id: "t-prog",
          title: "Ongoing work",
          status: "in_progress",
          dueDate: shiftDateKey(today, -1),
        }),
      ],
      goals: [makeGoal()],
      slices: [makeSlice({ status: "completed" })],
    });
    renderDashboard();

    expect(await screen.findByText("1 task is overdue")).toBeInTheDocument();
  });

  it("hides cancelled tasks from Today's tasks and keeps 100% progress", async () => {
    const today = todayKey();
    stubDashboard({
      todayTasks: [
        makeTask({ id: "t-done", title: "Done work", status: "completed", dueDate: today }),
        makeTask({
          id: "t-cancelled",
          title: "Cancelled work",
          status: "cancelled",
          dueDate: today,
        }),
      ],
      todoTasks: [],
      goals: [],
      slices: [],
    });
    renderDashboard();

    expect(await screen.findByText("Done work")).toBeInTheDocument();
    expect(screen.queryByText("Cancelled work")).not.toBeInTheDocument();
    expect(await screen.findAllByText("Completed 1 of 1 tasks today")).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "Today's progress" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});
