import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assistantProposalSchema,
  parseProposal,
  PROPOSAL_ACTION_TYPES,
  proposalActionsSchema,
  toJsonSchema,
  type JsonSchemaNode,
} from "@/lib/aiProposals";

function expectOk(raw: unknown) {
  const result = parseProposal(raw);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.code}: ${result.issues.join("; ")}`);
  }
  return result.proposal;
}

function expectFailure(raw: unknown) {
  const result = parseProposal(raw);
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected failure");
  }
  return result;
}

const base = {
  summary: "Lighter week while you recover.",
  reasoning: "18 planned hours, 12 available; low-priority items move first.",
};

describe("parseProposal happy paths (one per proposal_type)", () => {
  it("goal_breakdown: create_goal + create_milestone + complete_milestone", () => {
    const proposal = expectOk({
      ...base,
      proposalType: "goal_breakdown",
      actions: [
        {
          type: "create_goal",
          title: "Frontend developer",
          description: null,
          category: "career",
          priority: "high",
          targetDate: null,
        },
        {
          type: "create_milestone",
          goalId: "goal-1",
          title: "Learn React",
          targetDate: "2026-12-01",
        },
        { type: "complete_milestone", milestoneId: "ms-9" },
      ],
    });
    expect(proposal.proposalType).toBe("goal_breakdown");
    expect(proposal.actions).toHaveLength(3);
  });

  it("task_creation: full and all-null create_task", () => {
    const proposal = expectOk({
      ...base,
      proposalType: "task_creation",
      actions: [
        {
          type: "create_task",
          title: "Read React docs",
          description: "Chapters 1-3",
          goalId: "goal-1",
          milestoneId: "ms-1",
          priority: "medium",
          dueDate: "2026-11-10",
          estimatedDurationMinutes: 60,
        },
        {
          type: "create_task",
          title: "Walk",
          description: null,
          goalId: null,
          milestoneId: null,
          priority: null,
          dueDate: null,
          estimatedDurationMinutes: null,
        },
      ],
    });
    expect(proposal.actions).toHaveLength(2);
  });

  it("schedule_suggestion: schedule_blocks", () => {
    const proposal = expectOk({
      ...base,
      proposalType: "schedule_suggestion",
      actions: [
        {
          type: "schedule_blocks",
          taskId: "task-1",
          startTime: "2026-11-05T09:00:00.000Z",
          endTime: "2026-11-05T10:00:00.000Z",
        },
      ],
    });
    expect(proposal.actions[0]?.type).toBe("schedule_blocks");
  });

  it("schedule_changes: reschedule_task", () => {
    const proposal = expectOk({
      ...base,
      proposalType: "schedule_changes",
      actions: [
        { type: "reschedule_task", taskId: "task-2", newDate: "2026-11-06", reason: "Lower priority" },
        { type: "reschedule_task", taskId: "task-3", newDate: "2026-11-07T10:00:00+03:00", reason: null },
      ],
    });
    expect(proposal.actions).toHaveLength(2);
  });

  it("productivity_analysis: update_preferences", () => {
    const proposal = expectOk({
      ...base,
      proposalType: "productivity_analysis",
      actions: [
        {
          type: "update_preferences",
          wakeUpTime: "07:30",
          sleepTime: null,
          timezone: null,
          language: null,
          theme: null,
        },
      ],
    });
    expect(proposal.actions[0]?.type).toBe("update_preferences");
  });

  it("productivity_analysis: empty actions (insights only)", () => {
    const proposal = expectOk({ ...base, proposalType: "productivity_analysis", actions: [] });
    expect(proposal.actions).toStrictEqual([]);
  });
});

describe("parseProposal input shapes", () => {
  it("accepts a raw JSON string", () => {
    const proposal = expectOk(
      JSON.stringify({ ...base, proposalType: "task_creation", actions: [] }),
    );
    expect(proposal.proposalType).toBe("task_creation");
  });

  it("strips unknown free-form fields instead of failing", () => {
    const proposal = expectOk({
      ...base,
      proposalType: "task_creation",
      actions: [],
      injected: "ignore me",
    });
    expect(proposal).not.toHaveProperty("injected");
  });
});

describe("parseProposal rejections", () => {
  it("empty payload object → invalid_schema", () => {
    expect(expectFailure({}).code).toBe("invalid_schema");
  });

  it("non-object payloads → invalid_json", () => {
    expect(expectFailure(null).code).toBe("invalid_json");
    expect(expectFailure([1, 2]).code).toBe("invalid_json");
    expect(expectFailure(42).code).toBe("invalid_json");
  });

  it("broken JSON text → invalid_json", () => {
    expect(expectFailure("{oops").code).toBe("invalid_json");
  });

  it("unknown proposalType → unknown_type", () => {
    expect(
      expectFailure({ ...base, proposalType: "mind_control", actions: [] }).code,
    ).toBe("unknown_type");
  });

  it("unknown action type → unknown_type", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "task_creation",
        actions: [{ type: "delete_everything" }],
      }).code,
    ).toBe("unknown_type");
  });

  it("inverted interval → bad_date", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "schedule_suggestion",
        actions: [
          {
            type: "schedule_blocks",
            taskId: "task-1",
            startTime: "2026-11-05T10:00:00.000Z",
            endTime: "2026-11-05T09:00:00.000Z",
          },
        ],
      }).code,
    ).toBe("bad_date");
  });

  it("zero-length interval → bad_date", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "schedule_suggestion",
        actions: [
          {
            type: "schedule_blocks",
            taskId: "task-1",
            startTime: "2026-11-05T10:00:00.000Z",
            endTime: "2026-11-05T10:00:00.000Z",
          },
        ],
      }).code,
    ).toBe("bad_date");
  });

  it("non-ISO date → bad_date", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "task_creation",
        actions: [
          {
            type: "create_task",
            title: "X",
            description: null,
            goalId: null,
            milestoneId: null,
            priority: null,
            dueDate: "tomorrow",
            estimatedDurationMinutes: null,
          },
        ],
      }).code,
    ).toBe("bad_date");
  });

  it("impossible calendar date → bad_date", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "schedule_changes",
        actions: [{ type: "reschedule_task", taskId: "t", newDate: "2026-13-40", reason: null }],
      }).code,
    ).toBe("bad_date");
  });

  it("negative duration → invalid_schema", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "task_creation",
        actions: [
          {
            type: "create_task",
            title: "X",
            description: null,
            goalId: null,
            milestoneId: null,
            priority: null,
            dueDate: null,
            estimatedDurationMinutes: -30,
          },
        ],
      }).code,
    ).toBe("invalid_schema");
  });

  it("missing required key → invalid_schema", () => {
    expect(
      expectFailure({
        ...base,
        proposalType: "schedule_suggestion",
        actions: [
          {
            type: "schedule_blocks",
            startTime: "2026-11-05T09:00:00.000Z",
            endTime: "2026-11-05T10:00:00.000Z",
          },
        ],
      }).code,
    ).toBe("invalid_schema");
  });
});

type JsonRecord = Record<string, unknown>;

function childNodes(node: JsonRecord): JsonRecord[] {
  const out: JsonRecord[] = [];
  const properties = node.properties;
  if (typeof properties === "object" && properties !== null) {
    for (const value of Object.values(properties)) {
      if (typeof value === "object" && value !== null) {
        out.push(value as JsonRecord);
      }
    }
  }
  const items = node.items;
  if (typeof items === "object" && items !== null) {
    out.push(items as JsonRecord);
  }
  const anyOf = node.anyOf;
  if (Array.isArray(anyOf)) {
    for (const branch of anyOf) {
      if (typeof branch === "object" && branch !== null) {
        out.push(branch as JsonRecord);
      }
    }
  }
  return out;
}

function assertStrictSubset(node: JsonRecord, path: string): void {
  for (const banned of ["$ref", "oneOf", "allOf"]) {
    expect(node, `${path} must not contain ${banned}`).not.toHaveProperty(banned);
  }
  if ("properties" in node) {
    expect(node.type, `${path} object type`).toBe("object");
    expect(node.additionalProperties, `${path} closed`).toBe(false);
    const properties = node.properties as JsonRecord;
    const keys = Object.keys(properties).sort();
    expect(Array.isArray(node.required), `${path} required is an array`).toBe(true);
    expect([...(node.required as string[])].sort(), `${path} required = all keys`).toStrictEqual(keys);
  }
  for (const child of childNodes(node)) {
    assertStrictSubset(child, path);
  }
}

describe("toJsonSchema strict-subset (Meta structured-output rules)", () => {
  it("root is a plain object: no anyOf/oneOf/allOf/enum/$ref", () => {
    const schema = toJsonSchema() as unknown as JsonRecord;
    for (const banned of ["anyOf", "oneOf", "allOf", "enum", "$ref"]) {
      expect(schema, `root must not contain ${banned}`).not.toHaveProperty(banned);
    }
    expect(schema.type).toBe("object");
  });

  it("every nested object is closed and requires all its keys", () => {
    assertStrictSubset(toJsonSchema() as unknown as JsonRecord, "proposal");
  });

  it("graph is acyclic, depth <= 10, node budget respected", () => {
    const root = toJsonSchema() as unknown as JsonRecord;
    const seen = new Set<object>();
    let count = 0;
    let maxDepth = 0;
    const walk = (node: JsonRecord, depth: number): void => {
      expect(depth, "schema depth <= 10").toBeLessThanOrEqual(10);
      maxDepth = Math.max(maxDepth, depth);
      expect(seen.has(node), "schema graph is acyclic").toBe(false);
      seen.add(node);
      count += 1;
      for (const child of childNodes(node)) {
        walk(child, depth + 1);
      }
    };
    walk(root, 0);
    expect(count).toBeLessThanOrEqual(5000);
    expect(maxDepth).toBeLessThanOrEqual(10);
  });

  it("action types const matches the discriminated union", () => {
    const element = proposalActionsSchema.element;
    expect(element).toBeInstanceOf(z.ZodUnion);
    const union = element as z.ZodUnion;
    const fromUnion = union.options.map((option) => {
      expect(option).toBeInstanceOf(z.ZodObject);
      const shape = (option as z.ZodObject).shape as Record<string, unknown>;
      const discriminator = shape.type;
      expect(discriminator).toBeInstanceOf(z.ZodLiteral);
      return Array.from((discriminator as z.ZodLiteral).values)[0];
    });
    expect([...fromUnion].sort()).toStrictEqual([...PROPOSAL_ACTION_TYPES].sort());
  });

  it("returns an equal value on every call", () => {
    expect(toJsonSchema()).toStrictEqual(toJsonSchema());
  });

  it("serializes the envelope schema, not an empty stub", () => {
    const schema: JsonSchemaNode = toJsonSchema();
    expect(Object.keys(schema.properties ?? {})).toStrictEqual([
      "proposalType",
      "summary",
      "reasoning",
      "actions",
    ]);
  });
});

describe("schema exports used by later steps", () => {
  it("assistantProposalSchema accepts the envelope directly", () => {
    const parsed = assistantProposalSchema.safeParse({
      ...base,
      proposalType: "task_creation",
      actions: [],
    });
    expect(parsed.success).toBe(true);
  });
});
