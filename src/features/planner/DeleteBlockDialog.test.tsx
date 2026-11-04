import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteBlock } from "./api";
import { DeleteBlockDialog, type DeleteBlockTarget } from "./DeleteBlockDialog";
import { BlockServiceError } from "./errors";

vi.mock("./api", () => ({
  listBlocks: vi.fn(),
  createBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
}));

const TASK_BLOCK: DeleteBlockTarget = {
  id: "b1",
  title: "Deep work",
  taskId: "9f1c7a55-8b47-4e0e-9d8e-2c1f3f4a5b6c",
};

const BREAK_BLOCK: DeleteBlockTarget = { id: "b2", title: "Lunch", taskId: null };

function renderDialog(block: DeleteBlockTarget | null) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onClose = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <DeleteBlockDialog open onClose={onClose} block={block} />
    </QueryClientProvider>,
  );

  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteBlock).mockResolvedValue(undefined);
});

describe("DeleteBlockDialog", () => {
  it("says what happens to the task'd schedule before deleting", () => {
    renderDialog(TASK_BLOCK);

    expect(screen.getByRole("dialog", { name: "Delete “Deep work”?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "The block leaves your plan and the task stops showing a scheduled time. The task itself stays. This cannot be undone.",
      ),
    ).toBeInTheDocument();
    expect(deleteBlock).not.toHaveBeenCalled();
  });

  it("deletes the block in one service call and closes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(TASK_BLOCK);

    await user.click(screen.getByRole("button", { name: "Delete block" }));

    await waitFor(() => {
      expect(deleteBlock).toHaveBeenCalledWith("b1");
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the block and explains a failed delete in human words", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteBlock).mockRejectedValue(
      new BlockServiceError("network", "TypeError: Failed to fetch"),
    );

    const { onClose } = renderDialog(TASK_BLOCK);

    await user.click(screen.getByRole("button", { name: "Delete block" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "The connection dropped before the block was saved. Check your connection and retry.",
    );
    expect(alert.textContent).not.toContain("Failed to fetch");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("promises only freed time for a break block", () => {
    renderDialog(BREAK_BLOCK);

    expect(
      screen.getByText(
        "The block leaves your plan and the time becomes free again. This cannot be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("cancels without touching the block", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(TASK_BLOCK);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteBlock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});