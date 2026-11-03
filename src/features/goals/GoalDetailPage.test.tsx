import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Goal, Milestone } from "@/types/domain";

import { GoalDetailPage } from "./GoalDetailPage";
import {
  useCreateGoal,
  useCreateMilestone,
  useDeleteGoal,
  useDeleteMilestone,
  useGoal,
  useMilestones,
  useReorderMilestones,
  useTaskCountForGoal,
  useUpdateGoal,
  useUpdateMilestone,
} from "./hooks";

vi.mock("./hooks", () => ({
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

const GOAL: Goal = {
  id: "g1",
  userId: "u1",
  title: "Learn piano",
  description: "For joy",
  category: "personal_development",
  priority: "medium",
  status: "active",
  startDate: "2026-11-01",
  targetDate: "2026-12-01",
  progress: 0,
  progressMode: "milestones",
  completedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
};

function milestone(overrides: Partial<Milestone> & { id: string }): Milestone {
  return {
    userId: "u1",
    goalId: "g1",
    title: `Step ${overrides.id}`,
    description: null,
    position: 0,
    status: "pending",
    targetDate: null,
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const M1 = milestone({ id: "m1", title: "First", position: 0, status: "pending" });
const M2 = milestone({ id: "m2", title: "Second", position: 1, status: "completed" });
const M3 = milestone({ id: "m3", title: "Third", position: 2, status: "completed" });

function renderDetail(path = "/goals/g1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/goals/:id" element={<GoalDetailPage />} />
        <Route path="/goals" element={<div>Goals list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubAll(goal: Goal | null = GOAL, milestones: Milestone[] = [M1, M2, M3]) {
  const updateMutate = vi.fn();
  const updateMutateAsync = vi.fn().mockResolvedValue({ ...M1 });
  const createMutateAsync = vi.fn().mockResolvedValue({ ...M1 });
  const createMutate = vi.fn();
  const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
  const reorderMutate = vi.fn();

  if (goal) {
    vi.mocked(useGoal).mockReturnValue({
      data: goal,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useGoal>);
  }
  vi.mocked(useMilestones).mockReturnValue({
    data: milestones,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMilestones>);

  vi.mocked(useUpdateMilestone).mockReturnValue({
    mutate: updateMutate,
    mutateAsync: updateMutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useUpdateMilestone>);
  vi.mocked(useCreateMilestone).mockReturnValue({
    mutate: createMutate,
    mutateAsync: createMutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useCreateMilestone>);
  vi.mocked(useDeleteMilestone).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: deleteMutateAsync,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useDeleteMilestone>);
  vi.mocked(useReorderMilestones).mockReturnValue({
    mutate: reorderMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useReorderMilestones>);

  vi.mocked(useCreateGoal).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateGoal>);
  vi.mocked(useUpdateGoal).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ ...GOAL }),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateGoal>);
  vi.mocked(useDeleteGoal).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteGoal>);
  vi.mocked(useTaskCountForGoal).mockReturnValue({
    data: 0,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTaskCountForGoal>);

  return { updateMutate, updateMutateAsync, createMutateAsync, deleteMutateAsync, reorderMutate };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubAll();
});

describe("GoalDetailPage", () => {
  it("renders milestones in position order even when the query returns them shuffled", () => {
    stubAll(GOAL, [M3, M1, M2]);
    renderDetail();

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toHaveAccessibleName("Mark First as completed");
    expect(boxes[1]).toHaveAccessibleName("Mark Second as pending");
    expect(boxes[2]).toHaveAccessibleName("Mark Third as pending");
  });

  it("toggles a pending milestone with status completed", async () => {
    const { updateMutate } = stubAll();
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("checkbox", { name: "Mark First as completed" }));

    expect(updateMutate).toHaveBeenCalledWith({
      id: "m1",
      goalId: "g1",
      patch: { status: "completed" },
    });
  });

  it("derives progress from milestones via calculateGoalProgress", () => {
    stubAll(GOAL, [M1, M2, M3]);
    renderDetail();

    expect(
      screen.getByRole("progressbar", { name: "Progress for Learn piano" }),
    ).toHaveAttribute("aria-valuenow", "67");
    expect(screen.getByText("67% complete", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("from milestones", { exact: false })).toBeInTheDocument();
  });

  it("shows the empty state with the exact hint when there are no milestones", () => {
    stubAll(GOAL, []);
    renderDetail();

    expect(
      screen.getByText(
        "No milestones yet. Add the first step — progress will be calculated from them.",
      ),
    ).toBeInTheDocument();
  });

  it("adds a milestone by Enter and sends the goalId", async () => {
    const { createMutateAsync } = stubAll(GOAL, [M1]);
    const user = userEvent.setup();
    renderDetail();

    const input = screen.getByLabelText("Add a milestone");
    await user.type(input, "New step{Enter}");

    expect(createMutateAsync).toHaveBeenCalledWith({ goalId: "g1", title: "New step" });
  });

  it("requires confirmation before deleting a milestone", async () => {
    const { deleteMutateAsync } = stubAll();
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: "Delete First" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete First?")).toBeInTheDocument();
    expect(deleteMutateAsync).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete First" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(deleteMutateAsync).toHaveBeenCalledWith({ id: "m1", goalId: "g1" });
  });

  it("sends the full reordered id array when moving a milestone up", async () => {
    const { reorderMutate } = stubAll();
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("button", { name: "Move Second up" }));

    expect(reorderMutate).toHaveBeenCalledWith({
      goalId: "g1",
      orderedIds: ["m2", "m1", "m3"],
    });
  });

  it("disables move-up on the first milestone and move-down on the last", () => {
    stubAll();
    renderDetail();

    expect(screen.getByRole("button", { name: "Move First up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move First down" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Third down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Third up" })).not.toBeDisabled();
  });

  it("shows Goal not found with a back link for an unknown id", () => {
    vi.mocked(useGoal).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useGoal>);

    renderDetail("/goals/unknown");

    expect(screen.getByText("Goal not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← All goals" })).toHaveAttribute("href", "/goals");
    expect(screen.getByRole("link", { name: "Back to goals" })).toHaveAttribute("href", "/goals");
  });

  it("reopens the milestone form with fresh values (open → close → open)", async () => {
    stubAll();
    const user = userEvent.setup();
    renderDetail();

    const list = screen.getByRole("list");
    const editButtons = within(list).getAllByRole("button", { name: "Edit" });

    await user.click(editButtons[0]);
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Title", { exact: false })).toHaveValue("First");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(editButtons[1]);
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Title", { exact: false })).toHaveValue("Second");
  });

  it("shows the manual-mode hint that opens Edit", async () => {
    stubAll({ ...GOAL, progressMode: "manual", progress: 20 }, [M1]);
    const user = userEvent.setup();
    renderDetail();

    expect(screen.getByText("manual", { exact: false })).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Switch this goal to milestone progress to see it update automatically.",
      }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Edit Learn piano")).toBeInTheDocument();
  });

  it("shows an inline error when the toggle mutation fails", async () => {
    stubAll();
    vi.mocked(useUpdateMilestone).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useUpdateMilestone>);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("checkbox", { name: "Mark First as completed" }));

    expect(
      await screen.findByText("Could not update the milestone. Please try again."),
    ).toBeInTheDocument();
  });
});
