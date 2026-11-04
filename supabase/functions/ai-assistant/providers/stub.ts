/**
 * Deterministic stub provider (iteration 5, step 3).
 *
 * Used when `AI_PROVIDER=stub` (the default): answers with a fixed fixture,
 * no network, no key. The fixture MUST satisfy `parseProposal` from
 * `src/lib/aiProposals.ts` — enforced by `providers/stub.test.ts`, which
 * fails the suite if the fixture ever drifts from the contract.
 */

import type { AiChatProvider, ProviderChatInput } from "../provider.ts";

export const STUB_PROVIDER_NAME = "stub" as const;

/**
 * Minimal but complete contract example: `task_creation` with one fully
 * specified task (exercises nullable enum + integer paths of the serializer)
 * and one all-null task. Mirrors the happy-path fixtures of
 * `src/lib/aiProposals.test.ts`.
 */
export const STUB_PROPOSAL_RESPONSE = {
  proposalType: "task_creation",
  summary: "Stub plan: two starter tasks while the provider is offline.",
  reasoning:
    "Stub provider returns a fixed fixture; no model was called and no user data left the project.",
  actions: [
    {
      type: "create_task",
      title: "Review today's priorities",
      description: "Pick the three most important tasks for today.",
      goalId: null,
      milestoneId: null,
      priority: "medium",
      dueDate: null,
      estimatedDurationMinutes: 30,
    },
    {
      type: "create_task",
      title: "Take a short walk",
      description: null,
      goalId: null,
      milestoneId: null,
      priority: null,
      dueDate: null,
      estimatedDurationMinutes: null,
    },
  ],
};

export function createStubProvider(): AiChatProvider {
  return {
    name: STUB_PROVIDER_NAME,
    async chat(_input: ProviderChatInput): Promise<unknown> {
      // Fresh deep copy per call so callers can never mutate the fixture.
      return structuredClone(STUB_PROPOSAL_RESPONSE);
    },
  };
}
