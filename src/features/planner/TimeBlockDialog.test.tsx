import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPreferences } from "@/features/settings/api";
import { listTasks } from "@/features/tasks/api";
import type { Task, TimeBlock } from "@/types/domain";

import { createBlock, listBlocks, updateBlock } from "./api";
import {
  TimeBlockDialog,
  type EditableTimeBlock,
  type TimeBlockDialogProps,
} from "./TimeBlockDialog";

vi.mock("./api", () => ({
  listBlocks: vi.fn(),
  createBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

vi.mock("@/features/tasks/api", () => ({ listTasks: vi.fn() }));

vi.mock("@/features/settings/api", () => ({
  getPreferences: vi.fn(),
  preferencesQueryKey: ["preferences"],
}));

const TIME_ZONE = "UTC";
const DATE_KEY = "2026-11-04";
const NOW = new Date("2026-11-03T08:00:00.000Z");
const TASK_ID = "9f1c7a55-8b47-4e0e-9d8e-2c1f3f4a5b6c";

function makeBlock(overrides: Partial<TimeBlock> & Pick<TimeBlock, "id">): TimeBlock {
  return {
    userId: "user-1",
    taskId: null,
    title: "Block",
    startTime: "2026-11-04T09:00:00.000Z",
    endTime: "2026-11-04T10:00:00.000Z",
    blockType: "personal",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const TASK = {
  id: TASK_ID,
  title: "Write the report",
  status: "todo",
  priority: "medium",
} as unknown as Task;

const EDIT_TARGET: EditableTimeBlock = {
  id: "b1",
  taskId: TASK_ID,
  blockType: "task",
  title: "Report block",
  startTime: "2026-11-04T09:00:00.000Z",
  endTime: "2026-11-04T10:00:00.000Z",
};

function renderDialog(overrides: Partial<TimeBlockDialogProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onRequestDelete = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <TimeBlockDialog
        open
        onClose={onClose}
        timeZone={TIME_ZONE}
        dateKey={DATE_KEY}
        block={null}
        now={NOW}
        onRequestDelete={onRequestDelete}
        {...overrides}
      />
    </QueryClientProvider>,
  );

  return { onClose, onRequestDelete };
}

function submitButton(): HTMLElement {
  return screen.getByRole("button", { name: /^(Add block|Save changes)$/ });
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
  } as unknown as Awaited<ReturnType<typeof getPreferences>>);
  vi.mocked(createBlock).mockResolvedValue(makeBlock({ id: "new-block" }));
  vi.mocked(updateBlock).mockResolvedValue(
    makeBlock({ id: "b1", taskId: null, blockType: "break", title: "Report block" }),
  );
});

describe("TimeBlockDialog", () => {
  it("creates a break block, converting wall time in the profile zone", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.selectOptions(screen.getByLabelText(/^Block type/), "break");
    await user.type(screen.getByLabelText(/^Title/), "Lunch");
    await user.click(submitButton());

    await waitFor(() => {
      expect(createBlock).toHaveBeenCalledWith({
        title: "Lunch",
        startTime: "2026-11-04T09:00:00.000Z",
        endTime: "2026-11-04T10:00:00.000Z",
        blockType: "break",
        taskId: null,
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("names a task block after the chosen task and sends the link", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole("option", { name: "Write the report" });
    await user.selectOptions(screen.getByLabelText(/^Task/), TASK_ID);
    await user.click(submitButton());

    await waitFor(() => {
      expect(createBlock).toHaveBeenCalledWith({
        title: "Write the report",
        startTime: "2026-11-04T09:00:00.000Z",
        endTime: "2026-11-04T10:00:00.000Z",
        blockType: "task",
        taskId: TASK_ID,
      });
    });
  });

  it("rejects a task block with no task chosen", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(submitButton());

    expect(await screen.findByText("Choose the task this block is for.")).toBeInTheDocument();
    expect(createBlock).not.toHaveBeenCalled();
  });

  it("shows the overlap warning and saves only after the user confirms", async () => {
    const user = userEvent.setup();
    vi.mocked(listBlocks).mockResolvedValue([
      makeBlock({
        id: "other",
        startTime: "2026-11-04T09:30:00.000Z",
        endTime: "2026-11-04T10:30:00.000Z",
      }),
    ]);

    renderDialog();

    expect(
      await screen.findByText(
        "This block shares its time with another block. Both stay in your plan and are marked as overlapping.",
      ),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Block type/), "break");
    await user.type(screen.getByLabelText(/^Title/), "Lunch");

    // First attempt: the conflict is known, consent is missing.
    await user.click(submitButton());

    expect(
      await screen.findByText("Tick the box above to keep this block at this time."),
    ).toBeInTheDocument();
    expect(createBlock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Keep this block at this time anyway" }));
    await user.click(submitButton());

    await waitFor(() => {
      expect(createBlock).toHaveBeenCalledOnce();
    });
  });

  it("drops the confirmation again when the times change", async () => {
    const user = userEvent.setup();
    vi.mocked(listBlocks).mockResolvedValue([
      makeBlock({
        id: "morning",
        startTime: "2026-11-04T09:30:00.000Z",
        endTime: "2026-11-04T10:30:00.000Z",
      }),
      makeBlock({
        id: "noon",
        startTime: "2026-11-04T11:30:00.000Z",
        endTime: "2026-11-04T12:30:00.000Z",
      }),
    ]);

    renderDialog();

    await screen.findByText(/shares its time with another block/);
    await user.selectOptions(screen.getByLabelText(/^Block type/), "break");
    await user.type(screen.getByLabelText(/^Title/), "Lunch");
    await user.click(screen.getByRole("checkbox", { name: "Keep this block at this time anyway" }));

    // Another interval overlaps another block: same warning kind, new decision.
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: "2026-11-04T11:00" } });
    fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: "2026-11-04T12:00" } });

    await user.click(submitButton());

    expect(createBlock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Tick the box above to keep this block at this time."),
    ).toBeInTheDocument();
  });

  it("reports an end that is not after the start without writing", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByLabelText(/^Block type/), "break");
    await user.type(screen.getByLabelText(/^Title/), "Lunch");
    fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: "2026-11-04T08:00" } });
    await user.click(submitButton());

    expect(await screen.findByText("End must be after start.")).toBeInTheDocument();
    expect(createBlock).not.toHaveBeenCalled();
  });

  it("shows the duration of the draft", async () => {
    renderDialog();

    expect(await screen.findByText("Duration: 1 h.")).toBeInTheDocument();
  });

  it("edits a block, changes its type and clears the task link", async () => {
    const user = userEvent.setup();
    renderDialog({ block: EDIT_TARGET });

    expect(screen.getByRole("dialog", { name: "Edit block" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Task/)).toHaveValue(TASK_ID);

    await user.selectOptions(screen.getByLabelText(/^Block type/), "break");
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Report block");

    await user.click(submitButton());

    await waitFor(() => {
      expect(updateBlock).toHaveBeenCalledWith("b1", {
        title: "Report block",
        startTime: "2026-11-04T09:00:00.000Z",
        endTime: "2026-11-04T10:00:00.000Z",
        blockType: "break",
        taskId: null,
      });
    });
  });

  it("asks the page to confirm the deletion instead of nesting a second dialog", async () => {
    const user = userEvent.setup();
    const { onRequestDelete } = renderDialog({ block: EDIT_TARGET });

    await user.click(screen.getByRole("button", { name: /^Delete block$/ }));

    expect(onRequestDelete).toHaveBeenCalledWith(EDIT_TARGET);
    expect(screen.queryByRole("dialog", { name: /^Delete/ })).not.toBeInTheDocument();
  });
});