import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AssistantProposal } from "@/lib/aiProposals";

import { AssistantServiceError, ASSISTANT_ERROR_MESSAGES } from "./errors";
import { useApproveProposal, useRejectProposal } from "./hooks";
import { ProposalModal } from "./ProposalModal";

vi.mock("./hooks", () => ({
  useApproveProposal: vi.fn(),
  useRejectProposal: vi.fn(),
}));

const mockedApprove = vi.mocked(useApproveProposal);
const mockedReject = vi.mocked(useRejectProposal);

const PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";

const PROPOSAL: AssistantProposal = {
  proposalType: "task_creation",
  summary: "Two starter tasks to keep the week light.",
  reasoning: "Small steps first so the load stays manageable.",
  actions: [
    {
      type: "create_task",
      title: "Write the outline",
      description: null,
      goalId: null,
      milestoneId: null,
      priority: null,
      dueDate: "2026-11-10",
      estimatedDurationMinutes: null,
    },
    {
      type: "create_task",
      title: "Read one chapter",
      description: null,
      goalId: null,
      milestoneId: null,
      priority: null,
      dueDate: null,
      estimatedDurationMinutes: null,
    },
    {
      type: "update_preferences",
      wakeUpTime: "07:00",
      sleepTime: null,
      timezone: null,
      language: null,
      theme: null,
    },
  ],
};

function stubMutations(options?: {
  approveError?: unknown;
  rejectError?: unknown;
}) {
  const approveMutate = vi.fn();
  const rejectMutate = vi.fn();
  if (options?.approveError) {
    approveMutate.mockRejectedValue(options.approveError);
  } else {
    approveMutate.mockResolvedValue({
      proposalId: PROPOSAL_ID,
      status: "approved",
      conversationId: "conv-1",
      applied: 3,
      total: 3,
    });
  }
  if (options?.rejectError) {
    rejectMutate.mockRejectedValue(options.rejectError);
  } else {
    rejectMutate.mockResolvedValue({
      proposalId: PROPOSAL_ID,
      status: "rejected",
      conversationId: "conv-1",
      applied: 0,
      total: 3,
    });
  }
  mockedApprove.mockReturnValue({
    mutateAsync: approveMutate,
    isPending: false,
    error: (options?.approveError as never) ?? null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useApproveProposal>);
  mockedReject.mockReturnValue({
    mutateAsync: rejectMutate,
    isPending: false,
    error: (options?.rejectError as never) ?? null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useRejectProposal>);
  return { approveMutate, rejectMutate };
}

describe("ProposalModal", () => {
  it("accepts all actions with every index", async () => {
    const user = userEvent.setup();
    const { approveMutate } = stubMutations();

    render(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(PROPOSAL.summary)).toBeInTheDocument();
    expect(screen.getByText(/Small steps first/)).toBeInTheDocument();
    expect(screen.getByText(/Create task: Write the outline/)).toBeInTheDocument();
    expect(screen.getByText(/Update preferences: wake-up 07:00/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept all" }));

    await waitFor(() => {
      expect(approveMutate).toHaveBeenCalledWith({
        proposalId: PROPOSAL_ID,
        selectedIndexes: [0, 1, 2],
      });
    });
  });

  it("accepts only the checked subset", async () => {
    const user = userEvent.setup();
    const { approveMutate } = stubMutations();

    render(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Review proposal" });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);

    await user.click(boxes[1]);
    await user.click(screen.getByRole("button", { name: /Accept selected \(2\)/ }));

    await waitFor(() => {
      expect(approveMutate).toHaveBeenCalledWith({
        proposalId: PROPOSAL_ID,
        selectedIndexes: [0, 2],
      });
    });
  });

  it("rejects the whole proposal", async () => {
    const user = userEvent.setup();
    const { rejectMutate } = stubMutations();

    const onDecided = vi.fn();
    render(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
        onDecided={onDecided}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(rejectMutate).toHaveBeenCalledWith(PROPOSAL_ID);
    });
    expect(onDecided).toHaveBeenCalled();
  });

  it("shows an expired proposal as terminal without retry", async () => {
    stubMutations({
      approveError: new AssistantServiceError("expired", ASSISTANT_ERROR_MESSAGES.expired, 410),
    });

    render(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Proposal expired")).toBeInTheDocument();
    expect(screen.getByText(ASSISTANT_ERROR_MESSAGES.expired)).toBeInTheDocument();
    expect(
      screen.getByText("Start a new conversation for a fresh suggestion."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("shows already_decided and validation errors with the next step", async () => {
    const { rerender } = render(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );

    stubMutations({
      approveError: new AssistantServiceError(
        "already_decided",
        ASSISTANT_ERROR_MESSAGES.already_decided,
        409,
      ),
    });
    rerender(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(ASSISTANT_ERROR_MESSAGES.already_decided)).toBeInTheDocument();

    stubMutations({
      approveError: new AssistantServiceError(
        "validation_failed",
        ASSISTANT_ERROR_MESSAGES.validation_failed,
        422,
      ),
    });
    rerender(
      <ProposalModal
        open
        proposalId={PROPOSAL_ID}
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(ASSISTANT_ERROR_MESSAGES.validation_failed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("a second proposal starts fully selected", async () => {
    const user = userEvent.setup();
    stubMutations();

    const fiveActions: AssistantProposal = {
      proposalType: "task_creation",
      summary: "Five next steps.",
      reasoning: "A bigger batch for the week ahead.",
      actions: [0, 1, 2, 3, 4].map((index) => ({
        type: "create_task",
        title: `Task ${index + 1}`,
        description: null,
        goalId: null,
        milestoneId: null,
        priority: null,
        dueDate: null,
        estimatedDurationMinutes: null,
      })),
    };

    const { rerender } = render(
      <ProposalModal
        key="proposal-A"
        open
        proposalId="proposal-A"
        proposal={PROPOSAL}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );

    const firstDialog = screen.getByRole("dialog", { name: "Review proposal" });
    const firstBoxes = within(firstDialog).getAllByRole("checkbox");
    expect(firstBoxes).toHaveLength(3);
    await user.click(firstBoxes[0]);
    expect(screen.getByRole("button", { name: /Accept selected \(2\)/ })).toBeInTheDocument();

    rerender(
      <ProposalModal
        key="proposal-B"
        open
        proposalId="proposal-B"
        proposal={fiveActions}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    );

    const secondDialog = screen.getByRole("dialog", { name: "Review proposal" });
    const secondBoxes = within(secondDialog).getAllByRole("checkbox");
    expect(secondBoxes).toHaveLength(5);
    for (const box of secondBoxes) {
      expect(box).toBeChecked();
    }
    expect(screen.getByRole("button", { name: /Accept selected \(5\)/ })).toBeInTheDocument();
  });
});
