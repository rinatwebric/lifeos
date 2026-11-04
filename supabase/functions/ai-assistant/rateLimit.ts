/**
 * Chat rate limit (iteration 5, review fix a; PRD section 16 "limit requests").
 *
 * Counts the caller's own `ai_messages` with `role = 'user'` over the last
 * 24 hours through the user-scoped client (RLS stays the enforcement point,
 * no `user_id` argument is ever accepted) and blocks the provider call above
 * the cap with `429 rate_limited`. Recorded as Р10 in docs/plan-phase-4.md.
 *
 * Pure module (no Deno imports) so the boundary is unit-tested under Vitest
 * with a fake client; no network, no secrets here.
 */

/** Max user messages per rolling 24 h window (Р10). */
export const CHAT_RATE_LIMIT_MAX_MESSAGES_PER_DAY = 50;
/** Rolling window length in hours. */
export const CHAT_RATE_LIMIT_WINDOW_HOURS = 24;

export interface RateLimitQueryBuilder {
  select(
    columns: string,
    options?: { count?: string; head?: boolean },
  ): RateLimitQueryBuilder;
  eq(column: string, value: string): RateLimitQueryBuilder;
  gte(column: string, value: string): RateLimitQueryBuilder;
  then<TResult1 = { data: unknown; error: unknown; count?: number | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown; count?: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface RateLimitClient {
  from(table: string): RateLimitQueryBuilder;
}

export interface ChatRateLimitResult {
  allowed: boolean;
  count: number;
}

/** Rolling-window cutoff as an ISO instant (`now - 24h`). */
export function chatRateLimitCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - CHAT_RATE_LIMIT_WINDOW_HOURS * 3600 * 1000).toISOString();
}

/**
 * Count the caller's `user` messages since the cutoff. The client carries
 * the caller's JWT, so RLS restricts the count to the caller's own rows —
 * no `user_id` is read from arguments (same posture as tools.ts).
 *
 * Boundary: `count <= MAX` is allowed (50 ok, 51 blocked). Fail-open on
 * storage errors (log, allow) so a counting hiccup never bricks the chat;
 * the provider call itself stays the cost gate via the cap on success.
 */
export async function checkChatRateLimit(
  client: RateLimitClient,
  now: Date = new Date(),
): Promise<ChatRateLimitResult> {
  const cutoff = chatRateLimitCutoffIso(now);
  try {
    const result = await client
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", cutoff);
    if (result.error) {
      console.error("[ai-assistant] rate-limit count failed, allowing", {
        message: result.error instanceof Error ? result.error.message : "unknown",
      });
      return { allowed: true, count: 0 };
    }
    const count =
      typeof result.count === "number"
        ? result.count
        : Array.isArray(result.data)
          ? result.data.length
          : 0;
    return { allowed: count <= CHAT_RATE_LIMIT_MAX_MESSAGES_PER_DAY, count };
  } catch (error) {
    console.error("[ai-assistant] rate-limit count threw, allowing", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { allowed: true, count: 0 };
  }
}
