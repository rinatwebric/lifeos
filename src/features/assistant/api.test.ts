import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { AiConversationsRow, AiMessagesRow } from "@/types/database";

import { approveProposal, listConversations, listMessages, rejectProposal, sendMessage } from "./api";
import { AssistantServiceError, ASSISTANT_ERROR_MESSAGES } from "./errors";

vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

const mockedGetClient = vi.mocked(getSupabaseClient);

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

const CONVERSATION_ROW: AiConversationsRow = {
  id: CONVERSATION_ID,
  user_id: "u1",
  title: "Plan my week",
  created_at: "2026-11-04T10:00:00.000Z",
  updated_at: "2026-11-04T10:00:00.000Z",
};

const MESSAGE_ROW: AiMessagesRow = {
  id: "m1",
  conversation_id: CONVERSATION_ID,
  user_id: "u1",
  role: "user",
  content: "Break down my goal",
  metadata: {},
  created_at: "2026-11-04T10:01:00.000Z",
};

const VALID_PROPOSAL = {
  proposalType: "task_creation",
  summary: "Two starter tasks.",
  reasoning: "Small steps first so the week stays light.",
  actions: [
    {
      type: "create_task",
      title: "Write the outline",
      description: null,
      goalId: null,
      milestoneId: null,
      priority: null,
      dueDate: null,
      estimatedDurationMinutes: null,
    },
  ],
};

const VALID_RESPONSE = {
  conversationId: CONVERSATION_ID,
  userMessageId: "u-msg-1",
  assistantMessageId: "a-msg-1",
  proposalId: "p-1",
  proposal: VALID_PROPOSAL,
};

interface TableMocks {
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  builder: Record<string, ReturnType<typeof vi.fn>>;
}

function mockTable(result: unknown): TableMocks {
  const builder = {} as Record<string, ReturnType<typeof vi.fn>>;
  const eq = vi.fn();
  const order = vi.fn();
  const select = vi.fn();

  Object.assign(builder, { eq, order, select });
  eq.mockReturnValue(builder);
  order.mockReturnValue(builder);
  select.mockReturnValue(builder);

  return {
    eq,
    order,
    select,
    builder: Object.assign(builder, {
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    }),
  };
}

