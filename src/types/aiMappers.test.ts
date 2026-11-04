import { describe, expect, it } from "vitest";

import {
  mapAiConversationRowToAiConversation,
  mapAiMessageRowToAiMessage,
  mapAiProposalRowToAiProposal,
  type AiConversationsRow,
  type AiMessagesRow,
  type AiProposalsRow,
} from "@/types/database";

describe("mapAiConversationRowToAiConversation", () => {
  it("maps snake_case to camelCase", () => {
    const row: AiConversationsRow = {
      id: "conv-1",
      user_id: "user-1",
      title: "Frontend plan",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T11:00:00.000Z",
    };

    expect(mapAiConversationRowToAiConversation(row)).toStrictEqual({
      id: "conv-1",
      userId: "user-1",
      title: "Frontend plan",
      createdAt: "2026-11-04T10:00:00.000Z",
      updatedAt: "2026-11-04T11:00:00.000Z",
    });
  });
});

describe("mapAiMessageRowToAiMessage", () => {
  it("maps fields and keeps metadata as the same object", () => {
    const row: AiMessagesRow = {
      id: "msg-1",
      conversation_id: "conv-1",
      user_id: "user-1",
      role: "assistant",
      content: "Here is a lighter plan.",
      metadata: { truncated: true, model: "stub" },
      created_at: "2026-11-04T10:01:00.000Z",
    };

    const mapped = mapAiMessageRowToAiMessage(row);

    expect(mapped).toStrictEqual({
      id: "msg-1",
      conversationId: "conv-1",
      userId: "user-1",
      role: "assistant",
      content: "Here is a lighter plan.",
      metadata: { truncated: true, model: "stub" },
      createdAt: "2026-11-04T10:01:00.000Z",
    });
    expect(mapped.metadata).toBe(row.metadata);
  });
});

describe("mapAiProposalRowToAiProposal", () => {
  it("maps a pending proposal with an expiry", () => {
    const row: AiProposalsRow = {
      id: "prop-1",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "schedule_suggestion",
      payload: { actions: [] },
      status: "pending",
      expires_at: "2026-11-11T10:00:00.000Z",
      applied_at: null,
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:00:00.000Z",
    };

    const mapped = mapAiProposalRowToAiProposal(row);

    expect(mapped).toStrictEqual({
      id: "prop-1",
      userId: "user-1",
      conversationId: "conv-1",
      proposalType: "schedule_suggestion",
      payload: { actions: [] },
      status: "pending",
      expiresAt: "2026-11-11T10:00:00.000Z",
      appliedAt: null,
      createdAt: "2026-11-04T10:00:00.000Z",
      updatedAt: "2026-11-04T10:00:00.000Z",
    });
    expect(mapped.payload).toBe(row.payload);
  });

  it("preserves null conversation, expiry and apply timestamp", () => {
    const row: AiProposalsRow = {
      id: "prop-2",
      user_id: "user-1",
      conversation_id: null,
      proposal_type: "productivity_analysis",
      payload: { summary: "Steady progress." },
      status: "rejected",
      expires_at: null,
      applied_at: null,
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T10:05:00.000Z",
    };

    const mapped = mapAiProposalRowToAiProposal(row);

    expect(mapped.conversationId).toBeNull();
    expect(mapped.expiresAt).toBeNull();
    expect(mapped.appliedAt).toBeNull();
    expect(mapped.status).toBe("rejected");
    expect(mapped.proposalType).toBe("productivity_analysis");
  });

  it("maps an approved proposal with an apply timestamp", () => {
    const row: AiProposalsRow = {
      id: "prop-3",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "goal_breakdown",
      payload: { milestones: ["Learn JS"] },
      status: "approved",
      expires_at: "2026-11-11T10:00:00.000Z",
      applied_at: "2026-11-04T12:00:00.000Z",
      created_at: "2026-11-04T10:00:00.000Z",
      updated_at: "2026-11-04T12:00:00.000Z",
    };

    const mapped = mapAiProposalRowToAiProposal(row);

    expect(mapped.status).toBe("approved");
    expect(mapped.appliedAt).toBe("2026-11-04T12:00:00.000Z");
  });
});
