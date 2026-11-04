import { z } from "zod";
import type { $ZodType } from "zod/v4/core";

import { GOAL_CATEGORIES, PRIORITIES, PROPOSAL_TYPES } from "@/types/domain";

/**
 * Single source of truth for the assistant's structured output (plan-phase-4,
 * step 2; PRD §6.5, §16). The provider is asked for JSON matching
 * `toJsonSchema()`; whatever comes back is re-validated here with Zod before
 * it can become a proposal. Unrecognised free-form fields are stripped by
 * Zod (prompt-injection mitigation, plan §6), never applied.
 *
 * Contract notes (Meta Model API structured-output rules, verified by
 * reviewer — do not loosen without re-checking dev.meta.ai/docs):
 * - every object is closed (`additionalProperties: false` in JSON Schema);
 * - every key is required — there are no `optional()` fields in this file,
 *   `null` means "absent" (strict-mode compatible);
 * - the root schema is a plain object; unions (`anyOf`) appear only nested,
 *   never at the root; no `$ref`, no `oneOf`/`allOf`, no root `enum`;
 * - the JSON Schema carries no `minLength`/`format` refinements — Zod is the
 *   enforcing validator, the schema is provider guidance;
 * - field name is `proposalType` (maps 1:1 to `ai_proposals.proposal_type`;
 *   the PRD §6.5 illustration uses `type` — the real contract is this file).
 */

export const PROPOSAL_ACTION_TYPES = [
  "create_goal",
  "create_milestone",
  "complete_milestone",
  "create_task",
  "reschedule_task",
  "schedule_blocks",
  "update_preferences",
] as const;
export type ProposalActionType = (typeof PROPOSAL_ACTION_TYPES)[number];

const ACTION_TYPE_SET: ReadonlySet<string> = new Set(PROPOSAL_ACTION_TYPES);

const titleField = z.string().min(1).max(200);
const nullableText = z.string().max(2000).nullable();
const nullableId = z.string().min(1).max(100).nullable();
/** ISO 8601 date or instant as a string; parseability is checked semantically. */
const nullableIso = z.string().min(1).max(100).nullable();
const requiredIso = z.string().min(1).max(100);

const createGoalActionSchema = z.object({
  type: z.literal("create_goal"),
  title: titleField,
  description: nullableText,
  category: z.enum(GOAL_CATEGORIES).nullable(),
  priority: z.enum(PRIORITIES).nullable(),
  targetDate: nullableIso,
});

const createMilestoneActionSchema = z.object({
  type: z.literal("create_milestone"),
  goalId: z.string().min(1).max(100),
  title: titleField,
  targetDate: nullableIso,
});

const completeMilestoneActionSchema = z.object({
  type: z.literal("complete_milestone"),
  milestoneId: z.string().min(1).max(100),
});

const createTaskActionSchema = z.object({
  type: z.literal("create_task"),
  title: titleField,
  description: nullableText,
  goalId: nullableId,
  milestoneId: nullableId,
  priority: z.enum(PRIORITIES).nullable(),
  dueDate: nullableIso,
  estimatedDurationMinutes: z.number().int().positive().nullable(),
});

const rescheduleTaskActionSchema = z.object({
  type: z.literal("reschedule_task"),
  taskId: z.string().min(1).max(100),
  newDate: requiredIso,
  reason: z.string().max(500).nullable(),
});

const scheduleBlocksActionSchema = z.object({
  type: z.literal("schedule_blocks"),
  taskId: z.string().min(1).max(100),
  startTime: requiredIso,
  endTime: requiredIso,
});

const updatePreferencesActionSchema = z.object({
  type: z.literal("update_preferences"),
  wakeUpTime: z.string().max(5).nullable(),
  sleepTime: z.string().max(5).nullable(),
  timezone: z.string().max(100).nullable(),
  language: z.string().max(10).nullable(),
  theme: z.string().max(10).nullable(),
});

const proposalActionSchema = z.discriminatedUnion("type", [
  createGoalActionSchema,
  createMilestoneActionSchema,
  completeMilestoneActionSchema,
  createTaskActionSchema,
  rescheduleTaskActionSchema,
  scheduleBlocksActionSchema,
  updatePreferencesActionSchema,
]);

export const proposalActionsSchema = z.array(proposalActionSchema);

export const assistantProposalSchema = z.object({
  proposalType: z.enum(PROPOSAL_TYPES),
  summary: z.string().min(1).max(500),
  reasoning: z.string().min(1).max(2000),
  actions: proposalActionsSchema,
});

export type ProposalAction = z.infer<typeof proposalActionSchema>;
export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export const PROPOSAL_PARSE_ERROR_CODES = [
  "invalid_json",
  "unknown_type",
  "bad_date",
  "invalid_schema",
] as const;
export type ProposalParseErrorCode = (typeof PROPOSAL_PARSE_ERROR_CODES)[number];

export interface ProposalParseSuccess {
  ok: true;
  proposal: AssistantProposal;
}

export interface ProposalParseFailure {
  ok: false;
  code: ProposalParseErrorCode;
  issues: string[];
}

export type ParseProposalResult = ProposalParseSuccess | ProposalParseFailure;

function failure(code: ProposalParseErrorCode, issues: string[]): ProposalParseFailure {
  return { ok: false, code, issues };
}

