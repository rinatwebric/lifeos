/**
 * `ai-assistant` Edge Function (iteration 5, steps 3+7; PRD §6.3, §6.5–6.6, §13, §16).
 *
 * Flow: POST { message, conversationId } + user JWT + rate limit + size pre-check → size limit → auth →
 * tool context (skeleton until step 4) → provider (`stub` by default,
 * `openai-compatible` via env) with `response_format` from `toJsonSchema()` →
 * `parseProposal` validation → persist `ai_messages`/`ai_proposals` as the
 * caller under RLS → return the pending proposal.
 *
 * Step 7 adds the decide branch on the same function (discriminator `action`
 * in the body; absence of `action` stays the chat path): POST
 * { action: "approve" | "reject", proposalId } re-reads the proposal as the
 * caller (RLS; чужой id = 404), re-validates every action with
 * `validateActions()` BEFORE the first write, applies in order with the
 * user-scoped client, then marks `approved + applied_at` (or `rejected` with
 * `applied_at` untouched) plus one audit `ai_messages` row without the
 * proposal body or secrets.
 *
 * Invariants (AGENTS.md §5):
 * - no `service_role` anywhere: the Supabase client carries the caller's JWT,
 *   identity comes from `auth.getUser()`, never from a client `user_id`;
 * - secrets live only in function env (`supabase secrets set`); nothing in
 *   git or `VITE_*`; logs carry names/statuses, never keys, tokens or bodies;
 * - chat stores proposals `pending` only; apply/reject re-validates in step 7.
 *   Partial apply failure leaves the proposal `pending` (`applied_at` is set
 *   only after every write); a retry may duplicate rows — atomic
 *   `rpc apply_proposal` is backlog (0007), not this step.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { toDateKey, toWallTime } from "@/lib/dates";
import type { AvailabilityWindows } from "@/types/domain";
import {
  parseProposal,
  toJsonSchema,
  type ProposalAction,
} from "../../../src/lib/aiProposals.ts";

import { ProviderError, type AiChatProvider, type ChatMessage } from "./provider.ts";
import {
  callOpenAiCompatible,
  DEFAULT_TIMEOUT_MS,
} from "./providers/openaiCompatible.ts";
import { createStubProvider } from "./providers/stub.ts";
import { checkChatRateLimit, type RateLimitClient } from "./rateLimit.ts";
import {
  isContentLengthExceeded,
  MAX_BODY_BYTES,
  parseChatRequestBody,
  parseDecideRequestBody,
} from "./request.ts";
import { buildToolContext, TOOL_DEFINITIONS, type UserScopedClient } from "./tools.ts";
import { validateActions, type ValidateContext } from "./validate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "stub").trim().toLowerCase();
const AI_BASE_URL = Deno.env.get("AI_BASE_URL") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "";
const AI_API_KEY = Deno.env.get("AI_API_KEY") ?? "";
const AI_TIMEOUT_RAW = Number.parseInt(Deno.env.get("AI_TIMEOUT_MS") ?? "", 10);
const AI_TIMEOUT_MS =
  Number.isFinite(AI_TIMEOUT_RAW) && AI_TIMEOUT_RAW > 0 ? AI_TIMEOUT_RAW : DEFAULT_TIMEOUT_MS;

const SYSTEM_PROMPT = [
  "You are the LifeOS assistant. You help the user plan goals, tasks and schedules.",
  "Always reply with a single JSON object matching the provided JSON Schema",
  "(proposalType, summary, reasoning, actions). No prose outside the JSON.",
  "Rules: only the allowed proposalType and action types; ISO 8601 dates;",
  "endTime must be after startTime; unknown fields are ignored.",
  "Reply in the language of the user's last message;",
  "never translate the user's goal and task titles.",
].join(" ");

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** `Authorization: Bearer <jwt>` → token, or null. The header itself is never logged. */
function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) {
    return null;
  }
  const token = /^Bearer (.+)$/.exec(header.trim())?.[1]?.trim();
  return token ? token : null;
}

