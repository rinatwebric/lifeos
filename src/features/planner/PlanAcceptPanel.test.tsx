import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences, getProfile } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import type { Task, TimeBlock } from "@/types/domain";

import { applyPlan, createBlock, deleteBlock, listBlocks, updateBlock } from "./api";
import { BLOCK_ERROR_MESSAGES, BlockServiceError } from "./errors";
import { PlanAcceptPanel } from "./PlanAcceptPanel";

vi.mock("./api", () => ({
  applyPlan: vi.fn(),
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  listBlocks: vi.fn(),
  updateBlock: vi.fn(),
}));

vi.mock("@/features/settings/api", () => ({
  getProfile: vi.fn(),
  getPreferences: vi.fn(),
  profileQueryKey: ["profile"],
  preferencesQueryKey: ["preferences"],
}));

vi.mock("@/features/tasks/api", () => ({
  listTasks: vi.fn(),
}));

const TIME_ZONE = "UTC";
const DATE_KEY = "2026-11-04";
const NOW = new Date("2026-11-04T08:00:00.000Z");
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const TASK_TITLE = "Write the report";

const TASK = {
  id: TASK_ID,
  userId: "user-1",
  goalId: null,
  milestoneId: null,
  title: TASK_TITLE,
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

function block(overrides: Partial<TimeBlock> & Pick<TimeBlock, "id">): TimeBlock {
  return {
    userId: "user-1",
    taskId: null,
    title: "Existing",
    startTime: "2026-11-04T08:30:00.000Z",
    endTime: "2026-11-04T09:30:00.000Z",
    blockType: "personal",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderPanel(onClose: () => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const close = onClose;

  render(
    <QueryClientProvider client={queryClient}>
      <PlanAcceptPanel dateKey={DATE_KEY} timeZone={TIME_ZONE} now={NOW} onClose={close} />
    </QueryClientProvider>,
  );

  return { onClose: close };
}

function noWrites(): void {
  expect(applyPlan).not.toHaveBeenCalled();
  expect(createBlock).not.toHaveBeenCalled();
  expect(updateBlock).not.toHaveBeenCalled();
  expect(deleteBlock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue({ timezone: TIME_ZONE } as never);
  vi.mocked(getPreferences).mockResolvedValue({
    wakeUpTime: "07:00",
    sleepTime: "23:00",
    workingHours: {},
    studyHours: {},
    preferredWorkPeriods: {},
    notificationPreferences: {},
  } as never);
  vi.mocked(listTasks).mockResolvedValue([TASK]);
  vi.mocked(listBlocks).mockResolvedValue([]);
  vi.mocked(applyPlan).mockResolvedValue({ blocks: [], mirroredTaskIds: [TASK_ID], skippedTaskIds: [] });
});

describe("PlanAcceptPanel", () => {
  it("shows the computed proposal with editable times", async () => {
    renderPanel();

    expect(await screen.findByText("Plan preview")).toBeInTheDocument();
    expect(screen.getByText("Adjust the times")).toBeInTheDocument();

    // The 60-minute task lands in the first free window after now (08:00).
    const starts = screen.getByLabelText(/^Starts for /);
    expect(starts).toHaveValue("2026-11-04T08:00");
    expect(screen.getByLabelText(/^Ends for /)).toHaveValue("2026-11-04T09:00");
    expect(screen.getByRole("button", { name: "Accept plan" })).toBeEnabled();
  });

  it("reports the task that already has a block instead of planning it twice", async () => {
    vi.mocked(listBlocks).mockResolvedValue([
      block({
        id: "existing",
        taskId: TASK_ID,
        blockType: "task",
        title: TASK_TITLE,
        startTime: "2026-11-04T09:00:00.000Z",
        endTime: "2026-11-04T10:00:00.000Z",
      }),
    ]);
    renderPanel();

    expect(await screen.findByText("Already in your plan")).toBeInTheDocument();
    expect(screen.getByText("Write the report")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    // Nothing new to accept: the only task is already planned.
    expect(screen.getByRole("button", { name: "Accept plan" })).toBeDisabled();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("cancel writes nothing", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await screen.findByText("Plan preview");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    noWrites();
  });

  it("editing the times then cancelling writes nothing", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await screen.findByText("Plan preview");
    fireEvent.change(screen.getByLabelText(/^Starts for /), {
      target: { value: "2026-11-04T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Ends for /), {
      target: { value: "2026-11-04T11:00" },
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    noWrites();
  });

  it("regenerate discards the local edits back to the proposal without writing", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Plan preview");
    const starts = screen.getByLabelText(/^Starts for /);
    fireEvent.change(starts, { target: { value: "2026-11-04T10:00" } });
    expect(starts).toHaveValue("2026-11-04T10:00");

    await user.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(screen.getByLabelText(/^Starts for /)).toHaveValue("2026-11-04T08:00");
    noWrites();
  });

  it("accept writes the edited slots and closes the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await screen.findByText("Plan preview");
    fireEvent.change(screen.getByLabelText(/^Starts for /), {
      target: { value: "2026-11-04T10:00" },
    });
    fireEvent.change(screen.getByLabelText(/^Ends for /), {
      target: { value: "2026-11-04T11:00" },
    });

    await user.click(screen.getByRole("button", { name: "Accept plan" }));

    await waitFor(() => {
      expect(applyPlan).toHaveBeenCalledTimes(1);
    });
    expect(applyPlan).toHaveBeenCalledWith({
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      allowConflicts: false,
      slots: [
        {
          taskId: TASK_ID,
          title: TASK_TITLE,
          start: "2026-11-04T10:00:00.000Z",
          end: "2026-11-04T11:00:00.000Z",
        },
      ],
    });
    expect(createBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a conflicting edit needs an explicit confirmation before accept", async () => {
    const user = userEvent.setup();
    vi.mocked(listBlocks).mockResolvedValue([block({ id: "existing" })]);
    renderPanel();

    // The proposal avoids the 08:30–09:30 block (09:30–10:30); the user drags
    // the start into it.
    await screen.findByText("Plan preview");
    expect(screen.getByLabelText(/^Starts for /)).toHaveValue("2026-11-04T09:30");

    fireEvent.change(screen.getByLabelText(/^Starts for /), {
      target: { value: "2026-11-04T09:00" },
    });
    expect(
      await screen.findByText(
        "This planned time overlaps with another block. Both stay in your plan and are marked as overlapping.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept plan" }));

    expect(await screen.findByText("Tick the box above to keep this plan at these times."))
      .toBeInTheDocument();
    expect(applyPlan).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", { name: "Keep this plan at these times anyway" }),
    );
    await user.click(screen.getByRole("button", { name: "Accept plan" }));

    await waitFor(() => {
      expect(applyPlan).toHaveBeenCalledTimes(1);
    });
    expect(applyPlan).toHaveBeenCalledWith({
      dateKey: DATE_KEY,
      timeZone: TIME_ZONE,
      allowConflicts: true,
      slots: [
        {
          taskId: TASK_ID,
          title: TASK_TITLE,
          start: "2026-11-04T09:00:00.000Z",
          end: "2026-11-04T10:30:00.000Z",
        },
      ],
    });
  });

  it("drops the confirmation when the times change again", async () => {
    const user = userEvent.setup();
    vi.mocked(listBlocks).mockResolvedValue([block({ id: "existing" })]);
    renderPanel();

    await screen.findByText("Plan preview");
    const starts = screen.getByLabelText(/^Starts for /);
    fireEvent.change(starts, { target: { value: "2026-11-04T09:00" } });
    await screen.findByText(/overlaps with another block/);

    await user.click(
      screen.getByRole("checkbox", { name: "Keep this plan at these times anyway" }),
    );

    // Another conflicting interval: the old consent must not carry over.
    fireEvent.change(starts, { target: { value: "2026-11-04T09:15" } });
    await user.click(screen.getByRole("button", { name: "Accept plan" }));

    expect(await screen.findByText("Tick the box above to keep this plan at these times."))
      .toBeInTheDocument();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("a failed accept keeps the panel open with the coded message", async () => {
    const user = userEvent.setup();
    vi.mocked(applyPlan).mockRejectedValue(
      new BlockServiceError("forbidden", BLOCK_ERROR_MESSAGES.forbidden),
    );
    const { onClose } = renderPanel();

    await screen.findByText("Plan preview");
    await user.click(screen.getByRole("button", { name: "Accept plan" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "You do not have access to change this block. Sign in again and retry.",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
