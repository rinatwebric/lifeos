/**
 * Serialized proposal claim (iteration 5, fix for parallel approves).
 *
 * Pure module (no Deno imports) so the claim pattern is unit-tested under
 * Vitest. The Edge Function (`index.ts`) owns the full approve flow; this
 * module owns only the atomic compare-and-swap:
 * `UPDATE ai_proposals SET approved + applied_at WHERE id + user_id + pending`
 * with a `select` so 0 rows means "someone else already decided".
 *
 * Why a separate module: `index.ts` reads `Deno.env` at import time, so
 * Vitest cannot import it. The claim itself is plain PostgREST — testable
 * here with a fake client, applied for real there with the user-scoped
 * client (RLS stays the enforcement point).
 */

export interface ApproveQueryBuilder {
  update(patch: Record<string, unknown>): ApproveQueryBuilder;
  eq(column: string, value: string): ApproveQueryBuilder;
  select(columns?: string): ApproveQueryBuilder;
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface ApproveClaimClient {
  from(table: string): ApproveQueryBuilder;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "already_decided" | "db_error" };

/**
 * Atomic claim: only a `pending` row flips to `approved + applied_at`.
 * 0 matched rows → `already_decided` (concurrent winner or an earlier
 * decision); storage errors fail closed as `db_error`.
 */
export async function claimProposal(
  client: ApproveClaimClient,
  proposalId: string,
  userId: string,
  nowIso: string,
): Promise<ClaimResult> {
  try {
    const result = await client
      .from("ai_proposals")
      .update({ status: "approved", applied_at: nowIso })
      .eq("id", proposalId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id");
    if (result.error) {
      return { ok: false, reason: "db_error" };
    }
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 0) {
      return { ok: false, reason: "already_decided" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "db_error" };
  }
}

/**
 * Rollback after a mid-apply failure: the claim is released back to
 * `pending` with `applied_at` cleared (symmetric CHECK stays satisfied).
 * Best effort — a rollback failure is reported, never thrown.
 */
export async function releaseClaim(
  client: ApproveClaimClient,
  proposalId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  try {
    const result = await client
      .from("ai_proposals")
      .update({ status: "pending", applied_at: null })
      .eq("id", proposalId)
      .eq("user_id", userId);
    if (result.error) {
      return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
