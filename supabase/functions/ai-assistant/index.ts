/**
 * `ai-assistant` Edge Function (iteration 5, step 3; PRD §6.3, §13, §16).
 *
 * Flow: POST { message, conversationId } + user JWT → size limit → auth →
 * tool context (skeleton until step 4) → provider (`stub` by default,
 * `openai-compatible` via env) with `response_format` from `toJsonSchema()` →
 * `parseProposal` validation → persist `ai_messages`/`ai_proposals` as the
 * caller under RLS → return the pending proposal.
 *
 * Invariants (AGENTS.md §5):
 * - no `service_role` anywhere: the Supabase client carries the caller's JWT,
 *   identity comes from `auth.getUser()`, never from a client `user_id`;
 * - secrets live only in function env (`supabase secrets set`); nothing in
 *   git or `VITE_*`; logs carry names/statuses, never keys, tokens or bodies;
 * - nothing is applied here: proposals are stored `pending`, apply/reject
 *   with re-validation lands in step 7.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import { parseProposal, toJsonSchema } from "../../../src/lib/aiProposals.ts";

import { ProviderError, type AiChatProvider, type ChatMessage } from "./provider.ts";
import {
  callOpenAiCompatible,
  DEFAULT_TIMEOUT_MS,
} from "./providers/openaiCompatible.ts";
import { createStubProvider } from "./providers/stub.ts";
import { parseChatRequestBody } from "./request.ts";
import { buildToolContext, TOOL_DEFINITIONS, type UserScopedClient } from "./tools.ts";

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

  const providerOrError = selectProvider();
  if (providerOrError instanceof Response) {
    return providerOrError;
  }
  const provider = providerOrError;

  // Tool context (skeleton reads until step 4) — called so the wiring, the
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

Deno.serve(async (req: Request): Promise<Response> => {
  try {
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
