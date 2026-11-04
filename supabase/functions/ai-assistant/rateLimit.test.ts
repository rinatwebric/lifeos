import { describe, expect, it } from "vitest";

import {
  CHAT_RATE_LIMIT_MAX_MESSAGES_PER_DAY,
  chatRateLimitCutoffIso,
  checkChatRateLimit,
  type RateLimitClient,
} from "./rateLimit.ts";

/** Fake user-scoped client: count is the whole answer (RLS already applied). */
function fakeClientWithCount(count: number): RateLimitClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    then: (
      resolve: (value: { data: unknown; error: unknown; count: number }) => unknown,
    ) => Promise.resolve({ data: [], error: null, count }).then(resolve),
  };
  return { from: () => builder };
}

describe("chat rate limit (R10)", () => {
  it("allows 49 and 50 user messages, blocks 51", async () => {
    expect(CHAT_RATE_LIMIT_MAX_MESSAGES_PER_DAY).toBe(50);
    for (const count of [49, 50]) {
      const result = await checkChatRateLimit(fakeClientWithCount(count));
      expect(result.allowed, `count ${count} must be allowed`).toBe(true);
      expect(result.count).toBe(count);
    }
    const blocked = await checkChatRateLimit(fakeClientWithCount(51));
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(51);
  });

  it("cutoff is exactly 24h before now", () => {
    const now = new Date("2026-11-04T12:00:00.000Z");
    expect(chatRateLimitCutoffIso(now)).toBe("2026-11-03T12:00:00.000Z");
  });

  it("fail-open when the count query errors", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ data: null, error: new Error("db down"), count: null }),
          }),
        }),
      }),
    } as unknown as RateLimitClient;
    const result = await checkChatRateLimit(failing);
    expect(result.allowed).toBe(true);
  });
});
