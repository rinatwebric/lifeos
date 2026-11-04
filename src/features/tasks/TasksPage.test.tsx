import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGoals, useAllMilestones, useMilestones } from "@/features/goals/hooks";
import { getProfile } from "@/features/settings/api";
import {
  useCreateTask,
  useDeleteTask,
  useRescheduleTask,
  useSetTaskStatus,
  useTasks,
  useUpdateTask,
} from "@/features/tasks/hooks";

import { TasksPage } from "./TasksPage";

vi.mock("@/features/tasks/hooks", () => ({
  useTasks: vi.fn(),
  useTask: vi.fn(),
  useCreateTask: vi.fn(),
  useUpdateTask: vi.fn(),
  useSetTaskStatus: vi.fn(),
  useRescheduleTask: vi.fn(),
  useDeleteTask: vi.fn(),
}));

vi.mock("@/features/goals/hooks", () => ({
  useGoals: vi.fn(),
  useGoal: vi.fn(),
  useCreateGoal: vi.fn(),
  useUpdateGoal: vi.fn(),
  useDeleteGoal: vi.fn(),
  useMilestones: vi.fn(),
  useCreateMilestone: vi.fn(),
  useUpdateMilestone: vi.fn(),
  useDeleteMilestone: vi.fn(),
  useReorderMilestones: vi.fn(),
  useTaskCountForGoal: vi.fn(),
  useAllMilestones: vi.fn(),
}));

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  profileQueryKey: ["profile"],
}));

const GOAL_1_ID = "123e4567-e89b-12d3-a456-426614174000";
const GOAL_2_ID = "123e4567-e89b-12d3-a456-426614174001";
const MILESTONE_1_ID = "223e4567-e89b-12d3-a456-426614174000";
const MILESTONE_2_ID = "223e4567-e89b-12d3-a456-426614174001";

const GOAL_1 = {
  id: GOAL_1_ID,
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
};

const GOAL_2 = {
  ...GOAL_1,
  id: GOAL_2_ID,
  title: "Run marathon",
};