function selectProvider(): AiChatProvider | Response {
  if (AI_PROVIDER === "stub") {
    return createStubProvider();
  }
  if (AI_PROVIDER === "openai-compatible") {
    if (!AI_BASE_URL || !AI_MODEL || !AI_API_KEY) {
      console.error("[ai-assistant] openai-compatible misconfigured: missing base URL, model, or key");
      return json(500, {
        code: "ai_unavailable",
        message: "The assistant is not configured. Set the provider secrets or switch AI_PROVIDER to stub.",
      });
    }
    return {
      name: "openai-compatible",
      chat: (input) =>
        callOpenAiCompatible(input, {
          baseUrl: AI_BASE_URL,
          model: AI_MODEL,
          apiKey: AI_API_KEY,
          timeoutMs: AI_TIMEOUT_MS,
        }),
    };
  }
  console.error("[ai-assistant] unknown AI_PROVIDER", { provider: AI_PROVIDER });
  return json(500, {
    code: "ai_unavailable",
    message: "The assistant is not configured. Please try again later.",
  });
}

async function handleChat(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { code: "method_not_allowed", message: "Only POST is supported." });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[ai-assistant] missing SUPABASE_URL or SUPABASE_ANON_KEY env");
    return json(500, {
      code: "ai_unavailable",
      message: "The assistant is not configured. Please try again later.",
    });
  }

  const jwt = extractBearer(req);
  if (!jwt) {
    return json(401, {
      code: "unauthorized",
      message: "Missing or invalid Authorization header.",
    });
  }

  if (isContentLengthExceeded(req.headers.get("content-length"))) {
    return json(413, { code: "too_large", message: "Request body exceeds " + MAX_BODY_BYTES + " bytes." });
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return json(400, { code: "invalid_json", message: "Could not read the request body." });
  }

  const parsedBody = parseChatRequestBody(bodyText);
  if (!parsedBody.ok) {
    const status = parsedBody.error.code === "too_large" ? 413 : 400;
    return json(status, { code: parsedBody.error.code, message: parsedBody.error.message });
  }
  const { message, conversationId: requestedConversationId } = parsedBody.request;

  // User-scoped client: RLS stays the enforcement point, no service_role.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return json(401, { code: "unauthorized", message: "Invalid or expired token." });
  }

  const rate = await checkChatRateLimit(supabase as unknown as RateLimitClient);
  if (!rate.allowed) {
    console.info("[ai-assistant] rate limited", { user: userId, count: rate.count });
    return json(429, { code: "rate_limited", message: "Too many requests. Please try again tomorrow." });
  }

  const providerOrError = selectProvider();
  if (providerOrError instanceof Response) {
    return providerOrError;
  }
  const provider = providerOrError;

  // Tool context (step 4 real reads) — called so the wiring, the
  // truncate flag and the metadata path are live from day one.
  const context = await buildToolContext(supabase as unknown as UserScopedClient);

  let conversationId = requestedConversationId;
  if (conversationId) {
    const { data: owned, error: ownedError } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .single();
    if (ownedError || !owned) {
      return json(404, { code: "not_found", message: "Conversation not found." });
    }
  } else {
    const title = message.trim().slice(0, 100);
    const { data: created, error: createError } = await supabase
      .from("ai_conversations")
      .insert({ user_id: userId, title })
      .select("id")
      .single();
    if (createError || !created) {
      console.error("[ai-assistant] conversation insert failed", {
        provider: provider.name,
      });
      return json(500, {
        code: "db_error",
        message: "Could not save the conversation. Please try again.",
      });
    }
    conversationId = (created as { id: string }).id;
  }

  // User message first: history survives even if the provider call fails (§16).
  const { data: userMessage, error: userMessageError } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: message,
      metadata: { provider: provider.name, truncated: context.truncated },
    })
    .select("id")
    .single();
  if (userMessageError || !userMessage) {
    console.error("[ai-assistant] user message insert failed", { provider: provider.name });
    return json(500, {
      code: "db_error",
      message: "Could not save the conversation. Please try again.",
    });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: message },
  ];

  let raw: unknown;
  try {
    raw = await provider.chat({
      messages,
      tools: [...TOOL_DEFINITIONS],
      jsonSchema: toJsonSchema() as unknown as Record<string, unknown>,
    });
  } catch (error) {
    console.error("[ai-assistant] provider call failed", {
      provider: provider.name,
      status: error instanceof ProviderError ? error.status : undefined,
    });
    return json(502, {
      code: "ai_unavailable",
      message: "The assistant is temporarily unavailable. Please try again.",
    });
  }

  const parsed = parseProposal(raw);
  if (!parsed.ok) {
    console.error("[ai-assistant] provider returned invalid proposal", {
      provider: provider.name,
      code: parsed.code,
    });
    return json(502, {
      code: "ai_unavailable",
      message: "The assistant returned an invalid response. Please try again.",
    });
  }

  const { data: assistantMessage, error: assistantMessageError } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: parsed.proposal.summary,
      metadata: { provider: provider.name, proposalType: parsed.proposal.proposalType },
    })
    .select("id")
    .single();
  if (assistantMessageError || !assistantMessage) {
    console.error("[ai-assistant] assistant message insert failed", { provider: provider.name });
    return json(500, {
      code: "db_error",
      message: "Could not save the conversation. Please try again.",
    });
  }

  const { data: proposalRow, error: proposalError } = await supabase
    .from("ai_proposals")
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      proposal_type: parsed.proposal.proposalType,
      payload: parsed.proposal,
      status: "pending",
    })
    .select("id")
    .single();
  if (proposalError || !proposalRow) {
    console.error("[ai-assistant] proposal insert failed", { provider: provider.name });
    return json(500, {
      code: "db_error",
      message: "Could not save the proposal. Please try again.",
    });
  }

  const proposalId = (proposalRow as { id: string }).id;
  console.info("[ai-assistant] chat ok", {
    provider: provider.name,
    user: userId,
    conversation: conversationId,
    actions: parsed.proposal.actions.length,
  });
  return json(200, {
    conversationId,
    userMessageId: (userMessage as { id: string }).id,
    assistantMessageId: (assistantMessage as { id: string }).id,
    proposalId,
    proposal: parsed.proposal,
  });
}

