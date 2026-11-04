/**
 * OpenAI-compatible Chat Completions caller (iteration 5, step 3).
 *
 * Talks to any `/v1/chat/completions` endpoint (the Meta Model API exposes
 * exactly this shape): structured output is requested via `response_format`
 * `{ type: "json_schema", json_schema: {...} }` built from `toJsonSchema()`.
 * The API key travels only in the Authorization header and never appears in
 * errors or logs. Every failure maps to `ProviderError` (`ai_unavailable`):
 * 401 invalid_api_key, 404 model_not_found, 429/5xx, timeouts and network
 * errors differ only in the log-safe message/status, never in the code.
 */

import { ProviderError, type ProviderChatInput } from "../provider.ts";

export interface OpenAiCompatibleEnv {
  /** Base URL without trailing slash, e.g. `https://api.meta.ai/v1`. */
  baseUrl: string;
  /** Model name comes ONLY from env (`AI_MODEL`); never hardcoded here. */
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 25000;

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Request body: model + messages + strict JSON Schema contract.
 * `tools` from the input describe capabilities to the caller; the contract
 * itself travels as `response_format` so the provider cannot drift.
 */
export function buildChatCompletionsBody(
  input: ProviderChatInput,
  model: string,
): Record<string, unknown> {
  return {
    model,
    messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assistant_proposal",
        strict: true,
        schema: input.jsonSchema,
      },
    },
  };
}

function toHttpProviderError(status: number, statusText: string): ProviderError {
  const suffix = statusText ? ` (${statusText})` : "";
  if (status === 401) {
    return new ProviderError(`provider rejected credentials (status 401)${suffix}`, { status });
  }
  if (status === 404) {
    return new ProviderError(`provider model not found (status 404)${suffix}`, { status });
  }
  if (status === 429) {
    return new ProviderError(`provider rate limit (status 429)${suffix}`, { status });
  }
  return new ProviderError(`provider request failed (status ${status})${suffix}`, { status });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * POST `{baseUrl}/chat/completions` and return the decoded `message.content`
 * as an unknown JSON value (validated later with `parseProposal`).
 * `fetchImpl` is injectable so tests never touch the network.
 */
export async function callOpenAiCompatible(
  input: ProviderChatInput,
  env: OpenAiCompatibleEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const url = `${trimTrailingSlash(env.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  input.signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionsBody(input, env.model)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw toHttpProviderError(response.status, response.statusText);
    }

    let data: unknown;
    try {
      data = (await response.json()) as unknown;
    } catch (error) {
      throw new ProviderError("provider returned a non-JSON response", {
        status: response.status,
        cause: error,
      });
    }

    const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new ProviderError("provider returned an empty message", { status: response.status });
    }

    try {
      return JSON.parse(content) as unknown;
    } catch (error) {
      throw new ProviderError("provider returned malformed JSON content", {
        status: response.status,
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderError(`provider timed out after ${env.timeoutMs}ms`, { cause: error });
    }
    throw new ProviderError("provider unreachable", { cause: error });
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onExternalAbort);
  }
}
