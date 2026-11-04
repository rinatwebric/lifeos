import { describe, expect, it } from "vitest";

import { claimProposal, releaseClaim, type ApproveClaimClient } from "./approve.ts";

interface ProposalRow {
  id: string;
  user_id: string;
  status: string;
  applied_at: string | null;
}

interface FakeDb {
  proposals: Map<string, ProposalRow>;
  failNext?: boolean;
}

class FakeQuery {
  private patch: Record<string, unknown> | null = null;
  private filters: Array<{ col: string; value: string }> = [];

  constructor(
    private readonly table: string,
    private readonly db: FakeDb,
  ) {}

  update(patch: Record<string, unknown>): this {
    this.patch = patch;
    return this;
  }

  eq(col: string, value: string): this {
    this.filters.push({ col, value });
    return this;
  }

  select(): this {
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    let result: { data: unknown; error: unknown };
    if (this.db.failNext) {
      this.db.failNext = false;
      result = { data: null, error: { message: "db down" } };
    } else if (this.table !== "ai_proposals") {
      result = { data: [], error: null };
    } else {
      const rows = [...this.db.proposals.values()].filter((row) =>
        this.filters.every((filter) => (row as unknown as Record<string, unknown>)[filter.col] === filter.value),
      );
      if (this.patch !== null) {
        if (rows.length === 0) {
          result = { data: [], error: null };
        } else {
          for (const row of rows) {
            if (this.patch["status"] !== undefined) {
              row.status = this.patch["status"] as string;
            }
            if ("applied_at" in this.patch) {
              row.applied_at = this.patch["applied_at"] as string | null;
            }
          }
          result = { data: rows.map((row) => ({ id: row.id })), error: null };
        }
      } else {
        result = { data: rows, error: null };
      }
    }
    return Promise.resolve(result).then(onfulfilled, onrejected ?? undefined);
  }
}

function fakeClient(db: FakeDb): ApproveClaimClient {
  return {
    from: (table: string) => new FakeQuery(table, db) as unknown as ReturnType<ApproveClaimClient["from"]>,
  };
}

const PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";

function pendingDb(): FakeDb {
  return {
    proposals: new Map([
      [PROPOSAL_ID, { id: PROPOSAL_ID, user_id: "user-1", status: "pending", applied_at: null }],
    ]),
  };
}

describe("proposal claim serialization", () => {
  it("два параллельных approve применяют действия один раз", async () => {
    const db = pendingDb();
    const client = fakeClient(db);
    const nowIso = new Date("2026-11-04T12:00:00.000Z").toISOString();

    let applyCalls = 0;
    async function fakeApply(claim: { ok: boolean }): Promise<void> {
      if (claim) {
        applyCalls += 1;
      }
    }

    const [first, second] = await Promise.all([
      claimProposal(client, PROPOSAL_ID, "user-1", nowIso),
      claimProposal(client, PROPOSAL_ID, "user-1", nowIso),
    ]);

    const winners = [first, second].filter((result) => result.ok);
    const losers = [first, second].filter((result) => !result.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toStrictEqual({ ok: false, reason: "already_decided" });

    for (const result of [first, second]) {
      if (result.ok) {
        await fakeApply(true);
      }
    }
    expect(applyCalls).toBe(1);
    expect(db.proposals.get(PROPOSAL_ID)).toMatchObject({ status: "approved", applied_at: nowIso });
  });

  it("откат возвращает pending при сбое посреди apply", async () => {
    const db = pendingDb();
    const client = fakeClient(db);
    const nowIso = new Date("2026-11-04T12:00:00.000Z").toISOString();

    const claim = await claimProposal(client, PROPOSAL_ID, "user-1", nowIso);
    expect(claim).toStrictEqual({ ok: true });
    expect(db.proposals.get(PROPOSAL_ID)).toMatchObject({ status: "approved" });

    let applied = 0;
    async function failingApply(): Promise<void> {
      applied += 1;
      if (applied === 2) {
        throw new Error("Task insert failed");
      }
    }

    try {
      await failingApply();
      await failingApply();
    } catch {
      const released = await releaseClaim(client, PROPOSAL_ID, "user-1");
      expect(released).toStrictEqual({ ok: true });
    }

    expect(applied).toBe(2);
    expect(db.proposals.get(PROPOSAL_ID)).toMatchObject({ status: "pending", applied_at: null });
  });

  it("second claim after a rollback can win again", async () => {
    const db = pendingDb();
    const client = fakeClient(db);
    const nowIso = new Date("2026-11-04T12:00:00.000Z").toISOString();

    expect(await claimProposal(client, PROPOSAL_ID, "user-1", nowIso)).toStrictEqual({ ok: true });
    expect(await releaseClaim(client, PROPOSAL_ID, "user-1")).toStrictEqual({ ok: true });
    expect(await claimProposal(client, PROPOSAL_ID, "user-1", nowIso)).toStrictEqual({ ok: true });
    expect(db.proposals.get(PROPOSAL_ID)).toMatchObject({ status: "approved" });
  });
});