type DbClient = ReturnType<typeof createClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

/** Date column writer: date-only passes through, instants fold to the user's day. */
function toDateOnly(value: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const ms = Date.parse(value);
  if (Number.isFinite(ms)) {
    return toDateKey(new Date(ms), timeZone);
  }
  return value.slice(0, 10);
}

/**
 * Validate context for the approve-time re-check (step 7). Preferences come
 * from the caller's own rows through the user-scoped client (same JWT/RLS
 * posture as `tools.ts`); a storage hiccup fails open to documented
 * defaults here because `validateActions()` itself fails closed on its own
 * reads. `now` is created once per decision so expiry uses the same instant.
 */
async function buildApproveValidateContext(
  client: DbClient,
  userId: string,
  now: Date,
): Promise<ValidateContext> {
  let wakeUpTime = "07:00";
  let sleepTime = "23:00";
  let timeZone = "UTC";
  let workingHours: AvailabilityWindows = {};
  let studyHours: AvailabilityWindows = {};

  let prefData: unknown;
  try {
    const prefResult = await client
      .from("user_preferences")
      .select("wake_up_time,sleep_time,working_hours,study_hours")
      .eq("user_id", userId)
      .single();
    prefData = prefResult.error ? null : prefResult.data;
  } catch {
    prefData = null;
  }
  if (isRecord(prefData)) {
    wakeUpTime = toWallTime(prefData["wake_up_time"]) ?? "07:00";
    sleepTime = toWallTime(prefData["sleep_time"]) ?? "23:00";
    if (isRecord(prefData["working_hours"])) {
      workingHours = prefData["working_hours"] as AvailabilityWindows;
    }
    if (isRecord(prefData["study_hours"])) {
      studyHours = prefData["study_hours"] as AvailabilityWindows;
    }
  }

  let profileData: unknown;
  try {
    const profileResult = await client.from("profiles").select("timezone").eq("id", userId).single();
    profileData = profileResult.error ? null : profileResult.data;
  } catch {
    profileData = null;
  }
  if (isRecord(profileData) && typeof profileData["timezone"] === "string") {
    const raw = profileData["timezone"];
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(now);
      timeZone = raw;
    } catch {
      timeZone = "UTC";
    }
  }

  return {
    client: client as unknown as ValidateContext["client"],
    now,
    timeZone,
    wakeUpTime,
    sleepTime,
    workingHours,
    studyHours,
  };
}

