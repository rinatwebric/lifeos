/**
 * TanStack Query key factory for the assistant (iteration 5, step 6).
 * Same shape as `planner/queryKeys.ts`: every hook builds its key here so
 * invalidation stays scoped — never a bare `invalidateQueries()` over the
 * whole cache. `conversations` is the shared prefix for the list;
 * `messages(conversationId)` scopes one dialog; `proposals(status)` is
 * reserved for step 7 (approve/reject) and unused by the step-6 hooks.
 */
import type { AiProposalStatus } from "@/types/domain";

export const assistant = {
  all: ["assistant"] as const,
  conversations: ["assistant", "conversations"] as const,
  messages: (conversationId: string) => ["assistant", "messages", conversationId] as const,
  proposals: (status?: AiProposalStatus) =>
    (status
      ? (["assistant", "proposals", status] as const)
      : (["assistant", "proposals"] as const)),
};

/** Alias for readers that prefer an explicit `*QueryKeys` name. */
export const assistantQueryKeys = assistant;