const MILESTONE_1 = {
  id: MILESTONE_1_ID,
  userId: "u1",
  goalId: GOAL_1_ID,
  title: "Finish chapter 1",
  description: null,
  position: 0,
  status: "pending",
  targetDate: null,
  completedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

const MILESTONE_2 = {
  ...MILESTONE_1,
  id: MILESTONE_2_ID,
  goalId: GOAL_2_ID,
  title: "Week 1 done",
};

const TASK_OPEN = {
  id: "t1",
  userId: "u1",
  goalId: GOAL_1_ID,
  milestoneId: MILESTONE_1_ID,
  title: "Practice scales",
  description: null,
  priority: "high",
  status: "todo",
  dueDate: "2020-01-05",
  scheduledStart: null,
  scheduledEnd: null,
  estimatedDurationMinutes: null,
  completedAt: null,
  recurrenceRuleId: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

const TASK_DONE = {
  ...TASK_OPEN,
  id: "t2",
  goalId: GOAL_2_ID,
  milestoneId: null,
  title: "Buy shoes",
  status: "completed",
  completedAt: "2026-11-03T00:00:00.000Z",
};

function renderTasksPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TasksPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function stubDefaults() {
  const refetch = vi.fn();
  const createMutateAsync = vi.fn().mockResolvedValue({ ...TASK_OPEN });
  const updateMutateAsync = vi.fn().mockResolvedValue({ ...TASK_OPEN });
  const setStatusMutate = vi.fn();
  const setStatusMutateAsync = vi.fn().mockResolvedValue({ ...TASK_OPEN });
  const rescheduleMutateAsync = vi.fn().mockResolvedValue({ ...TASK_OPEN });
  const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);

  vi.mocked(useTasks).mockReturnValue({
    data: [{ ...TASK_OPEN }, { ...TASK_DONE }],
    isLoading: false,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useTasks>);
  vi.mocked(useGoals).mockReturnValue({
    data: [{ ...GOAL_1 }, { ...GOAL_2 }],
  } as unknown as ReturnType<typeof useGoals>);
  // Row milestone titles come from the single `useAllMilestones` fetch
  // (no per-goal queries in `TaskRow`); the create/edit form still reads
  // per-goal `useMilestones` for its milestone select.
  vi.mocked(useAllMilestones).mockReturnValue({
    data: [
      {
        id: MILESTONE_1_ID,
        goalId: GOAL_1_ID,
        title: "Finish chapter 1",
        status: "pending",
      },
      { id: MILESTONE_2_ID, goalId: GOAL_2_ID, title: "Week 1 done", status: "pending" },
    ],
  } as unknown as ReturnType<typeof useAllMilestones>);
  vi.mocked(useMilestones).mockImplementation(
    (goalId?: string) =>
      ({
        data:
          goalId === GOAL_1_ID
            ? [{ ...MILESTONE_1 }]
            : goalId === GOAL_2_ID
              ? [{ ...MILESTONE_2 }]
              : [],
        isLoading: false,
        isError: false,
      }) as unknown as ReturnType<typeof useMilestones>,
  );
  vi.mocked(getProfile).mockResolvedValue({
    id: "u1",
    timezone: "UTC",
  } as unknown as Awaited<ReturnType<typeof getProfile>>);
  vi.mocked(useCreateTask).mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateTask>);
  vi.mocked(useUpdateTask).mockReturnValue({
    mutateAsync: updateMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateTask>);
  vi.mocked(useSetTaskStatus).mockReturnValue({
    mutate: setStatusMutate,
    mutateAsync: setStatusMutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useSetTaskStatus>);
  vi.mocked(useRescheduleTask).mockReturnValue({
    mutateAsync: rescheduleMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useRescheduleTask>);
  vi.mocked(useDeleteTask).mockReturnValue({
    mutateAsync: deleteMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteTask>);

  return {
    refetch,
    createMutateAsync,
    updateMutateAsync,
    setStatusMutate,
    rescheduleMutateAsync,
    deleteMutateAsync,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubDefaults();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TasksPage", () => {
  it("renders tasks in service order with an N-tasks counter", () => {
    renderTasksPage();

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Practice scales");
    expect(items[1]).toHaveTextContent("Buy shoes");
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
  });

  it("uses the singular counter for one task", () => {
    vi.mocked(useTasks).mockReturnValue({
      data: [{ ...TASK_OPEN }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTasks>);
    renderTasksPage();

    expect(screen.getByText("1 task")).toBeInTheDocument();
  });

  it("toggles the checkbox through setTaskStatus", async () => {
    const { setStatusMutate } = stubDefaults();
    const user = userEvent.setup();
    renderTasksPage();

    await user.click(screen.getByRole("checkbox", { name: "Mark Practice scales as completed" }));

    expect(setStatusMutate).toHaveBeenCalledWith({ id: "t1", status: "completed" });
  });

  it("shows Overdue only for open tasks and keeps completed rows muted in place", () => {
    renderTasksPage();

    expect(screen.getAllByText("Overdue")).toHaveLength(1);
    expect(screen.getByText("Practice scales")).toBeInTheDocument();
    expect(screen.getByText("Buy shoes")).toBeInTheDocument();
    expect(screen.getByText("Buy shoes").className).toMatch(/line-through/);
  });

  it("passes the selected status filter to useTasks", async () => {
    const user = userEvent.setup();
    renderTasksPage();

    await user.selectOptions(screen.getByLabelText("Status"), "completed");

    expect(vi.mocked(useTasks)).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("debounces the search input before querying", () => {
    vi.useFakeTimers();
    renderTasksPage();

    const search = screen.getByLabelText("Search");
    fireEvent.change(search, { target: { value: "scales" } });

    const callsBefore = vi
      .mocked(useTasks)
      .mock.calls.filter(([filters]) => (filters as { search?: string }).search === "scales");
    expect(callsBefore).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(vi.mocked(useTasks)).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "scales" }),
    );
  });

  it("creates a task sending goalId and milestoneId", async () => {
    const { createMutateAsync } = stubDefaults();
    const user = userEvent.setup();
    renderTasksPage();

    await user.click(screen.getByRole("button", { name: "New task" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title", { exact: false }), "Morning run");
    await user.selectOptions(within(dialog).getByLabelText("Goal"), GOAL_1_ID);
    await within(dialog).findByRole("option", { name: "Finish chapter 1" });
    await user.selectOptions(within(dialog).getByLabelText("Milestone"), MILESTONE_1_ID);
    await user.click(within(dialog).getByRole("button", { name: "Create task" }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Morning run",
        goalId: GOAL_1_ID,
        milestoneId: MILESTONE_1_ID,
      }),
    );
    expect(await screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the milestone when the goal changes in the form", async () => {
    stubDefaults();
    const user = userEvent.setup();
    renderTasksPage();

    await user.click(screen.getByRole("button", { name: "New task" }));
    const dialog = await screen.findByRole("dialog");
    const goalSelect = within(dialog).getByLabelText("Goal");
    const milestoneSelect = within(dialog).getByLabelText("Milestone") as HTMLSelectElement;

    await user.selectOptions(goalSelect, GOAL_1_ID);
    await within(dialog).findByRole("option", { name: "Finish chapter 1" });
    await user.selectOptions(milestoneSelect, MILESTONE_1_ID);
    expect(milestoneSelect.value).toBe(MILESTONE_1_ID);

    await user.selectOptions(goalSelect, GOAL_2_ID);

    expect(milestoneSelect.value).toBe("");
    expect(vi.mocked(useMilestones)).toHaveBeenCalledWith(GOAL_2_ID);
  });

  it("reschedules through the dialog with an ISO date", async () => {
    const { rescheduleMutateAsync } = stubDefaults();
    const user = userEvent.setup();
    renderTasksPage();

    const row = screen.getByText("Practice scales").closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Reschedule" }));

    const dialog = await screen.findByRole("dialog");
    const dateInput = within(dialog).getByLabelText("Due date");
    await user.clear(dateInput);
    await user.type(dateInput, "2026-12-01");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(rescheduleMutateAsync).toHaveBeenCalledWith({ id: "t1", dueDate: "2026-12-01" });
  });

  it("deletes only after confirmation", async () => {
    const { deleteMutateAsync } = stubDefaults();
    const user = userEvent.setup();
    renderTasksPage();

    await user.click(screen.getByRole("button", { name: "Delete Practice scales" }));
    const dialog = await screen.findByRole("dialog");
    expect(deleteMutateAsync).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Practice scales" }));
    const confirm = await screen.findByRole("dialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(deleteMutateAsync).toHaveBeenCalledWith({ id: "t1", goalId: GOAL_1_ID });
  });

  it("shows an empty state with a CTA when there are no tasks", async () => {
    vi.mocked(useTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTasks>);
    const user = userEvent.setup();
    renderTasksPage();

    expect(screen.getByText("No tasks yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create your first task" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows a no-match state with Clear filters that resets the query", async () => {
    vi.mocked(useTasks).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTasks>);
    const user = userEvent.setup();
    renderTasksPage();

    await user.selectOptions(screen.getByLabelText("Status"), "completed");
    expect(await screen.findByText("No tasks match these filters")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(vi.mocked(useTasks)).toHaveBeenLastCalledWith({});
  });

  it("shows an inline error with Retry that refetches", async () => {
    const refetch = vi.fn();
    vi.mocked(useTasks).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useTasks>);
    const user = userEvent.setup();
    renderTasksPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load tasks.");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("renders loading skeletons while tasks load", () => {
    vi.mocked(useTasks).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTasks>);
    renderTasksPage();

    expect(screen.getByRole("status", { name: "Loading tasks…" })).toBeInTheDocument();
  });

  it("prefills the edit form with the selected task", async () => {
    stubDefaults();
    const user = userEvent.setup();
    renderTasksPage();

    const row = screen.getByText("Practice scales").closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Title", { exact: false })).toHaveValue("Practice scales");
    expect(within(dialog).getByLabelText("Due date")).toHaveValue("2020-01-05");
  });

  it("loads the profile time zone for overdue through the settings API", () => {
    renderTasksPage();

    expect(vi.mocked(getProfile)).toHaveBeenCalled();
  });
});