async function applyAction(
  client: DbClient,
  userId: string,
  action: ProposalAction,
  now: Date,
  timeZone: string,
  nowIso: string,
): Promise<void> {
  switch (action.type) {
    case "create_goal": {
      const todayKey = toDateKey(now, timeZone);
      const targetKey = action.targetDate === null ? null : toDateOnly(action.targetDate, timeZone);
      const startDate = targetKey !== null && targetKey < todayKey ? targetKey : todayKey;
      const { error } = await client.from("goals").insert({
        user_id: userId,
        title: action.title.trim(),
        description: action.description,
        category: action.category ?? "other",
        priority: action.priority ?? "medium",
        status: "active",
        start_date: startDate,
        target_date: targetKey,
        progress: 0,
        progress_mode: "manual",
        completed_at: null,
      });
      if (error) {
        throw new Error("Goal insert failed");
      }
      return;
    }
    case "create_milestone": {
      let position = 0;
      const posResult = await client
        .from("milestones")
        .select("position")
        .eq("goal_id", action.goalId)
        .eq("user_id", userId)
        .order("position", { ascending: false })
        .limit(1);
      if (!posResult.error && Array.isArray(posResult.data) && posResult.data.length > 0) {
        const first = posResult.data[0];
        if (isRecord(first) && typeof first["position"] === "number") {
          position = first["position"] + 1;
        }
      }
      const { error } = await client.from("milestones").insert({
        user_id: userId,
        goal_id: action.goalId,
        title: action.title.trim(),
        description: null,
        position,
        status: "pending",
        target_date: action.targetDate === null ? null : toDateOnly(action.targetDate, timeZone),
        completed_at: null,
      });
      if (error) {
        throw new Error("Milestone insert failed");
      }
      return;
    }
    case "complete_milestone": {
      const { error } = await client
        .from("milestones")
        .update({ status: "completed", completed_at: nowIso })
        .eq("id", action.milestoneId)
        .eq("user_id", userId);
      if (error) {
        throw new Error("Milestone update failed");
      }
      return;
    }
    case "create_task": {
      const { error } = await client.from("tasks").insert({
        user_id: userId,
        goal_id: action.goalId,
        milestone_id: action.milestoneId,
        title: action.title.trim(),
        description: action.description,
        priority: action.priority ?? "medium",
        status: "todo",
        due_date: action.dueDate === null ? null : toDateOnly(action.dueDate, timeZone),
        scheduled_start: null,
        scheduled_end: null,
        estimated_duration_minutes: action.estimatedDurationMinutes,
        completed_at: null,
        recurrence_rule_id: null,
      });
      if (error) {
        throw new Error("Task insert failed");
      }
      return;
    }
    case "reschedule_task": {
      const { error } = await client
        .from("tasks")
        .update({ due_date: toDateOnly(action.newDate, timeZone), recurrence_rule_id: null })
        .eq("id", action.taskId)
        .eq("user_id", userId);
      if (error) {
        throw new Error("Task reschedule failed");
      }
      return;
    }
    case "schedule_blocks": {
      const startMs = Date.parse(action.startTime);
      const endMs = Date.parse(action.endTime);
      const existing = await client
        .from("time_blocks")
        .select("id,start_time,end_time")
        .eq("task_id", action.taskId)
        .eq("user_id", userId);
      if (!existing.error && Array.isArray(existing.data)) {
        for (const row of existing.data) {
          if (!isRecord(row)) {
            continue;
          }
          const start = row["start_time"];
          const end = row["end_time"];
          if (
            typeof start === "string" &&
            typeof end === "string" &&
            Date.parse(start) === startMs &&
            Date.parse(end) === endMs
          ) {
            const mirror = await client
              .from("tasks")
              .update({ scheduled_start: action.startTime, scheduled_end: action.endTime })
              .eq("id", action.taskId)
              .eq("user_id", userId);
            if (mirror.error) {
              throw new Error("Schedule mirror failed");
            }
            return;
          }
        }
      }
      let blockTitle = "Scheduled block";
      const taskResult = await client
        .from("tasks")
        .select("title")
        .eq("id", action.taskId)
        .eq("user_id", userId)
        .single();
      if (
        !taskResult.error &&
        isRecord(taskResult.data) &&
        typeof taskResult.data["title"] === "string" &&
        taskResult.data["title"].trim() !== ""
      ) {
        blockTitle = taskResult.data["title"].trim();
      }
      const inserted = await client.from("time_blocks").insert({
        user_id: userId,
        task_id: action.taskId,
        title: blockTitle,
        start_time: action.startTime,
        end_time: action.endTime,
        block_type: "task",
      });
      if (inserted.error) {
        throw new Error("Schedule block insert failed");
      }
      const mirror = await client
        .from("tasks")
        .update({ scheduled_start: action.startTime, scheduled_end: action.endTime })
        .eq("id", action.taskId)
        .eq("user_id", userId);
      if (mirror.error) {
        throw new Error("Schedule mirror failed");
      }
      return;
    }
    case "update_preferences": {
      const prefPatch: Record<string, string> = {};
      if (action.wakeUpTime !== null) {
        prefPatch["wake_up_time"] = action.wakeUpTime;
      }
      if (action.sleepTime !== null) {
        prefPatch["sleep_time"] = action.sleepTime;
      }
      if (Object.keys(prefPatch).length > 0) {
        const { error } = await client
          .from("user_preferences")
          .update(prefPatch)
          .eq("user_id", userId);
        if (error) {
          throw new Error("Preferences update failed");
        }
      }
      const profilePatch: Record<string, string> = {};
      if (action.timezone !== null) {
        profilePatch["timezone"] = action.timezone;
      }
      if (action.language !== null) {
        profilePatch["language"] = action.language;
      }
      if (action.theme !== null) {
        profilePatch["theme"] = action.theme;
      }
      if (Object.keys(profilePatch).length > 0) {
        const { error } = await client.from("profiles").update(profilePatch).eq("id", userId);
        if (error) {
          throw new Error("Profile update failed");
        }
      }
      return;
    }
  }
}

