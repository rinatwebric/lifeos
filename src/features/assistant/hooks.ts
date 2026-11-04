import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { planner } from "@/features/planner/queryKeys";
import { tasks } from "@/features/tasks/queryKeys";

import { approveProposal, listConversations, listMessages, rejectProposal, sendMessage } from "./api";
import { assistant } from "./queryKeys";
import type { SendMessageInput } from "./schemas";

/**
 * Dialog list (RLS-scoped read, newest first). No arguments — identity comes
 * from the session inside the service.
 */
export function useConversations() {
  return useQuery({
    queryKey: assistant.conversations,
    queryFn: () => listConversations(),
  });
}

/**
 * One dialog's messages (RLS-scoped read, chronological). Disabled without
 * an id so no request fires for an unselected dialog.
 */
export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: assistant.messages(conversationId ?? ""),
    queryFn: () => listMessages(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

/**
 * One assistant turn. On success only the assistant prefix is invalidated
 * (the list — a new dialog may have been created — plus the answered
 * dialog). `["goals", "list"]` and `["tasks", ...]` are never touched here:
 * a proposal changes nothing until step 7 applies it after human approval.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendMessageInput) => sendMessage(input),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: assistant.conversations });
      const conversationId = result.conversationId ?? variables.conversationId;
      if (conversationId) {
        void queryClient.invalidateQueries({
          queryKey: assistant.messages(conversationId),
        });
      }
    },
  });
}

/**
 * Approve a proposal after human confirmation (step 7). The server re-reads
 * the stored row as the caller, re-validates every action BEFORE the first
 * write, applies in order, then marks `approved + applied_at`. Real rows
 * changed — so every affected cache is refreshed: the assistant proposal
 * list + the answered dialog, all tasks lists/details (created/rescheduled/
 * mirrored tasks), all goals keys (lists, details, milestones), and the
 * planner blocks (new `task` blocks + Д8 mirrors the Dashboard reads).
 */
export function useApproveProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (proposalId: string) => approveProposal(proposalId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: assistant.proposals() });
      if (result.conversationId) {
        void queryClient.invalidateQueries({
          queryKey: assistant.messages(result.conversationId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: tasks.all });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: planner.blocks });
    },
  });
}

/**
 * Reject a proposal (step 7). Nothing is written except the status flip
 * (`rejected`, `applied_at` stays null per the symmetric CHECK) plus one
 * audit message — so only the assistant prefix is invalidated. A repeated
 * reject is idempotent (200); rejecting an approved proposal is a 409 and
 * leaves every cache untouched because the mutation fails.
 */
export function useRejectProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (proposalId: string) => rejectProposal(proposalId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: assistant.proposals() });
      if (result.conversationId) {
        void queryClient.invalidateQueries({
          queryKey: assistant.messages(result.conversationId),
        });
      }
    },
  });
}
