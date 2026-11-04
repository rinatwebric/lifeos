/**
 * Provider-independent chat interface (iteration 5, step 3; PRD §6.3, §10).
 *
 * The Edge Function never talks to a concrete model directly: it picks an
 * `AiChatProvider` from `AI_PROVIDER` (`stub` | `openai-compatible`) and the
 * provider receives the user messages, the tool definitions and the strict
 * JSON Schema from step 2 (`toJsonSchema()`). Secrets stay in function env
 * and never reach this interface — only `openaiCompatible.ts` reads
 * `AI_API_KEY`, and only into an Authorization header.
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema fragment describing the tool input (informational for now). */
  inputSchema: Record<string, unknown>;
}

export interface ProviderChatInput {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  /** Exact output of `toJsonSchema()` from `src/lib/aiProposals.ts`. */
  jsonSchema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AiChatProvider {
  readonly name: string;
  chat(input: ProviderChatInput): Promise<unknown>;
}

/** Single public code for every provider-side failure (PRD §16, AI API). */
export const AI_UNAVAILABLE = "ai_unavailable" as const;
export type AiUnavailableCode = typeof AI_UNAVAILABLE;

/**
 * Provider failure. `code` is always `ai_unavailable` so the frontend needs
 * one branch; `status` keeps the upstream HTTP status for logs only.
 * The message never contains secrets (no API keys, no tokens, no bodies).
 */
export class ProviderError extends Error {
  readonly code: AiUnavailableCode = AI_UNAVAILABLE;
  readonly status?: number;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "ProviderError";
    this.status = options?.status;
  }
}
