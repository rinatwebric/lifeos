import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Goal } from "@/types/domain";

import { GoalsPage } from "./GoalsPage";
import {
  useAllMilestones,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useTaskCountForGoal,
  useUpdateGoal,
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

function stubDefaults(): {
  createMutate: ReturnType<typeof vi.fn>;
  updateMutate: ReturnType<typeof vi.fn>;
  updateMutateAsync: ReturnType<typeof vi.fn>;
  deleteMutateAsync: ReturnType<typeof vi.fn>;
  refetch: ReturnType<typeof vi.fn>;
} {
  const createMutate = vi.fn().mockResolvedValue({ ...GOAL });
  const updateMutate = vi.fn();
  const updateMutateAsync = vi.fn().mockResolvedValue({ ...GOAL });
  const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
  const refetch = vi.fn();

  vi.mocked(useGoals).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch,
  } as unknown as ReturnType<typeof useGoals>);
  vi.mocked(useAllMilestones).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useAllMilestones>);
  vi.mocked(useCreateGoal).mockReturnValue({
    mutateAsync: createMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateGoal>);
  vi.mocked(useUpdateGoal).mockReturnValue({
    mutate: updateMutate,
    mutateAsync: updateMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateGoal>);
  vi.mocked(useDeleteGoal).mockReturnValue({
    mutateAsync: deleteMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteGoal>);
  vi.mocked(useTaskCountForGoal).mockReturnValue({
    data: 0,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTaskCountForGoal>);

  return { createMutate, updateMutate, updateMutateAsync, deleteMutateAsync, refetch };
}

function stubGoals(goals: Goal[]) {
  vi.mocked(useGoals).mockReturnValue({
    data: goals,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGoals>);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubDefaults();
});

describe("GoalsPage", () => {
  it("shows an empty state with a next-step CTA when there are no goals", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);

    expect(screen.getByText("No goals yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create your first goal" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("New goal")).toBeInTheDocument();
  });

  it("renders the goal list with stored manual progress", () => {
    stubGoals([GOAL]);
    render(<GoalsPage />);

    expect(screen.getByRole("heading", { name: "Learn piano" })).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progress for Learn piano" }),
    ).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByText("20% complete", { exact: false })).toBeInTheDocument();
  });

  it("derives progress from milestones when progressMode is milestones", () => {
    stubGoals([{ ...GOAL, progressMode: "milestones", progress: 5 }]);
    vi.mocked(useAllMilestones).mockReturnValue({
      data: [
        { goalId: "g1", status: "completed" },
        { goalId: "g1", status: "pending" },
      ],
    } as unknown as ReturnType<typeof useAllMilestones>);
    render(<GoalsPage />);

    expect(
      screen.getByRole("progressbar", { name: "Progress for Learn piano" }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("50% complete", { exact: false })).toBeInTheDocument();
  });

  it("shows a validation error under the title when it is empty", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "New goal" }));
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
  });

  it("rejects a target date before the start date with a field-level message", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "New goal" }));
    await user.type(screen.getByLabelText("Title", { exact: false }), "Run a marathon");

    const startDate = screen.getByLabelText("Start date", { exact: false });
    const targetDate = screen.getByLabelText("Target date", { exact: false });
    await user.clear(startDate);
    await user.type(startDate, "2026-12-01");
    await user.clear(targetDate);
    await user.type(targetDate, "2026-11-01");

    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(
      await screen.findByText("Target date must be on or after the start date."),
    ).toBeInTheDocument();
  });

  it("creates a goal with the form values and closes the dialog", async () => {
    const { createMutate } = stubDefaults();
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "New goal" }));
    await user.type(screen.getByLabelText("Title", { exact: false }), "Run a marathon");
    await user.click(screen.getByRole("button", { name: "Create goal" }));

    expect(await screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createMutate).toHaveBeenCalledOnce();
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Run a marathon",
        category: "other",
        priority: "medium",
        status: "not_started",
        progressMode: "manual",
      }),
    );
  });

  it("shows the linked task count and does not delete without confirmation", async () => {
    const { deleteMutateAsync } = stubDefaults();
    stubGoals([GOAL]);
    vi.mocked(useTaskCountForGoal).mockReturnValue({
      data: 3,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTaskCountForGoal>);
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "Delete Learn piano" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(
        "3 tasks will stay but lose the link to this goal. This cannot be undone.",
      ),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes the goal after confirmation", async () => {
    const { deleteMutateAsync } = stubDefaults();
    stubGoals([GOAL]);
    vi.mocked(useTaskCountForGoal).mockReturnValue({
      data: 1,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useTaskCountForGoal>);
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "Delete Learn piano" }));
    expect(
      screen.getByText(
        "1 task will stay but lose the link to this goal. This cannot be undone.",
      ),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteMutateAsync).toHaveBeenCalledWith("g1");
  });

  it("archives the goal via updateGoal with status archived", async () => {
    const { updateMutate } = stubDefaults();
    stubGoals([GOAL]);
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(updateMutate).toHaveBeenCalledWith({ id: "g1", patch: { status: "archived" } });
  });

  it("passes the selected status filter to useGoals", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.selectOptions(screen.getByLabelText("Status"), "active");

    expect(vi.mocked(useGoals)).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("shows an inline error with Retry that refetches", async () => {
    const refetch = vi.fn();
    vi.mocked(useGoals).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useGoals>);
    const user = userEvent.setup();
    render(<GoalsPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load goals.");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("closes the delete dialog on Escape without mutating", async () => {
    // jsdom ships a native `showModal`, but has no native Esc handling:
    // simulate an environment without it so the polyfill keydown path runs.
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    const originalShowModal = proto["showModal"];
    proto["showModal"] = undefined;
    try {
      const { deleteMutateAsync } = stubDefaults();
      stubGoals([GOAL]);
      const user = userEvent.setup();
      render(<GoalsPage />);

      await user.click(screen.getByRole("button", { name: "Delete Learn piano" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(deleteMutateAsync).not.toHaveBeenCalled();
      // Focus returns to the trigger that opened the dialog.
      expect(document.activeElement).toHaveAccessibleName("Delete Learn piano");
    } finally {
      proto["showModal"] = originalShowModal;
    }
  });

  it("shows a no-match state with Clear filters that resets the query", async () => {
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.selectOptions(screen.getByLabelText("Status"), "completed");

    expect(await screen.findByText("No goals match these filters")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(vi.mocked(useGoals)).toHaveBeenLastCalledWith({});
  });

  it("renders loading skeletons while goals load", () => {
    vi.mocked(useGoals).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGoals>);
    render(<GoalsPage />);

    expect(screen.getByRole("status", { name: "Loading goals" })).toBeInTheDocument();
  });

  it("prefills the edit form with the selected goal", async () => {
    stubGoals([GOAL]);
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Title", { exact: false })).toHaveValue(
      "Learn piano",
    );
    expect(within(dialog).getByLabelText("Start date", { exact: false })).toHaveValue(
      "2026-11-01",
    );
    expect(within(dialog).getByLabelText("Target date", { exact: false })).toHaveValue(
      "2026-12-01",
    );
    expect(within(dialog).getByLabelText("Progress (%)", { exact: false })).toHaveValue(20);
  });

  it("clears the form after a successful create", async () => {
    stubDefaults();
    const user = userEvent.setup();
    render(<GoalsPage />);

    await user.click(screen.getByRole("button", { name: "New goal" }));
    await user.type(screen.getByLabelText("Title", { exact: false }), "Run a marathon");
    await user.click(screen.getByRole("button", { name: "Create goal" }));
    expect(await screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New goal" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Title", { exact: false })).toHaveValue("");
  });
});