async function handleApprove(client: DbClient, userId: string, proposalId: string): Promise<Response> {
  const { data: proposalData, error: proposalError } = await client
    .from("ai_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .single();
  if (proposalError || !isRecord(proposalData)) {
    return json(404, { code: "not_found", message: "Proposal not found." });
  }
  if (readString(proposalData, "status") !== "pending") {
    return json(409, { code: "already_decided", message: "Proposal has already been decided." });
  }
  const expiresAt = proposalData["expires_at"];
  if (typeof expiresAt === "string") {
    const expMs = Date.parse(expiresAt);
    if (Number.isFinite(expMs) && expMs < Date.now()) {
      return json(410, { code: "expired", message: "Proposal has expired." });
    }
  }
  const parsed = parseProposal(proposalData["payload"]);
  if (!parsed.ok) {
    console.error("[ai-assistant] approve: stored payload invalid", {
      proposal: proposalId,
      code: parsed.code,
    });
    return json(500, {
      code: "db_error",
      message: "Could not apply the proposal. Please try again.",
    });
  }
  const actions = parsed.proposal.actions;
  const total = actions.length;
  const now = new Date();
  const nowIso = now.toISOString();
  const validateContext = await buildApproveValidateContext(client, userId, now);
  const validation = await validateActions(actions, validateContext);
  if (!validation.ok) {
    return json(422, {
      code: "validation_failed",
      message: validation.message,
      index: validation.index,
      actionCode: validation.code,
    });
  }
  let applied = 0;
  try {
    for (const action of actions) {
      await applyAction(client, userId, action, now, validateContext.timeZone, nowIso);
      applied += 1;
    }
  } catch {
    console.error("[ai-assistant] apply failed", { proposal: proposalId, applied, total });
    return json(500, {
      code: "apply_failed",
      message: "Could not apply the proposal. Please try again.",
      applied,
      total,
    });
  }
  const statusResult = await client
    .from("ai_proposals")
    .update({ status: "approved", applied_at: nowIso })
    .eq("id", proposalId)
    .eq("user_id", userId);
  if (statusResult.error) {
    console.error("[ai-assistant] approve status update failed", { proposal: proposalId });
    return json(500, {
      code: "apply_failed",
      message: "Could not apply the proposal. Please try again.",
      applied,
      total,
    });
  }
  const conversationRaw = proposalData["conversation_id"];
  const conversationValue = typeof conversationRaw === "string" ? conversationRaw : null;
  if (conversationValue !== null) {
    const audit = await client.from("ai_messages").insert({
      conversation_id: conversationValue,
      user_id: userId,
      role: "assistant",
      content: `Proposal applied: ${applied} of ${total} actions.`,
      metadata: { proposalId, applied, rejected: false },
    });
    if (audit.error) {
      console.error("[ai-assistant] approve audit insert failed", { proposal: proposalId });
    }
  }
  console.info("[ai-assistant] approve ok", { proposal: proposalId, applied, total });
  return json(200, {
    proposalId,
    status: "approved",
    conversationId: conversationValue,
    applied,
    total,
  });
}

async function handleReject(client: DbClient, userId: string, proposalId: string): Promise<Response> {
  const { data: proposalData, error: proposalError } = await client
    .from("ai_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("user_id", userId)
    .single();
  if (proposalError || !isRecord(proposalData)) {
    return json(404, { code: "not_found", message: "Proposal not found." });
  }
  const conversationRaw = proposalData["conversation_id"];
  const conversationValue = typeof conversationRaw === "string" ? conversationRaw : null;
  let total = 0;
  const parsed = parseProposal(proposalData["payload"]);
  if (parsed.ok) {
    total = parsed.proposal.actions.length;
  }
  const status = readString(proposalData, "status");
  if (status === "rejected") {
    return json(200, {
      proposalId,
      status: "rejected",
      conversationId: conversationValue,
      applied: 0,
      total,
    });
  }
  if (status !== "pending") {
    return json(409, { code: "already_decided", message: "Proposal has already been decided." });
  }
  const statusResult = await client
    .from("ai_proposals")
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .eq("user_id", userId);
  if (statusResult.error) {
    console.error("[ai-assistant] reject status update failed", { proposal: proposalId });
    return json(500, {
      code: "db_error",
      message: "Could not reject the proposal. Please try again.",
    });
  }
  if (conversationValue !== null) {
    const audit = await client.from("ai_messages").insert({
      conversation_id: conversationValue,
      user_id: userId,
      role: "assistant",
      content: "Proposal rejected. Nothing was changed.",
      metadata: { proposalId, applied: 0, rejected: true },
    });
    if (audit.error) {
      console.error("[ai-assistant] reject audit insert failed", { proposal: proposalId });
    }
  }
  console.info("[ai-assistant] reject ok", { proposal: proposalId });
  return json(200, {
    proposalId,
    status: "rejected",
    conversationId: conversationValue,
    applied: 0,
    total,
  });
}

async function handleDecision(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { code: "method_not_allowed", message: "Only POST is supported." });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[ai-assistant] missing SUPABASE_URL or SUPABASE_ANON_KEY env");
    return json(500, {
      code: "ai_unavailable",
      message: "The assistant is not configured. Please try again later.",
    });
  }

  const jwt = extractBearer(req);
  if (!jwt) {
    return json(401, {
      code: "unauthorized",
      message: "Missing or invalid Authorization header.",
    });
  }

  if (isContentLengthExceeded(req.headers.get("content-length"))) {
    return json(413, { code: "too_large", message: "Request body exceeds " + MAX_BODY_BYTES + " bytes." });
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return json(400, { code: "invalid_json", message: "Could not read the request body." });
  }

  const parsedBody = parseDecideRequestBody(bodyText);
  if (!parsedBody.ok) {
    const status = parsedBody.error.code === "too_large" ? 413 : 400;
    return json(status, { code: parsedBody.error.code, message: parsedBody.error.message });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return json(401, { code: "unauthorized", message: "Invalid or expired token." });
  }

  if (parsedBody.request.action === "approve") {
    return await handleApprove(supabase, userId, parsedBody.request.proposalId);
  }
  return await handleReject(supabase, userId, parsedBody.request.proposalId);
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === "POST") {
      let hasAction = false;
      try {
        const peeked: unknown = JSON.parse(await req.clone().text());
        hasAction =
          typeof peeked === "object" && peeked !== null && !Array.isArray(peeked) && "action" in peeked;
      } catch {
        hasAction = false;
      }
      if (hasAction) {
        return await handleDecision(req);
      }
    }
    return await handleChat(req);
  } catch (error) {
    console.error("[ai-assistant] unexpected failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return json(500, {
      code: "ai_unavailable",
      message: "The assistant is temporarily unavailable. Please try again.",
    });
  }
});
