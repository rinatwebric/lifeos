import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listConversations, listMessages, sendMessage } from "./api";
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
