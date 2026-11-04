import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssistantServiceError, ASSISTANT_ERROR_MESSAGES } from "./errors";
import { useConversations, useMessages, useSendMessage } from "./hooks";
import { ChatPanel } from "./ChatPanel";

vi.mock("./hooks", () => ({
  useConversations: vi.fn(),
  useMessages: vi.fn(),
  useSendMessage: vi.fn(),
}));

const mockedConversations = vi.mocked(useConversations);
const mockedMessages = vi.mocked(useMessages);
const mockedSend = vi.mocked(useSendMessage);

function stubQueries(options?: {
  conversations?: Array<{ id: string; title: string }>;
  messages?: Array<{ id: string; role: "user" | "assistant"; content: string }>;
}) {
  mockedConversations.mockReturnValue({
    data: options?.conversations ?? [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useConversations>);

  mockedMessages.mockReturnValue({
    data: options?.messages ?? [],
    isSuccess: true,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMessages>);
}

describe("ChatPanel", () => {
  it("shows the honest empty state with examples", () => {
    stubQueries();
    mockedSend.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSendMessage>);

    render(<ChatPanel />);

    expect(screen.getByText("Ask about your week, or ask for a plan.")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Nothing changes until you review and confirm/)[0],
    ).toBeInTheDocument();
    expect(screen.getByText("I want to become a frontend developer in 6 months.")).toBeInTheDocument();
  });

  it("sends a message and clears the composer", async () => {
    const user = userEvent.setup();
    stubQueries();
    const mutateAsync = vi.fn().mockResolvedValue({ conversationId: "conv-1" });
    mockedSend.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSendMessage>);

    render(<ChatPanel />);

    const composer = screen.getByLabelText("Message");
    await user.type(composer, "Plan my week");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        message: "Plan my week",
        conversationId: null,
      });
    });
    await waitFor(() => {
      expect(composer).toHaveValue("");
    });
  });

  it("disables Send on empty and overlong drafts with a counter", async () => {
    const user = userEvent.setup();
    stubQueries();
    mockedSend.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSendMessage>);

    render(<ChatPanel />);

    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    const composer = screen.getByLabelText("Message");
    await user.type(composer, "hi");
    expect(send).not.toBeDisabled();
    expect(screen.getByText("2 / 4000")).toBeInTheDocument();

    await user.clear(composer);
    fireEvent.change(composer, { target: { value: "x".repeat(4001) } });
    expect(send).toBeDisabled();
    expect(screen.getByText("4001 / 4000")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("too long");
  });

  it("explains the rate limit with the next step", () => {
    stubQueries();
    mockedSend.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: new AssistantServiceError("rate_limited", ASSISTANT_ERROR_MESSAGES.rate_limited, 429),
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSendMessage>);

    render(<ChatPanel />);

    expect(screen.getByText(ASSISTANT_ERROR_MESSAGES.rate_limited)).toBeInTheDocument();
    expect(screen.getByText("The daily limit is 50 messages. Your count resets tomorrow.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("disables the composer while sending", () => {
    stubQueries();
    mockedSend.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      error: null,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSendMessage>);

    render(<ChatPanel />);

    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
