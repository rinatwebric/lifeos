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
import {
  proposalIdSchema,
  selectedIndexesSchema,
  sendMessageSchema,
  type SendMessageInput,
} from "./schemas";

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
 * carries only `{ action, proposalId[, selectedIndexes] }`, never a
 * `user_id`. HTTP failures map through `toAssistantError` exactly like
 * `sendMessage`. A 500 from the decide branch means the apply failed
 * (rolled back to `pending`), so an `ai_unavailable` with status 500 is
 * re-mapped to `apply_failed` — the modal owns the retry decision.
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

function parseSelectedIndexesOrThrow(selectedIndexes: number[] | undefined): number[] | undefined {
  if (selectedIndexes === undefined) {
    return undefined;
  }
  const parsed = selectedIndexesSchema.safeParse(selectedIndexes);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new AssistantServiceError(
      "invalid_input",
      firstIssue?.message ?? ASSISTANT_ERROR_MESSAGES.invalid_input,
      undefined,
      "selectedIndexes",
    );
  }
  return [...parsed.data];
}

function mapDecideError(error: unknown): never {
  const mapped = toAssistantError(error);
  if (mapped.code === "ai_unavailable" && mapped.status === 500) {
    throw new AssistantServiceError(
      "apply_failed",
      ASSISTANT_ERROR_MESSAGES.apply_failed,
      mapped.status,
      mapped.details,
    );
  }
  throw mapped;
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

export async function approveProposal(
  proposalId: string,
  selectedIndexes?: number[],
): Promise<ApproveProposalResult> {
  try {
    const validId = parseProposalIdOrThrow(proposalId);
    const validSelected = parseSelectedIndexesOrThrow(selectedIndexes);
    await requireUserId();
    const client = getSupabaseClient();

    const { data, error } = await client.functions.invoke("ai-assistant", {
      body:
        validSelected === undefined
          ? { action: "approve", proposalId: validId }
          : { action: "approve", proposalId: validId, selectedIndexes: validSelected },
    });

    if (error) {
      throw toAssistantError(error);
    }

    return readDecideResult(data, "approved") as ApproveProposalResult;
  } catch (error) {
    if (error instanceof AssistantServiceError) {
      if (error.code === "ai_unavailable" && error.status === 500) {
        throw new AssistantServiceError(
          "apply_failed",
          ASSISTANT_ERROR_MESSAGES.apply_failed,
          error.status,
          error.details,
        );
      }
      throw error;
    }
    throw mapDecideError(error);
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
    if (error instanceof AssistantServiceError) {
      throw error;
    }
    throw toAssistantError(error);
  }
}