function stubClient(
  authUserId: string | null,
  fromEntry: ReturnType<typeof vi.fn>,
  invokeEntry: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: authUserId ? { user: { id: authUserId } } : null },
    error: null,
  });
  mockedGetClient.mockReturnValue({
    auth: { getSession },
    from: fromEntry,
    functions: { invoke: invokeEntry },
  } as unknown as SupabaseClient);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assistant api", () => {
  it("lists conversations for the JWT identity, newest first", async () => {
    const table = mockTable({ data: [CONVERSATION_ROW], error: null });
    stubClient("u1", vi.fn().mockReturnValue(table.builder));

    const result = await listConversations();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: CONVERSATION_ID,
      userId: "u1",
      title: "Plan my week",
    });
    expect(table.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(table.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("lists one dialog's messages scoped to the caller, chronological", async () => {
    const table = mockTable({ data: [MESSAGE_ROW], error: null });
    const fromEntry = vi.fn().mockReturnValue(table.builder);
    stubClient("u1", fromEntry);

    const result = await listMessages(CONVERSATION_ID);

    expect(fromEntry).toHaveBeenCalledWith("ai_messages");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "m1",
      conversationId: CONVERSATION_ID,
      role: "user",
    });
    expect(table.eq).toHaveBeenCalledWith("conversation_id", CONVERSATION_ID);
    expect(table.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(table.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("requires a session for every call and invokes nothing without one", async () => {
    const invokeEntry = vi.fn();
    stubClient(null, vi.fn(), invokeEntry);

    await expect(listConversations()).rejects.toMatchObject({ code: "forbidden" });
    await expect(listMessages(CONVERSATION_ID)).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      sendMessage({ message: "hello", conversationId: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(invokeEntry).not.toHaveBeenCalled();
  });

  it("sends a trimmed message without any user_id and returns the typed turn", async () => {
    const invokeEntry = vi.fn().mockResolvedValue({ data: VALID_RESPONSE, error: null });
    stubClient("jwt-user-7", vi.fn(), invokeEntry);

    const result = await sendMessage({ message: "  Break down my goal  ", conversationId: null });

    expect(result).toMatchObject({
      conversationId: CONVERSATION_ID,
      userMessageId: "u-msg-1",
      assistantMessageId: "a-msg-1",
      proposalId: "p-1",
    });
    expect(result.proposal.proposalType).toBe("task_creation");
    expect(invokeEntry).toHaveBeenCalledOnce();
    expect(invokeEntry).toHaveBeenCalledWith(
      "ai-assistant",
      expect.objectContaining({
        body: { message: "Break down my goal", conversationId: null },
      }),
    );
    const body = invokeEntry.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("userId");
  });

  it("rejects client-side input before any request", async () => {
    const invokeEntry = vi.fn();
    stubClient("u1", vi.fn(), invokeEntry);

    const emptyError = (await sendMessage({ message: "   ", conversationId: null }).catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;
    expect(emptyError).toMatchObject({ code: "invalid_input" });
    expect(emptyError.details).toBe("message");

    const uuidError = (await sendMessage({ message: "hello", conversationId: "not-a-uuid" }).catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;
    expect(uuidError).toMatchObject({ code: "invalid_input" });
    expect(uuidError.details).toBe("conversationId");
    expect(invokeEntry).not.toHaveBeenCalled();
  });

  it("rejects a 2xx payload with a garbage proposal instead of rendering it", async () => {
    const invokeEntry = vi.fn().mockResolvedValue({
      data: { ...VALID_RESPONSE, proposal: { proposalType: "nope", actions: [] } },
      error: null,
    });
    stubClient("u1", vi.fn(), invokeEntry);

    const error = await sendMessage({ message: "hello", conversationId: null }).catch(
      (failure: unknown) => failure,
    );

    expect(error).toBeInstanceOf(AssistantServiceError);
    expect(error).toMatchObject({ code: "invalid_response" });
    expect((error as AssistantServiceError).message).toBe(
      ASSISTANT_ERROR_MESSAGES.invalid_response,
    );
  });

  it("rejects a 2xx payload with missing ids as an invalid response", async () => {
    const invokeEntry = vi.fn().mockResolvedValue({
      data: { proposal: VALID_PROPOSAL },
      error: null,
    });
    stubClient("u1", vi.fn(), invokeEntry);

    await expect(sendMessage({ message: "hello", conversationId: null })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("maps function HTTP statuses to codes only", async () => {
    const cases: Array<{ status: number; code: string }> = [
      { status: 401, code: "forbidden" },
      { status: 413, code: "too_large" },
      { status: 429, code: "rate_limited" },
      { status: 502, code: "ai_unavailable" },
      { status: 404, code: "ai_unavailable" },
    ];

    for (const { status, code } of cases) {
      const invokeEntry = vi.fn().mockResolvedValue({
        data: null,
        error: { name: "FunctionsHttpError", context: { status }, message: `http ${status}` },
      });
      stubClient("u1", vi.fn(), invokeEntry);

      const error = await sendMessage({ message: "hello", conversationId: null }).catch(
        (failure: unknown) => failure,
      );

      expect(error).toBeInstanceOf(AssistantServiceError);
      expect(error).toMatchObject({ code });
      expect((error as AssistantServiceError).message).toBe(
        ASSISTANT_ERROR_MESSAGES[code as keyof typeof ASSISTANT_ERROR_MESSAGES],
      );
    }
  });

  it("maps a fetch failure to network without leaking the raw text", async () => {
    const invokeEntry = vi
      .fn()
      .mockResolvedValue({ data: null, error: new TypeError("fetch failed") });
    stubClient("u1", vi.fn(), invokeEntry);

    const error = (await sendMessage({ message: "hello", conversationId: null }).catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;

    expect(error).toMatchObject({ code: "network" });
    expect(error.message).toBe(ASSISTANT_ERROR_MESSAGES.network);
    expect(error.message).not.toContain("fetch failed");
  });

  it("maps RLS denial on reads to forbidden with a human message", async () => {
    const table = mockTable({
      data: null,
      error: { code: "42501", message: "permission denied for table ai_conversations" },
    });
    stubClient("u1", vi.fn().mockReturnValue(table.builder));

    const error = (await listConversations().catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;

    expect(error).toBeInstanceOf(AssistantServiceError);
    expect(error).toMatchObject({ code: "forbidden" });
    expect(error.message).toBe(ASSISTANT_ERROR_MESSAGES.forbidden);
    expect(error.message).not.toContain("42501");
  });

  it("approves with only action and proposalId, never a user_id", async () => {
    const response = {
      proposalId: "22222222-2222-4222-8222-222222222222",
      status: "approved",
      conversationId: CONVERSATION_ID,
      applied: 2,
      total: 2,
    };
    const invokeEntry = vi.fn().mockResolvedValue({ data: response, error: null });
    stubClient("jwt-user-7", vi.fn(), invokeEntry);

    const result = await approveProposal("22222222-2222-4222-8222-222222222222");

    expect(result).toStrictEqual(response);
    expect(invokeEntry).toHaveBeenCalledOnce();
    expect(invokeEntry).toHaveBeenCalledWith(
      "ai-assistant",
      expect.objectContaining({
        body: { action: "approve", proposalId: "22222222-2222-4222-8222-222222222222" },
      }),
    );
    const body = invokeEntry.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("userId");
  });

  it("rejects with only action and proposalId and accepts a null conversation", async () => {
    const response = {
      proposalId: "33333333-3333-4333-8333-333333333333",
      status: "rejected",
      conversationId: null,
      applied: 0,
      total: 1,
    };
    const invokeEntry = vi.fn().mockResolvedValue({ data: response, error: null });
    stubClient("u1", vi.fn(), invokeEntry);

    const result = await rejectProposal("33333333-3333-4333-8333-333333333333");

    expect(result).toStrictEqual(response);
    expect(invokeEntry).toHaveBeenCalledWith(
      "ai-assistant",
      expect.objectContaining({
        body: { action: "reject", proposalId: "33333333-3333-4333-8333-333333333333" },
      }),
    );
  });

  it("rejects decide calls with a bad proposal id before any request", async () => {
    const invokeEntry = vi.fn();
    stubClient("u1", vi.fn(), invokeEntry);

    const approveError = (await approveProposal("not-a-uuid").catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;
    expect(approveError).toMatchObject({ code: "invalid_input" });
    expect(approveError.details).toBe("(root)");

    const rejectError = (await rejectProposal("").catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;
    expect(rejectError).toMatchObject({ code: "invalid_input" });
    expect(invokeEntry).not.toHaveBeenCalled();
  });

  it("rejects a 2xx decide payload with the wrong shape", async () => {
    const invokeEntry = vi.fn().mockResolvedValue({
      data: { proposalId: "p-1", status: "approved" },
      error: null,
    });
    stubClient("u1", vi.fn(), invokeEntry);

    const error = (await approveProposal("22222222-2222-4222-8222-222222222222").catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;

    expect(error).toBeInstanceOf(AssistantServiceError);
    expect(error).toMatchObject({ code: "invalid_response" });
  });

  it("requires a session for decide calls and invokes nothing without one", async () => {
    const invokeEntry = vi.fn();
    stubClient(null, vi.fn(), invokeEntry);

    await expect(
      approveProposal("22222222-2222-4222-8222-222222222222"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      rejectProposal("22222222-2222-4222-8222-222222222222"),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(invokeEntry).not.toHaveBeenCalled();
  });

  it("approves a subset with selectedIndexes and nothing else", async () => {
    const response = {
      proposalId: "22222222-2222-4222-8222-222222222222",
      status: "approved",
      conversationId: CONVERSATION_ID,
      applied: 1,
      total: 1,
    };
    const invokeEntry = vi.fn().mockResolvedValue({ data: response, error: null });
    stubClient("u1", vi.fn(), invokeEntry);

    const result = await approveProposal("22222222-2222-4222-8222-222222222222", [0, 2]);

    expect(result).toStrictEqual(response);
    expect(invokeEntry).toHaveBeenCalledWith(
      "ai-assistant",
      expect.objectContaining({
        body: {
          action: "approve",
          proposalId: "22222222-2222-4222-8222-222222222222",
          selectedIndexes: [0, 2],
        },
      }),
    );
  });

  it("rejects bad selectedIndexes before any request", async () => {
    const invokeEntry = vi.fn();
    stubClient("u1", vi.fn(), invokeEntry);

    for (const bad of [[0, 0], [2, 0], [0, -1] as unknown as number[]]) {
      const error = (await approveProposal("22222222-2222-4222-8222-222222222222", bad).catch(
        (failure: unknown) => failure,
      )) as AssistantServiceError;
      expect(error).toMatchObject({ code: "invalid_input" });
      expect(error.details).toBe("selectedIndexes");
    }
    expect(invokeEntry).not.toHaveBeenCalled();
  });

  it("maps decide HTTP statuses to already_decided, expired and validation_failed", async () => {
    const cases: Array<{ status: number; code: string }> = [
      { status: 409, code: "already_decided" },
      { status: 410, code: "expired" },
      { status: 422, code: "validation_failed" },
    ];
    for (const { status, code } of cases) {
      const invokeEntry = vi.fn().mockResolvedValue({
        data: null,
        error: { name: "FunctionsHttpError", context: { status }, message: `http ${status}` },
      });
      stubClient("u1", vi.fn(), invokeEntry);
      const error = (await approveProposal("22222222-2222-4222-8222-222222222222").catch(
        (failure: unknown) => failure,
      )) as AssistantServiceError;
      expect(error).toMatchObject({ code });
      expect(error.message).toBe(
        ASSISTANT_ERROR_MESSAGES[code as keyof typeof ASSISTANT_ERROR_MESSAGES],
      );
    }
  });

  it("maps a 500 from approve to apply_failed", async () => {
    const invokeEntry = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "FunctionsHttpError", context: { status: 500 }, message: "http 500" },
    });
    stubClient("u1", vi.fn(), invokeEntry);
    const error = (await approveProposal("22222222-2222-4222-8222-222222222222").catch(
      (failure: unknown) => failure,
    )) as AssistantServiceError;
    expect(error).toMatchObject({ code: "apply_failed", status: 500 });
  });
});
