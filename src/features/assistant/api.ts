import { assistantProposalSchema, type AssistantProposal } from "@/lib/aiProposals";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  mapAiConversationRowToAiConversation,
  mapAiMessageRowToAiMessage,
  type AiConversationsRow,
  type AiMessagesRow,
} from "@/types/database";
import type { AiConversation, AiMessage } from "@/types/domain";

import { AssistantServiceError, ASSISTANT_ERROR_MESSAGES, toAssistantError } from "./errors";
import { proposalIdSchema, sendMessageSchema, type SendMessageInput } from "./schemas";

/**
 * Identity comes from the local session (`auth.getSession()`), never from
 * a caller-provided `user_id`. RLS (`user_id = auth.uid()`) is the second
 * layer. No function in this module accepts a `user_id` argument — the
 * phrase `user_id` below only ever appears as a column name in queries.
 * `functions.invoke` carries the session JWT itself (supabase-js sets the
 * `Authorization` header); this module never touches it manually.
 */
async function requireUserId(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw toAssistantError(error);
  }

  if (!data.session?.user) {
    throw new AssistantServiceError("forbidden", ASSISTANT_ERROR_MESSAGES.forbidden);
  }

  return data.session.user.id;
}

/**
 * One dialog list read: RLS-scoped (`user_id`), newest first. Single query,
 * no per-conversation fan-out (no N+1) — messages load on demand per dialog.
 */
export async function listConversations(): Promise<AiConversation[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("ai_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw toAssistantError(error);
    }

    return ((data ?? []) as AiConversationsRow[]).map(mapAiConversationRowToAiConversation);
  } catch (error) {
    throw toAssistantError(error);
  }
}

/**
 * One message list read per dialog: RLS-scoped (`user_id`) and narrowed to
 * the dialog, chronological (`created_at` ascending) so the chat renders in
 * order. The caller passes only the dialog id — ownership is enforced by
 * the `user_id` filter, never by trusting the caller.
 */
export async function listMessages(conversationId: string): Promise<AiMessage[]> {
  try {
    const userId = await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw toAssistantError(error);
    }

    return ((data ?? []) as AiMessagesRow[]).map(mapAiMessageRowToAiMessage);
  } catch (error) {
    throw toAssistantError(error);
  }
}

export interface SendMessageResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  proposalId: string;
  proposal: AssistantProposal;
}

export interface ApproveProposalResult {
  proposalId: string;
  status: "approved";
  conversationId: string | null;
  applied: number;
  total: number;
}

export interface RejectProposalResult {
  proposalId: string;
  status: "rejected";
  conversationId: string | null;
  applied: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One assistant turn. Validates the input with Zod, then calls the Edge
 * Function by name — the body carries only `{ message, conversationId }`,
 * never a `user_id` (identity travels in the session JWT, the server derives
 * `auth.uid()` from it). The returned proposal is re-validated with
 * `assistantProposalSchema` before it leaves this module: the server already
 * validated it, but the client must never render junk.
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  try {
    const parsedInput = sendMessageSchema.safeParse(input);

    if (!parsedInput.success) {
      const firstIssue = parsedInput.error.issues[0];
      const fieldPath =
        firstIssue && firstIssue.path.length > 0 ? firstIssue.path.join(".") : "(root)";
      throw new AssistantServiceError(
        "invalid_input",
        firstIssue?.message ?? ASSISTANT_ERROR_MESSAGES.invalid_input,
        undefined,
        fieldPath,
      );
    }

    await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client.functions.invoke("ai-assistant", {
      body: {
        message: parsedInput.data.message,
        conversationId: parsedInput.data.conversationId,
      },
    });

    if (error) {
      throw toAssistantError(error);
    }

    if (
      !isRecord(data) ||
      typeof data["conversationId"] !== "string" ||
      typeof data["userMessageId"] !== "string" ||
      typeof data["assistantMessageId"] !== "string" ||
      typeof data["proposalId"] !== "string" ||
      !("proposal" in data)
    ) {
      throw new AssistantServiceError(
        "invalid_response",
        ASSISTANT_ERROR_MESSAGES.invalid_response,
      );
    }

    const parsedProposal = assistantProposalSchema.safeParse(data["proposal"]);

    if (!parsedProposal.success) {
      throw new AssistantServiceError(
        "invalid_response",
        ASSISTANT_ERROR_MESSAGES.invalid_response,
        undefined,
        parsedProposal.error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
            return `${path}: ${issue.message}`;
          })
          .join("; "),
      );
    }

    return {
      conversationId: data["conversationId"],
      userMessageId: data["userMessageId"],
      assistantMessageId: data["assistantMessageId"],
      proposalId: data["proposalId"],
      proposal: parsedProposal.data,
    };
  } catch (error) {
    throw toAssistantError(error);
  }
}

/**
 * Validate one proposal id client-side (invalid UUID never reaches the
 * network — same `invalid_input` contract as `sendMessage`), then call the
 * Edge Function decide branch. Identity travels in the session JWT; the body
 * carries only `{ action, proposalId }`, never a `user_id`. HTTP failures map
 * through `toAssistantError` exactly like `sendMessage`.
 */
function parseProposalIdOrThrow(proposalId: string): string {
  const parsed = proposalIdSchema.safeParse(proposalId);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const fieldPath =
      firstIssue && firstIssue.path.length > 0 ? firstIssue.path.join(".") : "(root)";
    throw new AssistantServiceError(
      "invalid_input",
      firstIssue?.message ?? ASSISTANT_ERROR_MESSAGES.invalid_input,
      undefined,
      fieldPath,
    );
  }

  return parsed.data;
}

function readDecideResult(
  data: unknown,
  expectedStatus: "approved" | "rejected",
): Omit<ApproveProposalResult, "status"> & { status: "approved" | "rejected" } {
  if (
    !isRecord(data) ||
    typeof data["proposalId"] !== "string" ||
    data["status"] !== expectedStatus ||
    !("conversationId" in data) ||
    (data["conversationId"] !== null && typeof data["conversationId"] !== "string") ||
    typeof data["applied"] !== "number" ||
    typeof data["total"] !== "number"
  ) {
    throw new AssistantServiceError(
      "invalid_response",
      ASSISTANT_ERROR_MESSAGES.invalid_response,
    );
  }

  return {
    proposalId: data["proposalId"],
    status: expectedStatus,
    conversationId: data["conversationId"] as string | null,
    applied: data["applied"],
    total: data["total"],
  };
}

export async function approveProposal(proposalId: string): Promise<ApproveProposalResult> {
  try {
    const validId = parseProposalIdOrThrow(proposalId);
    await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client.functions.invoke("ai-assistant", {
      body: { action: "approve", proposalId: validId },
    });

    if (error) {
      throw toAssistantError(error);
    }

    return readDecideResult(data, "approved") as ApproveProposalResult;
  } catch (error) {
    throw toAssistantError(error);
  }
}

export async function rejectProposal(proposalId: string): Promise<RejectProposalResult> {
  try {
    const validId = parseProposalIdOrThrow(proposalId);
    await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client.functions.invoke("ai-assistant", {
      body: { action: "reject", proposalId: validId },
    });

    if (error) {
      throw toAssistantError(error);
    }

    return readDecideResult(data, "rejected") as RejectProposalResult;
  } catch (error) {
    throw toAssistantError(error);
  }
}
