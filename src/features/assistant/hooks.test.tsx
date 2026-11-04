import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { approveProposal, listConversations, listMessages, rejectProposal, sendMessage } from "./api";
import { useApproveProposal, useConversations, useMessages, useRejectProposal, useSendMessage } from "./hooks";
import { assistant } from "./queryKeys";

vi.mock("./api", () => ({
  approveProposal: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  rejectProposal: vi.fn(),
  sendMessage: vi.fn(),
}));

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

const TURN = {
  conversationId: CONVERSATION_ID,
  userMessageId: "u-msg-1",
  assistantMessageId: "a-msg-1",
  proposalId: "p-1",
  proposal: {
    proposalType: "task_creation",
    summary: "Two starter tasks.",
    reasoning: "Small steps first.",
    actions: [],
  },
};

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assistant hooks", () => {
  it("reads conversations through the service on the assistant key", async () => {
    const client = createClient();
    vi.mocked(listConversations).mockResolvedValue([]);

    const { result } = renderHook(() => useConversations(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(listConversations).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([]);
  });

  it("reads one dialog's messages and fires no request without an id", async () => {
    const client = createClient();
    vi.mocked(listMessages).mockResolvedValue([]);

    const { result } = renderHook(() => useMessages(CONVERSATION_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(CONVERSATION_ID);
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([]);

    vi.clearAllMocks();
    renderHook(() => useMessages(undefined), { wrapper: wrapper(createClient()) });

    // No dialog selected — no request.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listMessages).not.toHaveBeenCalled();
  });

  it("refreshes only the assistant prefix and never goals or tasks lists", async () => {
    const client = createClient();
    vi.mocked(sendMessage).mockResolvedValue(TURN as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper(client) });

    result.current.mutate({ message: "Break down my goal", conversationId: null });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: assistant.conversations });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assistant.messages(CONVERSATION_ID),
    });

    // A proposal changes nothing until step 7 applies it after human
    // approval — goals/tasks caches stay untouched.
    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]).not.toEqual({ queryKey: ["goals", "list"] });
      const key = (call[0] as { queryKey: readonly unknown[] }).queryKey;
      expect(key[0]).not.toBe("goals");
      expect(key[0]).not.toBe("tasks");
    }
  });

  it("surfaces the coded service error to the caller", async () => {
    const client = createClient();
    vi.mocked(sendMessage).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "forbidden" }),
    );

    const { result } = renderHook(() => useSendMessage(), { wrapper: wrapper(client) });

    let failure: unknown = null;
    await result.current
      .mutateAsync({ message: "hello", conversationId: null })
      .catch((error: unknown) => {
        failure = error;
      });

    expect(failure).toMatchObject({ code: "forbidden" });
  });

  it("refreshes tasks, goals and planner blocks after an approve", async () => {
    const client = createClient();
    const proposalId = "22222222-2222-4222-8222-222222222222";
    vi.mocked(approveProposal).mockResolvedValue({
      proposalId,
      status: "approved",
      conversationId: CONVERSATION_ID,
      applied: 2,
      total: 2,
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useApproveProposal(), { wrapper: wrapper(client) });

    result.current.mutate(proposalId);

    await waitFor(() => {
      expect(approveProposal).toHaveBeenCalledWith(proposalId);
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: assistant.proposals() });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assistant.messages(CONVERSATION_ID),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["goals"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["planner", "blocks"] });
  });

  it("refreshes only the assistant prefix after a reject", async () => {
    const client = createClient();
    const proposalId = "33333333-3333-4333-8333-333333333333";
    vi.mocked(rejectProposal).mockResolvedValue({
      proposalId,
      status: "rejected",
      conversationId: CONVERSATION_ID,
      applied: 0,
      total: 1,
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useRejectProposal(), { wrapper: wrapper(client) });

    result.current.mutate(proposalId);

    await waitFor(() => {
      expect(rejectProposal).toHaveBeenCalledWith(proposalId);
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: assistant.proposals() });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: assistant.messages(CONVERSATION_ID),
    });

    for (const call of invalidateSpy.mock.calls) {
      const key = (call[0] as { queryKey: readonly unknown[] }).queryKey;
      expect(key[0]).toBe("assistant");
    }
  });
});
