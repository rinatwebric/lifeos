import { describe, expect, it, vi } from "vitest";

import { toJsonSchema } from "../../../../src/lib/aiProposals";

import { ProviderError } from "../provider.ts";
import {
  callOpenAiCompatible,
  type OpenAiCompatibleEnv,
} from "./openaiCompatible.ts";

const ENV: OpenAiCompatibleEnv = {
  baseUrl: "https://api.example.test/v1",
  model: "test-model",
  apiKey: "test-key",
  timeoutMs: 1000,
};

const INPUT = {
  messages: [{ role: "user" as const, content: "Plan my week" }],
  tools: [],
  jsonSchema: toJsonSchema() as unknown as Record<string, unknown>,
};

function okResponse(content: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  } as unknown as Response;
}

function rawResponse(content: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

function errorResponse(status: number, statusText: string): Response {
  return { ok: false, status, statusText } as unknown as Response;
}

describe("openaiCompatible provider", () => {
  it("sends response_format json_schema built from toJsonSchema()", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ proposalType: "task_creation" }));
    const result = await callOpenAiCompatible(INPUT, ENV, fetchImpl);
    expect(result).toStrictEqual({ proposalType: "task_creation" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("test-model");
    const format = body.response_format as Record<string, unknown>;
    expect(format.type).toBe("json_schema");
    expect((format.json_schema as Record<string, unknown>).schema).toStrictEqual(
      toJsonSchema(),
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("accepts a JSON payload wrapped in a markdown fence", async () => {
    const fetchImpl = vi.fn(async () =>
      rawResponse('```json\n{"proposalType":"task_creation","actions":[]}\n```'),
    );

    await expect(callOpenAiCompatible(INPUT, ENV, fetchImpl)).resolves.toStrictEqual({
      proposalType: "task_creation",
      actions: [],
    });
  });

  it("accepts a JSON payload with a sentence around it", async () => {
    const fetchImpl = vi.fn(async () =>
      rawResponse('Вот план: {"proposalType":"task_creation"} — готово.'),
    );

    await expect(callOpenAiCompatible(INPUT, ENV, fetchImpl)).resolves.toStrictEqual({
      proposalType: "task_creation",
    });
  });

  it("still rejects content that contains no JSON at all", async () => {
    const fetchImpl = vi.fn(async () => rawResponse("Извините, сейчас не могу помочь."));
    const failure = await callOpenAiCompatible(INPUT, ENV, fetchImpl).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).message).toContain("malformed JSON");
  });

  it("maps 401 invalid_api_key to ai_unavailable", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(401, "Unauthorized"));
    const failure = await callOpenAiCompatible(INPUT, ENV, fetchImpl).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).code).toBe("ai_unavailable");
    expect((failure as ProviderError).status).toBe(401);
  });

  it("maps 404 model_not_found to ai_unavailable", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(404, "Not Found"));
    const failure = await callOpenAiCompatible(INPUT, ENV, fetchImpl).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).code).toBe("ai_unavailable");
    expect((failure as ProviderError).status).toBe(404);
  });

  it("maps 429 and 5xx to ai_unavailable", async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn(async () => errorResponse(status, "Error"));
      const failure = await callOpenAiCompatible(INPUT, ENV, fetchImpl).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ProviderError);
      expect((failure as ProviderError).code).toBe("ai_unavailable");
      expect((failure as ProviderError).status).toBe(status);
    }
  });

  it("maps timeout aborts to ai_unavailable without leaking the key", async () => {
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const failure = await callOpenAiCompatible(INPUT, { ...ENV, timeoutMs: 5 }, fetchImpl).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).code).toBe("ai_unavailable");
    expect(String((failure as Error).message)).not.toContain("test-key");
  });

  it("maps network failure to ai_unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const failure = await callOpenAiCompatible(INPUT, ENV, fetchImpl).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).code).toBe("ai_unavailable");
  });

  it("rejects empty and malformed provider content", async () => {
    const empty = vi.fn(async () => rawResponse(""));
    await expect(callOpenAiCompatible(INPUT, ENV, empty)).rejects.toMatchObject({
      code: "ai_unavailable",
    });
    const malformed = vi.fn(async () => rawResponse("{oops"));
    await expect(callOpenAiCompatible(INPUT, ENV, malformed)).rejects.toMatchObject({
      code: "ai_unavailable",
    });
  });

  it("never includes the key in error messages", async () => {
    const fetchImpl = vi.fn(async () => errorResponse(500, "Internal Server Error"));
    const failure = (await callOpenAiCompatible(INPUT, ENV, fetchImpl).then(
      () => null,
      (error: unknown) => error,
    )) as Error;
    expect(String(failure.message)).not.toContain("test-key");
  });
});
