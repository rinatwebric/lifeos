import { describe, expect, it } from "vitest";

import { parseProposal } from "../../../../src/lib/aiProposals";

import { createStubProvider, STUB_PROPOSAL_RESPONSE } from "./stub.ts";

describe("stub provider", () => {
  it("stub fixture passes parseProposal", () => {
    const result = parseProposal(STUB_PROPOSAL_RESPONSE);
    if (!result.ok) {
      throw new Error(`stub fixture must be contract-valid: ${result.issues.join("; ")}`);
    }
    expect(result.proposal.proposalType).toBe("task_creation");
    expect(result.proposal.actions).toHaveLength(2);
  });

  it("stub chat returns a fresh copy without touching the network", async () => {
    const provider = createStubProvider();
    expect(provider.name).toBe("stub");
    const first = await provider.chat({ messages: [], tools: [], jsonSchema: {} });
    const second = await provider.chat({ messages: [], tools: [], jsonSchema: {} });
    expect(first).toStrictEqual(STUB_PROPOSAL_RESPONSE);
    expect(first).not.toBe(STUB_PROPOSAL_RESPONSE);
    expect(second).not.toBe(first);
  });
});