/** Strict ISO 8601 date (`2026-11-05`) or instant; returns epoch ms or null. */
function parseIsoInstant(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

interface DateField {
  field: string;
  value: string | null;
}

function collectDateFields(action: ProposalAction): DateField[] {
  switch (action.type) {
    case "create_goal":
      return [{ field: "targetDate", value: action.targetDate }];
    case "create_milestone":
      return [{ field: "targetDate", value: action.targetDate }];
    case "create_task":
      return [{ field: "dueDate", value: action.dueDate }];
    case "reschedule_task":
      return [{ field: "newDate", value: action.newDate }];
    case "schedule_blocks":
      return [
        { field: "startTime", value: action.startTime },
        { field: "endTime", value: action.endTime },
      ];
    case "complete_milestone":
    case "update_preferences":
      return [];
  }
}

/**
 * Parse one assistant response (already-decoded object or raw JSON text).
 * Error taxonomy for this layer (DB-dependent codes arrive in step 5):
 * - `invalid_json` — not JSON text / not a JSON object;
 * - `unknown_type` — `proposalType` or an action `type` outside the unions;
 * - `bad_date` — date field is not ISO 8601 or the interval is inverted;
 * - `invalid_schema` — everything else the contract rejects.
 */
export function parseProposal(raw: unknown): ParseProposalResult {
  let data: unknown = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return failure("invalid_json", ["response is not valid JSON"]);
    }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return failure("invalid_json", ["response must be a JSON object"]);
  }
  const record = data as Record<string, unknown>;

  if (
    typeof record.proposalType === "string" &&
    !(PROPOSAL_TYPES as readonly string[]).includes(record.proposalType)
  ) {
    return failure("unknown_type", [`unknown proposalType: ${record.proposalType}`]);
  }

  if (Array.isArray(record.actions)) {
    for (let index = 0; index < record.actions.length; index += 1) {
      const entry = record.actions[index] as Record<string, unknown> | null;
      if (
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.type === "string" &&
        !ACTION_TYPE_SET.has(entry.type)
      ) {
        return failure("unknown_type", [`actions[${index}].type: unknown action type ${entry.type}`]);
      }
    }
  }

  const parsed = assistantProposalSchema.safeParse(data);
  if (!parsed.success) {
    return failure(
      "invalid_schema",
      parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${path}: ${issue.message}`;
      }),
    );
  }

  for (let index = 0; index < parsed.data.actions.length; index += 1) {
    const action = parsed.data.actions[index];
    const fields = collectDateFields(action);
    const moments = new Map<string, number>();
    for (const { field, value } of fields) {
      if (value === null) continue;
      const ms = parseIsoInstant(value);
      if (ms === null) {
        return failure("bad_date", [`actions[${index}].${field}: not a valid ISO 8601 date: ${value}`]);
      }
      moments.set(field, ms);
    }
    if (action.type === "schedule_blocks") {
      const start = moments.get("startTime");
      const end = moments.get("endTime");
      if (start !== undefined && end !== undefined && end <= start) {
        return failure("bad_date", [`actions[${index}]: endTime must be after startTime`]);
      }
    }
  }

  return { ok: true, proposal: parsed.data };
}

/** Plain-JSON-Schema node (no `$ref`, no cycles — safe to send to the provider). */
export interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  enum?: Array<string | number | boolean>;
}

function literalValues(values: Set<unknown>, where: string): Array<string | number | boolean> {
  const out: Array<string | number | boolean> = [];
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out.push(value);
    } else {
      throw new Error(`toJsonSchema: unsupported literal at ${where}`);
    }
  }
  if (out.length === 0) {
    throw new Error(`toJsonSchema: empty literal at ${where}`);
  }
  return out;
}

function enumStrings(options: readonly unknown[], where: string): string[] {
  return options.map((option) => {
    if (typeof option !== "string") {
      throw new Error(`toJsonSchema: non-string enum at ${where}`);
    }
    return option;
  });
}

/**
 * Hand-written Zod → JSON Schema serializer (no zod-to-json-schema dep).
 * Supports exactly the constructors used in the contract above; anything
 * else throws loudly instead of emitting a silently wrong schema.
 * Unions (incl. the discriminated action union) become a nested `anyOf` —
 * the root stays a plain object, per the strict-mode rules.
 */
function convertSchema(schema: $ZodType, where: string): JsonSchemaNode {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return convertSchema(schema.unwrap(), where);
  }
  if (schema instanceof z.ZodNullable) {
    const inner = convertSchema(schema.unwrap(), where);
    if (typeof inner.type !== "string" || inner.anyOf !== undefined) {
      throw new Error(`toJsonSchema: unsupported nullable inner at ${where}`);
    }
    return { type: [inner.type, "null"] };
  }
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, JsonSchemaNode> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(schema.shape)) {
      properties[key] = convertSchema(field, `${where}.${key}`);
      if (!(field instanceof z.ZodOptional) && !(field instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return { type: "object", properties, required, additionalProperties: false };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: convertSchema(schema.element, `${where}[]`) };
  }
  if (schema instanceof z.ZodUnion) {
    return { anyOf: schema.options.map((option) => convertSchema(option, where)) };
  }
  if (schema instanceof z.ZodLiteral) {
    const values = literalValues(schema.values, where);
    return { type: typeof values[0], enum: values };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: enumStrings(schema.options, where) };
  }
  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }
  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }
  throw new Error(`toJsonSchema: unsupported schema ${schema.constructor.name} at ${where}`);
}

/** Provider-facing JSON Schema for the whole proposal envelope. */
export function toJsonSchema(): JsonSchemaNode {
  return convertSchema(assistantProposalSchema, "proposal");
}
