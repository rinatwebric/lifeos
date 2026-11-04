/**
 * Tool-layer skeleton (iteration 5, step 3; PRD §6.4).
 *
 * The nine fixed tools are the ONLY way the assistant touches user data:
 * four read the caller's own rows, five `suggest_*`/`analyze_*` return
 * proposals — never writes. Real reads land in step 4; this skeleton exposes
 * the names, descriptions and an honest empty context so the provider wiring
 * (step 3) can ship without fabricating data (PRD §22 p. 4).
 */

import type { ToolDefinition } from "./provider.ts";

export const READ_TOOL_NAMES = [
  "get_user_goals",
  "get_user_tasks",
  "get_weekly_progress",
  "get_user_preferences",
] as const;

export const SUGGEST_TOOL_NAMES = [
  "suggest_goal_breakdown",
  "suggest_task_creation",
  "suggest_schedule",
  "suggest_schedule_changes",
  "analyze_productivity",
] as const;

/** All nine tools from PRD §6.4 — a closed set, no ad-hoc tool names. */
export const TOOL_NAMES = [...READ_TOOL_NAMES, ...SUGGEST_TOOL_NAMES] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

function define(name: ToolName, description: string): ToolDefinition {
  return {
    name,
    description,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  };
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  define(
    "get_user_goals",
    "Read the caller's active goals (titles, status, progress). Never returns another user's data.",
  ),
  define(
    "get_user_tasks",
    "Read the caller's recent tasks (titles, status, due dates). Never returns another user's data.",
  ),
  define(
    "get_weekly_progress",
    "Summarize completed vs total tasks for the current week in the caller's timezone.",
  ),
  define(
    "get_user_preferences",
    "Read the caller's planning preferences (working hours, timezone). Never returns another user's data.",
  ),
  define(
    "suggest_goal_breakdown",
    "Propose milestones breaking a goal down. Returns a proposal, never writes milestones.",
  ),
  define(
    "suggest_task_creation",
    "Propose tasks derived from milestones. Returns a proposal, never writes tasks.",
  ),
  define(
    "suggest_schedule",
    "Propose schedule blocks for tasks. Returns a proposal, never writes time blocks.",
  ),
  define(
    "suggest_schedule_changes",
    "Propose rescheduling of existing tasks. Returns a proposal, never moves tasks.",
  ),
  define(
    "analyze_productivity",
    "Analyze progress and explain it. Returns insights as a proposal, never changes settings.",
  ),
];

/** Data handed to the provider as context. Empty until step 4 — never mocked. */
export interface ToolContext {
  goals: unknown[];
  tasks: unknown[];
  /** True when the context was cut to fit; the cut is disclosed in metadata. */
  truncated: boolean;
}

/**
 * Minimal surface the skeleton needs from a user-scoped Supabase client.
 * Step 4 widens this to the real query set; the client always carries the
 * caller's JWT, so RLS (`user_id = auth.uid()`) holds and no `user_id`
 * argument is ever accepted from the client.
 */
export interface UserScopedClient {
  from(table: string): unknown;
}

/**
 * Skeleton implementation: honest empty context (no fabricated rows).
 * Step 4 implements the four reads, the truncate flag and the weekly math.
 */
export async function buildToolContext(_client: UserScopedClient): Promise<ToolContext> {
  return { goals: [], tasks: [], truncated: false };
}
